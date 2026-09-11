use super::{
    plugins::resolve_session_plugins,
    protocol::{
        notification, request, AgentPermissions, AgentRuntimeResources, AgentRuntimeSkillResources,
        BundledPath, METHOD_AGENT_APPROVAL_ANSWER, METHOD_AGENT_QUESTION_ANSWER, METHOD_AGENT_RUN,
    },
    runtime_files::append_agent_diagnostic,
    session_paths::resolve_optional_session_root_dir,
    skills::{
        app_skill_paths_for_runtime, bundled_skills_path_for_runtime,
        workspace_skill_paths_for_runtime,
    },
    supervisor::{AgentRuntimeSupervisor, AgentTaskSubmission},
    types::AgentRuntimeModelInput,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, State};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAgentRuntimeAgentInput {
    task_id: String,
    workspace_path: String,
    chat_id: Option<String>,
    plugin_id: Option<String>,
    session_root_dir: Option<String>,
    agent_role_id: Option<String>,
    user_message: String,
    system_prompt: Option<String>,
    request_context: Option<String>,
    runtime_instruction: Option<String>,
    bootstrap_instruction: Option<String>,
    runtime_model: Option<AgentRuntimeModelInput>,
    resources: Option<AgentRuntimeResources>,
    permissions: Option<AgentPermissions>,
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
    answer: Option<String>,
}

#[tauri::command]
pub fn run_agent_runtime_agent(
    app: AppHandle,
    state: State<AgentRuntimeSupervisor>,
    mut input: RunAgentRuntimeAgentInput,
) -> Result<RunAgentRuntimeAgentOutput, String> {
    validate_agent_input(&input)?;

    let task_id = input.task_id.trim().to_string();
    let bundled_skills_path = bundled_skills_path_for_runtime(&app)?;
    let mut skill_paths = app_skill_paths_for_runtime(&app)?;
    skill_paths.extend(workspace_skill_paths_for_runtime(&input.workspace_path));
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

    let mut resources = input.resources.take().unwrap_or(AgentRuntimeResources {
        tools: None,
        skills: None,
        mcp: None,
        plugins: None,
    });
    let requested_skills = resources.skills.take();
    let enabled_skills = requested_skills
        .as_ref()
        .and_then(|skills| skills.enabled.clone())
        .unwrap_or_default();
    skill_paths.extend(
        requested_skills
            .as_ref()
            .and_then(|skills| skills.paths.clone())
            .unwrap_or_default(),
    );
    resources.skills = Some(AgentRuntimeSkillResources {
        bundled_path: bundled_skills_path
            .map(BundledPath::PurpleString)
            .or_else(|| requested_skills.and_then(|skills| skills.bundled_path)),
        paths: Some(skill_paths),
        enabled: Some(enabled_skills),
    });
    let session_plugin = resolve_session_plugins(&app, input.plugin_id.as_deref())?;
    resources.plugins = session_plugin
        .as_ref()
        .map(|plugin| plugin.resources.clone());
    let mut command = request(
        task_id.clone(),
        METHOD_AGENT_RUN,
        json!({
            "taskId": task_id.clone(),
            "workspacePath": input.workspace_path,
            "sessionRootDir": session_root_dir,
            "agentRoleId": input.agent_role_id,
            "userMessage": input.user_message,
            "systemPrompt": input.system_prompt,
            "requestContext": input.request_context,
            "runtimeInstruction": input.runtime_instruction,
            "bootstrapInstruction": input.bootstrap_instruction,
            "runtimeModel": input.runtime_model,
            "resources": resources,
        }),
    );

    if let Some(permissions) = input.permissions {
        command["params"]["permissions"] =
            serde_json::to_value(permissions).map_err(|error| error.to_string())?;
    }
    if let Some(plugin) = session_plugin {
        command["params"]["agentAccess"] =
            serde_json::to_value(plugin.access).map_err(|error| error.to_string())?;
        command["params"]["agentAccessRoots"] =
            serde_json::to_value(plugin.roots).map_err(|error| error.to_string())?;
    }

    state.submit(
        app,
        AgentTaskSubmission {
            task_id: task_id.clone(),
            session_key,
            command,
            plugin_id: input.plugin_id,
        },
    )?;

    Ok(RunAgentRuntimeAgentOutput { task_id })
}

#[tauri::command]
pub fn answer_agent_runtime_question(
    state: State<AgentRuntimeSupervisor>,
    input: AnswerAgentRuntimeQuestionInput,
) -> Result<(), String> {
    let command = notification(
        METHOD_AGENT_QUESTION_ANSWER,
        json!({
            "taskId": input.task_id,
            "questionId": input.question_id,
            "answer": input.answer,
        }),
    );

    state.answer_question(&input.task_id, &command)
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnswerAgentRuntimeApprovalInput {
    task_id: String,
    approval_id: String,
    approved: bool,
}

#[tauri::command]
pub fn answer_agent_runtime_approval(
    window: tauri::WebviewWindow,
    state: State<AgentRuntimeSupervisor>,
    input: AnswerAgentRuntimeApprovalInput,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("仅宿主主窗口可以响应审批".into());
    }
    let command = notification(
        METHOD_AGENT_APPROVAL_ANSWER,
        serde_json::to_value(&input).map_err(|error| error.to_string())?,
    );
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
    let session_scope = session_root_dir
        .or_else(|| {
            input
                .chat_id
                .as_deref()
                .filter(|value| !value.trim().is_empty())
        })
        .unwrap_or(task_id);

    format!("{}|{}", input.workspace_path, session_scope)
}

fn validate_agent_input(input: &RunAgentRuntimeAgentInput) -> Result<(), String> {
    if input.task_id.trim().is_empty() {
        return Err("Agent taskId 不能为空".to_string());
    }

    if input.workspace_path.trim().is_empty() {
        return Err("工作区路径不能为空".to_string());
    }

    if input.user_message.trim().is_empty() {
        return Err("Agent 任务内容不能为空".to_string());
    }

    Ok(())
}
