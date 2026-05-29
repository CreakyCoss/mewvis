use super::{
    bridge::{append_agent_diagnostic, path_for_node, CleanPath},
    process::{
        build_agent_bridge_command, resolve_agent_bridge_process_config, spawn_agent_bridge_command,
    },
    types::{AgentRuntimeModelInput, AgentRuntimeProviderInput},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

const AGENT_RUNTIME_AGENT_EVENT: &str = "agent_runtime_agent_event";

#[derive(Default)]
pub struct AgentRuntimeAgentTasks {
    tasks: Arc<Mutex<HashMap<String, Arc<AgentRuntimeAgentProcess>>>>,
}

pub struct AgentRuntimeAgentProcess {
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAgentRuntimeAgentInput {
    agent_id: Option<String>,
    workspace_path: String,
    prompt: String,
    provider: Option<AgentRuntimeProviderInput>,
    model: Option<AgentRuntimeModelInput>,
    allowed_tools: Option<Vec<String>>,
    enabled_skills: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAgentRuntimeAgentOutput {
    task_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerAgentRuntimeQuestionInput {
    task_id: String,
    question_id: String,
    answer: String,
}

#[tauri::command]
pub fn run_agent_runtime_agent(
    app: AppHandle,
    state: State<AgentRuntimeAgentTasks>,
    input: RunAgentRuntimeAgentInput,
) -> Result<RunAgentRuntimeAgentOutput, String> {
    validate_agent_input(&input)?;

    let task_id = Uuid::now_v7().to_string();
    let bridge_process = resolve_agent_bridge_process_config(&app)?;
    let bundled_skills_path =
        super::super::skills::bundled_skills_path(&app)?.map(|path| path_for_node(&path));
    let skill_paths = workspace_skill_paths(&input.workspace_path)
        .into_iter()
        .map(|path| path_for_node(&path))
        .collect::<Vec<_>>();
    let agent_dir = app
        .path()
        .app_data_dir()
        .ok()
        .map(|path| path.join("pi-agent"));
    if let Some(agent_dir) = &agent_dir {
        let _ = fs::create_dir_all(agent_dir);
    }

    append_agent_diagnostic(
        &app,
        format!(
            "start task={task_id} workspace={} node={} node_exists={} bridge={} bridge_exists={} bundled_skills={} workspace_skills={} agent_dir={}",
            input.workspace_path,
            bridge_process.node_binary.display(),
            bridge_process.node_binary.exists(),
            bridge_process.bridge_path.display(),
            bridge_process.bridge_path.exists(),
            bundled_skills_path.as_deref().unwrap_or("<none>"),
            if skill_paths.is_empty() {
                "<none>".to_string()
            } else {
                skill_paths.join(",")
            },
            agent_dir
                .as_ref()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_else(|| "<none>".to_string()),
        ),
    );

    let extra_env = agent_dir
        .as_ref()
        .map(|path| vec![("PI_CODING_AGENT_DIR".to_string(), path_for_node(path))])
        .unwrap_or_default();
    let command = build_agent_bridge_command(&bridge_process, extra_env);
    let mut child = spawn_agent_bridge_command(
        &app,
        command,
        "Agent runtime bridge",
        &bridge_process.node_binary,
        format!("task={task_id}"),
    )?;

    let command = json!({
        "type": "start_task",
        "agentId": input.agent_id,
        "taskId": task_id,
        "workspacePath": input.workspace_path,
        "prompt": input.prompt,
        "provider": input.provider,
        "model": input.model,
        "bundledSkillsPath": bundled_skills_path,
        "skillPaths": skill_paths,
        "enabledSkills": input.enabled_skills.unwrap_or_default(),
        "allowedTools": input.allowed_tools.unwrap_or_else(|| {
            vec![
                "read".to_string(),
                "edit".to_string(),
                "write".to_string(),
                "ls".to_string(),
                "find".to_string(),
                "grep".to_string(),
                "ask_user".to_string(),
            ]
        }),
    });

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Agent runtime bridge stdin 不可用".to_string())?;
    writeln!(stdin, "{command}")
        .map_err(|error| format!("发送 Agent runtime agent 任务失败：{error}"))?;

    if let Some(stdout) = child.stdout.take() {
        let app = app.clone();
        let task_id = task_id.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(line) => emit_bridge_line(&app, &task_id, &line),
                    Err(error) => {
                        emit_agent_event(
                            &app,
                            json!({
                                "type": "error",
                                "taskId": task_id,
                                "message": format!("读取 Agent runtime agent 输出失败：{error}"),
                            }),
                        );
                        break;
                    }
                }
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app = app.clone();
        let task_id = task_id.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                append_agent_diagnostic(&app, format!("stderr task={task_id} {line}"));
                emit_agent_event(
                    &app,
                    json!({
                        "type": "stderr",
                        "taskId": task_id,
                        "message": line,
                    }),
                );
            }
        });
    }

    let process = Arc::new(AgentRuntimeAgentProcess {
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
    });
    state
        .tasks
        .lock()
        .map_err(|_| "Agent runtime agent 任务状态已损坏".to_string())?
        .insert(task_id.clone(), process.clone());

    let app_for_wait = app.clone();
    let task_id_for_wait = task_id.clone();
    let tasks_for_wait = state.inner().tasks.clone();
    thread::spawn(move || {
        let status = loop {
            if let Ok(mut child) = process.child.lock() {
                if let Ok(Some(status)) = child.try_wait() {
                    break status;
                }
            }

            thread::sleep(Duration::from_millis(200));
        };
        emit_agent_event(
            &app_for_wait,
            json!({
                "type": "exit",
                "taskId": task_id_for_wait,
                "success": status.success(),
                "code": status.code(),
            }),
        );
        append_agent_diagnostic(
            &app_for_wait,
            format!(
                "exit task={task_id_for_wait} success={} code={:?}",
                status.success(),
                status.code(),
            ),
        );

        if let Ok(mut tasks) = tasks_for_wait.lock() {
            tasks.remove(&task_id_for_wait);
        }
    });

    Ok(RunAgentRuntimeAgentOutput { task_id })
}

