use super::{
    bridge::append_agent_diagnostic,
    skills::{bundled_skills_path_for_bridge, workspace_skill_paths_for_bridge},
    supervisor::{AgentRuntimeSupervisor, AgentTaskSubmission},
    types::{AgentRuntimeModelInput, AgentRuntimeProviderInput},
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
    state: State<AgentRuntimeSupervisor>,
    input: RunAgentRuntimeAgentInput,
) -> Result<RunAgentRuntimeAgentOutput, String> {
    validate_agent_input(&input)?;

    let task_id = Uuid::now_v7().to_string();
    let bundled_skills_path = bundled_skills_path_for_bridge(&app)?;
    let skill_paths = workspace_skill_paths_for_bridge(&input.workspace_path);
    let session_key = session_key_for_task(&input, &task_id);

    append_agent_diagnostic(
        &app,
        format!(
            "submit task={task_id} session_key={} workspace={} bundled_skills={} workspace_skills={}",
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

    let command = json!({
        "type": "start_task",
        "requestId": task_id.clone(),
        "agentId": input.agent_id,
        "taskId": task_id.clone(),
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

fn session_key_for_task(input: &RunAgentRuntimeAgentInput, task_id: &str) -> String {
    let agent_id = input.agent_id.as_deref().unwrap_or("<default>");
    let chat_session_id = input
        .chat_session_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(task_id);

    format!("{}|{}|{}", input.workspace_path, agent_id, chat_session_id)
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
