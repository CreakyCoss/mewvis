use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager, State};
use uuid::Uuid;

const AGENT_EVENT: &str = "coding_agent_event";

#[derive(Default)]
pub struct CodingAgentTasks {
    tasks: Arc<Mutex<HashMap<String, Arc<CodingAgentProcess>>>>,
}

pub struct CodingAgentProcess {
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodingAgentProviderInput {
    id: String,
    name: String,
    vendor: String,
    provider: String,
    api_key: Option<String>,
    base_url: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodingAgentModelInput {
    id: String,
    model_id: String,
    model_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartCodingAgentTaskInput {
    workspace_path: String,
    prompt: String,
    provider: CodingAgentProviderInput,
    model: CodingAgentModelInput,
    allowed_tools: Option<Vec<String>>,
    enabled_skills: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartCodingAgentTaskOutput {
    task_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerCodingAgentQuestionInput {
    task_id: String,
    question_id: String,
    answer: String,
}

#[tauri::command]
pub fn start_coding_agent_task(
    app: AppHandle,
    state: State<CodingAgentTasks>,
    input: StartCodingAgentTaskInput,
) -> Result<StartCodingAgentTaskOutput, String> {
    validate_start_input(&input)?;

    let task_id = Uuid::now_v7().to_string();
    let bridge_path = resolve_agent_bridge_path(&app)?;
    let bundled_skills_path =
        super::skills::bundled_skills_path(&app)?.map(|path| path.to_string_lossy().to_string());
    let mut child = Command::new(resolve_node_binary())
        .arg(bridge_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("启动 Coding Agent bridge 失败：{error}"))?;

    let command = json!({
        "type": "start_task",
        "taskId": task_id,
        "workspacePath": input.workspace_path,
        "prompt": input.prompt,
        "provider": input.provider,
        "model": input.model,
        "bundledSkillsPath": bundled_skills_path,
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
        .ok_or_else(|| "Coding Agent bridge stdin 不可用".to_string())?;
    writeln!(stdin, "{command}").map_err(|error| format!("发送 Coding Agent 任务失败：{error}"))?;

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
                                "message": format!("读取 Coding Agent 输出失败：{error}"),
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

    let process = Arc::new(CodingAgentProcess {
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
    });
    state
        .tasks
        .lock()
        .map_err(|_| "Coding Agent 任务状态已损坏".to_string())?
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

        if let Ok(mut tasks) = tasks_for_wait.lock() {
            tasks.remove(&task_id_for_wait);
        }
    });

    Ok(StartCodingAgentTaskOutput { task_id })
}

#[tauri::command]
pub fn answer_coding_agent_question(
    state: State<CodingAgentTasks>,
    input: AnswerCodingAgentQuestionInput,
) -> Result<(), String> {
    let task = state
        .tasks
        .lock()
        .map_err(|_| "Coding Agent 任务状态已损坏".to_string())?
        .get(&input.task_id)
        .cloned()
        .ok_or_else(|| "Coding Agent 任务不存在或已结束".to_string())?;

    let command = json!({
        "type": "answer_question",
        "taskId": input.task_id,
        "questionId": input.question_id,
        "answer": input.answer,
    });

    let mut stdin = task
        .stdin
        .lock()
        .map_err(|_| "Coding Agent 输入通道已无法访问".to_string())?;
    writeln!(stdin, "{command}").map_err(|error| format!("发送用户回答失败：{error}"))?;
    stdin
        .flush()
        .map_err(|error| format!("刷新用户回答失败：{error}"))?;

    Ok(())
}

#[tauri::command]
pub fn abort_coding_agent_task(
    state: State<CodingAgentTasks>,
    task_id: String,
) -> Result<(), String> {
    let task = state
        .tasks
        .lock()
        .map_err(|_| "Coding Agent 任务状态已损坏".to_string())?
        .remove(&task_id);

    if let Some(task) = task {
        task.child
            .lock()
            .map_err(|_| "Coding Agent 任务进程已无法访问".to_string())?
            .kill()
            .map_err(|error| format!("终止 Coding Agent 任务失败：{error}"))?;
    }

    Ok(())
}

fn validate_start_input(input: &StartCodingAgentTaskInput) -> Result<(), String> {
    if input.workspace_path.trim().is_empty() {
        return Err("工作区路径不能为空".to_string());
    }

    if input.prompt.trim().is_empty() {
        return Err("Agent 任务内容不能为空".to_string());
    }

    if input.model.model_id.trim().is_empty() {
        return Err("请选择 Agent 使用的模型".to_string());
    }

    Ok(())
}

fn resolve_node_binary() -> String {
    std::env::var("NOVEL_CLAW_NODE").unwrap_or_else(|_| "node".to_string())
}

fn resolve_agent_bridge_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var("NOVEL_CLAW_AGENT_BRIDGE") {
        let path = PathBuf::from(path);
        if path.exists() {
            return Ok(path);
        }
    }

    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../agent-bridge/dist/index.js")
        .clean();
    if dev_path.exists() {
        return Ok(dev_path);
    }

    for candidate in ["agent-bridge/dist/index.js", "dist/index.js", "index.js"] {
        let path = app
            .path()
            .resolve(candidate, BaseDirectory::Resource)
            .map_err(|error| format!("定位 Coding Agent bridge 失败：{error}"))?;
        if path.exists() {
            return Ok(path);
        }
    }

    Err("未找到 Coding Agent bridge，请先运行 pnpm --filter desktop build:agent-bridge".to_string())
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
                "message": format!("解析 Coding Agent 输出失败：{error}"),
                "raw": line,
            }),
        ),
    }
}

fn emit_agent_event(app: &AppHandle, event: Value) {
    let _ = app.emit(AGENT_EVENT, event);
}

trait CleanPath {
    fn clean(self) -> Self;
}

impl CleanPath for PathBuf {
    fn clean(self) -> Self {
        let mut cleaned = PathBuf::new();
        for component in self.components() {
            cleaned.push(component);
        }
        cleaned
    }
}
