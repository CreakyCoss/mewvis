use super::{
    bridge::append_agent_diagnostic,
    session_paths::resolve_optional_session_root_dir,
    skills::{
        app_skill_paths_for_bridge, bundled_skills_path_for_bridge,
        workspace_skill_paths_for_bridge,
    },
    supervisor::{AgentRuntimeSupervisor, AgentTaskSubmission},
    types::AgentRuntimeModelInput,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, State};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAgentRuntimeAgentInput {
    agent_id: Option<String>,
    workspace_path: String,
    chat_session_id: Option<String>,
    session_root_dir: Option<String>,
    agent_role_id: Option<String>,
    user_message: String,
    system_prompt: Option<String>,
    request_context: Option<String>,
    runtime_instruction: Option<String>,
    bootstrap_instruction: Option<String>,
    runtime_model: Option<AgentRuntimeModelInput>,
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
    state: State<AgentRuntimeSupervisor>,
    input: RunAgentRuntimeAgentInput,
) -> Result<RunAgentRuntimeAgentOutput, String> {
    validate_agent_input(&input)?;

    let task_id = Uuid::now_v7().to_string();
    let bundled_skills_path = bundled_skills_path_for_bridge(&app)?;
    let mut skill_paths = app_skill_paths_for_bridge(&app)?;
    skill_paths.extend(workspace_skill_paths_for_bridge(&input.workspace_path));
    let session_root_dir = resolve_optional_session_root_dir(
        Some(&input.workspace_path),
        input.session_root_dir.as_deref(),
    )?;
    let session_key = session_key_for_task(&input, &task_id, session_root_dir.as_deref());

    append_agent_diagnostic(
        &app,
        format!(
            "submit task={task_id} session_key={} workspace={} bundled_skills={} extra_skill_paths={}",
            session_key,
            input.workspace_path,
            bundled_skills_path.as_deref().unwrap_or("<none>"),
            if skill_paths.is_empty() {
                "<none>".to_string()
            } else {
                skill_paths.join(",")
            },
        ),
    );

    let allowed_tools = input.allowed_tools.unwrap_or_else(|| {
        vec![
            "read".to_string(),
            "edit".to_string(),
            "write".to_string(),
            "ls".to_string(),
            "find".to_string(),
            "grep".to_string(),
            "ask_user".to_string(),
        ]
    });
    let enabled_skills = input.enabled_skills.unwrap_or_default();
    let command = json!({
        "type": "send_message",
        "requestId": task_id.clone(),
        "session": {
            "workspacePath": input.workspace_path,
            "sessionRootDir": session_root_dir,
        },
        "agent": {
            "agentId": input.agent_id,
            "agentRoleId": input.agent_role_id,
        },
        "input": {
            "userMessage": input.user_message,
            "systemPrompt": input.system_prompt,
            "requestContext": input.request_context,
            "runtimeInstruction": input.runtime_instruction,
            "bootstrapInstruction": input.bootstrap_instruction,
        },
        "runtime": {
            "mode": "agent",
            "taskId": task_id.clone(),
            "model": input.runtime_model,
            "resources": {
                "tools": {
                    "allowed": allowed_tools,
                },
                "skills": {
                    "bundledPath": bundled_skills_path,
                    "paths": skill_paths,
                    "enabled": enabled_skills,
                },
            },
        }
    });

    state.submit(
        app,
        AgentTaskSubmission {
            task_id: task_id.clone(),
            session_key,
            command,
        },
    )?;

    Ok(RunAgentRuntimeAgentOutput { task_id })
}

#[tauri::command]
pub fn answer_agent_runtime_question(
    state: State<AgentRuntimeSupervisor>,
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
    state: State<AgentRuntimeSupervisor>,
    task_id: String,
) -> Result<(), String> {
    state.abort(&task_id)
}

fn session_key_for_task(
    input: &RunAgentRuntimeAgentInput,
    task_id: &str,
    session_root_dir: Option<&str>,
) -> String {
    let agent_id = input.agent_id.as_deref().unwrap_or("<default>");
    let session_scope = session_root_dir
        .or_else(|| {
            input
                .chat_session_id
                .as_deref()
                .filter(|value| !value.trim().is_empty())
        })
        .unwrap_or(task_id);

    format!("{}|{}|{}", input.workspace_path, agent_id, session_scope)
}

fn validate_agent_input(input: &RunAgentRuntimeAgentInput) -> Result<(), String> {
    if input.workspace_path.trim().is_empty() {
        return Err("工作区路径不能为空".to_string());
    }

    if input.user_message.trim().is_empty() {
        return Err("Agent 任务内容不能为空".to_string());
    }

    Ok(())
}
