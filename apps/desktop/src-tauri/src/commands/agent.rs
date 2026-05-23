use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager, State};
use uuid::Uuid;

const AGENT_EVENT: &str = "coding_agent_event";
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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
    let bundled_skills_path = super::skills::bundled_skills_path(&app)?.map(|path| path_for_node(&path));
    let node_binary = resolve_node_binary(&app)?;
    let bridge_dir = bridge_path.parent().map(PathBuf::from);
    let agent_dir = app.path().app_data_dir().ok().map(|path| path.join("pi-agent"));
    if let Some(agent_dir) = &agent_dir {
        let _ = fs::create_dir_all(agent_dir);
    }

    append_agent_diagnostic(
        &app,
        format!(
            "start task={task_id} workspace={} node={} node_exists={} bridge={} bridge_exists={} skills={} agent_dir={}",
            input.workspace_path,
            node_binary.display(),
            node_binary.exists(),
            bridge_path.display(),
            bridge_path.exists(),
            bundled_skills_path.as_deref().unwrap_or("<none>"),
            agent_dir
                .as_ref()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_else(|| "<none>".to_string()),
        ),
    );

    let node_binary_arg = path_for_node(&node_binary);
    let bridge_path_arg = path_for_node(&bridge_path);
    let mut command = Command::new(&node_binary_arg);
    command
        .arg(&bridge_path_arg)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(bridge_dir) = &bridge_dir {
        command.env("PI_PACKAGE_DIR", path_for_node(bridge_dir));
    }
    if let Some(agent_dir) = &agent_dir {
        command.env("PI_CODING_AGENT_DIR", path_for_node(agent_dir));
    }
    hide_subprocess_window(&mut command);

    let mut child = command
        .spawn()
        .map_err(|error| {
            append_agent_diagnostic(
                &app,
                format!("spawn failed task={task_id} error={error}"),
            );
            format!(
                "启动 Coding Agent bridge 失败：{error}。Node 路径：{}",
                node_binary.display()
            )
        })?;

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

fn resolve_node_binary(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var("NOVEL_CLAW_NODE") {
        let path = PathBuf::from(path);
        if path.exists() {
            return Ok(path);
        }
    }

    let bundled_names = if cfg!(windows) {
        vec!["node.exe"]
    } else {
        vec!["node"]
    };

    for name in bundled_names {
        for candidate in [
            format!("_up_/agent-bridge/dist/{name}"),
            format!("agent-bridge/dist/{name}"),
            format!("dist/{name}"),
            name.to_string(),
        ] {
            let path = app
                .path()
                .resolve(&candidate, BaseDirectory::Resource)
                .map_err(|error| format!("定位 Node 运行时失败：{error}"))?;
            if path.exists() {
                return Ok(path);
            }
        }
    }

    Ok(PathBuf::from("node"))
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

    for candidate in [
        "_up_/agent-bridge/dist/index.js",
        "agent-bridge/dist/index.js",
        "dist/index.js",
        "index.js",
    ] {
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

fn append_agent_diagnostic(app: &AppHandle, message: impl AsRef<str>) {
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let _ = fs::create_dir_all(&dir);
    let path = dir.join("agent-bridge.log");
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    let _ = writeln!(file, "[{timestamp}] {}", message.as_ref());
}

fn path_for_node(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{rest}");
    }
    if let Some(rest) = value.strip_prefix(r"\\?\") {
        return rest.to_string();
    }
    value.to_string()
}

#[cfg(windows)]
fn hide_subprocess_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;

    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_subprocess_window(_command: &mut Command) {}

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
