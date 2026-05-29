use super::{
    bridge::{append_agent_diagnostic, path_for_node},
    events::{emit_agent_event, emit_bridge_line},
    process::{
        build_agent_bridge_command, resolve_agent_bridge_process_config, spawn_agent_bridge_command,
    },
    skills::{bundled_skills_path_for_bridge, workspace_skill_paths_for_bridge},
    task_state::AgentRuntimeAgentTasks,
    types::{AgentRuntimeModelInput, AgentRuntimeProviderInput},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAgentRuntimeAgentInput {
    agent_id: Option<String>,
    workspace_path: String,
    chat_session_id: Option<String>,
    prompt: String,
    bootstrap_context: Option<String>,
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
    let bundled_skills_path = bundled_skills_path_for_bridge(&app)?;
    let skill_paths = workspace_skill_paths_for_bridge(&input.workspace_path);
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
        "chatSessionId": input.chat_session_id,
        "prompt": input.prompt,
        "bootstrapContext": input.bootstrap_context,
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

    let process = state.insert(task_id.clone(), child, stdin)?;

    let app_for_wait = app.clone();
    let task_id_for_wait = task_id.clone();
    let tasks_for_wait = state.inner().clone();
    thread::spawn(move || {
        let status = loop {
            if let Some(status) = process.try_wait() {
                break status;
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

        tasks_for_wait.remove(&task_id_for_wait);
    });

    Ok(RunAgentRuntimeAgentOutput { task_id })
}

#[tauri::command]
pub fn answer_agent_runtime_question(
    state: State<AgentRuntimeAgentTasks>,
    input: AnswerAgentRuntimeQuestionInput,
) -> Result<(), String> {
    let command = json!({
        "type": "answer_question",
        "taskId": input.task_id,
        "questionId": input.question_id,
        "answer": input.answer,
    });

    state.answer_question(&input.task_id, &command)
}

#[tauri::command]
pub fn abort_agent_runtime_agent(
    state: State<AgentRuntimeAgentTasks>,
    task_id: String,
) -> Result<(), String> {
    state.abort(&task_id)
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