fn workspace_skill_paths(workspace_path: &str) -> Vec<PathBuf> {
    let workspace = PathBuf::from(workspace_path);

    [".novel-claw/skills", ".codex/skills", ".agents/skills"]
        .into_iter()
        .map(|path| workspace.join(path).clean())
        .filter(|path| path.exists() && path.is_dir())
        .collect()
}

#[tauri::command]
pub fn answer_agent_runtime_question(
    state: State<AgentRuntimeAgentTasks>,
    input: AnswerAgentRuntimeQuestionInput,
) -> Result<(), String> {
    let task = state
        .tasks
        .lock()
        .map_err(|_| "Agent runtime agent 任务状态已损坏".to_string())?
        .get(&input.task_id)
        .cloned()
        .ok_or_else(|| "Agent runtime agent 任务不存在或已结束".to_string())?;

    let command = json!({
        "type": "answer_question",
        "taskId": input.task_id,
        "questionId": input.question_id,
        "answer": input.answer,
    });

    let mut stdin = task
        .stdin
        .lock()
        .map_err(|_| "Agent runtime agent 输入通道已无法访问".to_string())?;
    writeln!(stdin, "{command}").map_err(|error| format!("发送用户回答失败：{error}"))?;
    stdin
        .flush()
        .map_err(|error| format!("刷新用户回答失败：{error}"))?;

    Ok(())
}

#[tauri::command]
pub fn abort_agent_runtime_agent(
    state: State<AgentRuntimeAgentTasks>,
    task_id: String,
) -> Result<(), String> {
    let task = state
        .tasks
        .lock()
        .map_err(|_| "Agent runtime agent 任务状态已损坏".to_string())?
        .remove(&task_id);

    if let Some(task) = task {
        task.child
            .lock()
            .map_err(|_| "Agent runtime agent 任务进程已无法访问".to_string())?
            .kill()
            .map_err(|error| format!("终止 Agent runtime agent 任务失败：{error}"))?;
    }

    Ok(())
}

fn validate_agent_input(input: &RunAgentRuntimeAgentInput) -> Result<(), String> {
    if input.workspace_path.trim().is_empty() {
        return Err("工作区路径不能为空".to_string());
    }

    if input.prompt.trim().is_empty() {
        return Err("Agent 任务内容不能为空".to_string());
    }

    Ok(())
}

fn emit_bridge_line(app: &AppHandle, task_id: &str, line: &str) {
    match serde_json::from_str::<Value>(line) {
        Ok(mut value) => {
            if value.get("taskId").is_none() {
                value["taskId"] = Value::String(task_id.to_string());
            }
            emit_agent_event(app, value);
        }
        Err(error) => emit_agent_event(
            app,
            json!({
                "type": "error",
                "taskId": task_id,
                "message": format!("解析 Agent runtime agent 输出失败：{error}"),
                "raw": line,
            }),
        ),
    }
}

fn emit_agent_event(app: &AppHandle, event: Value) {
    let _ = app.emit(AGENT_RUNTIME_AGENT_EVENT, event);
}
