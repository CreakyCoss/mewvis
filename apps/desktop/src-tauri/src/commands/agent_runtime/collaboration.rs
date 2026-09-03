use super::{
    plugins::inject_registered_dsh_plugins,
    protocol::{
        request, AgentRuntimeResources, AgentRuntimeSkillResources, AgentRuntimeToolResources,
        BundledPath, METHOD_COLLABORATION_RUN, METHOD_COLLABORATION_RUN_MODE,
    },
    runtime_files::append_agent_diagnostic,
    session_paths::resolve_optional_session_root_dir,
    skills::{
        app_skill_paths_for_runtime, bundled_skills_path_for_runtime,
        workspace_skill_paths_for_runtime,
    },
    supervisor::{AgentRuntimeSupervisor, AgentTaskSubmission},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, State};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct RunAgentRuntimeCollaborationInput {
    request_id: Option<String>,
    workspace_path: String,
    session_root_dir: Option<String>,
    workflow: Value,
    agents: Vec<Value>,
    input: Option<Value>,
    resources: Option<AgentRuntimeResources>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct RunAgentRuntimeCollaborationModeInput {
    request_id: Option<String>,
    workspace_path: String,
    session_root_dir: Option<String>,
    mode: String,
    participants: Vec<Value>,
    context: Option<Value>,
    options: Option<Value>,
    resources: Option<AgentRuntimeResources>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAgentRuntimeCollaborationOutput {
    task_id: String,
}

#[tauri::command]
pub fn run_agent_runtime_collaboration(
    app: AppHandle,
    state: State<AgentRuntimeSupervisor>,
    mut input: RunAgentRuntimeCollaborationInput,
) -> Result<RunAgentRuntimeCollaborationOutput, String> {
    validate_collaboration_input(&input)?;

    let task_id = input
        .request_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| Uuid::now_v7().to_string());
    let bundled_skills_path = bundled_skills_path_for_runtime(&app)?;
    let mut skill_paths = app_skill_paths_for_runtime(&app)?;
    skill_paths.extend(workspace_skill_paths_for_runtime(&input.workspace_path));
    let session_root_dir = resolve_optional_session_root_dir(
        Some(&input.workspace_path),
        input.session_root_dir.as_deref(),
    )?;
    let session_key = session_key_for_collaboration(&input, &task_id, session_root_dir.as_deref());

    append_agent_diagnostic(
        &app,
        format!(
            "submit collaboration task={task_id} session_key={} workspace={} bundled_skills={} extra_skill_paths={}",
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

    let resources = collaboration_resources(
        &app,
        bundled_skills_path,
        skill_paths,
        input.resources.take(),
    )?;
    let command = request(
        task_id.clone(),
        METHOD_COLLABORATION_RUN,
        json!({
                "requestId": task_id.clone(),
                "workspacePath": input.workspace_path,
                "sessionRootDir": session_root_dir,
                "workflow": input.workflow,
                "agents": input.agents,
                "input": input.input,
                "resources": resources,
        }),
    );

    state.submit(
        app,
        AgentTaskSubmission {
            task_id: task_id.clone(),
            session_key,
            command,
        },
    )?;

    Ok(RunAgentRuntimeCollaborationOutput { task_id })
}

#[tauri::command]
pub fn run_agent_runtime_collaboration_mode(
    app: AppHandle,
    state: State<AgentRuntimeSupervisor>,
    mut input: RunAgentRuntimeCollaborationModeInput,
) -> Result<RunAgentRuntimeCollaborationOutput, String> {
    validate_collaboration_mode_input(&input)?;

    let task_id = input
        .request_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| Uuid::now_v7().to_string());
    let bundled_skills_path = bundled_skills_path_for_runtime(&app)?;
    let mut skill_paths = app_skill_paths_for_runtime(&app)?;
    skill_paths.extend(workspace_skill_paths_for_runtime(&input.workspace_path));
    let session_root_dir = resolve_optional_session_root_dir(
        Some(&input.workspace_path),
        input.session_root_dir.as_deref(),
    )?;
    let session_key =
        session_key_for_collaboration_mode(&input, &task_id, session_root_dir.as_deref());

    append_agent_diagnostic(
        &app,
        format!(
            "submit collaboration-mode task={task_id} mode={} session_key={} workspace={} bundled_skills={} extra_skill_paths={}",
            input.mode,
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

    let resources = collaboration_resources(
        &app,
        bundled_skills_path,
        skill_paths,
        input.resources.take(),
    )?;
    let command = request(
        task_id.clone(),
        METHOD_COLLABORATION_RUN_MODE,
        json!({
                "requestId": task_id.clone(),
                "workspacePath": input.workspace_path,
                "sessionRootDir": session_root_dir,
                "mode": input.mode,
                "participants": input.participants,
                "context": input.context,
                "options": input.options,
                "resources": resources,
        }),
    );

    state.submit(
        app,
        AgentTaskSubmission {
            task_id: task_id.clone(),
            session_key,
            command,
        },
    )?;

    Ok(RunAgentRuntimeCollaborationOutput { task_id })
}

fn session_key_for_collaboration(
    input: &RunAgentRuntimeCollaborationInput,
    task_id: &str,
    session_root_dir: Option<&str>,
) -> String {
    let session_scope = session_root_dir.unwrap_or(task_id);
    format!("{}|collaboration|{}", input.workspace_path, session_scope)
}

fn session_key_for_collaboration_mode(
    input: &RunAgentRuntimeCollaborationModeInput,
    task_id: &str,
    session_root_dir: Option<&str>,
) -> String {
    let session_scope = session_root_dir.unwrap_or(task_id);
    format!(
        "{}|collaboration-mode|{}|{}",
        input.workspace_path, input.mode, session_scope
    )
}

fn default_collaboration_allowed_tools() -> Vec<String> {
    vec![
        "read".to_string(),
        "edit".to_string(),
        "write".to_string(),
        "ls".to_string(),
        "find".to_string(),
        "grep".to_string(),
        "ask_user".to_string(),
    ]
}

fn collaboration_resources(
    app: &AppHandle,
    bundled_skills_path: Option<String>,
    mut skill_paths: Vec<String>,
    resources: Option<AgentRuntimeResources>,
) -> Result<AgentRuntimeResources, String> {
    let mut resources = resources.unwrap_or(AgentRuntimeResources {
        tools: None,
        skills: None,
        mcp: None,
        plugins: None,
    });
    let allowed_tools = resources
        .tools
        .take()
        .and_then(|tools| tools.allowed)
        .unwrap_or_else(default_collaboration_allowed_tools);
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
    resources.tools = Some(AgentRuntimeToolResources {
        allowed: Some(allowed_tools),
    });
    resources.skills = Some(AgentRuntimeSkillResources {
        bundled_path: bundled_skills_path
            .map(BundledPath::PurpleString)
            .or_else(|| requested_skills.and_then(|skills| skills.bundled_path)),
        paths: Some(skill_paths),
        enabled: Some(enabled_skills),
    });
    inject_registered_dsh_plugins(app, &mut resources)?;
    Ok(resources)
}

fn validate_collaboration_input(input: &RunAgentRuntimeCollaborationInput) -> Result<(), String> {
    if input.workspace_path.trim().is_empty() {
        return Err("协作任务工作区路径不能为空".to_string());
    }

    if input.workflow.is_null() {
        return Err("协作 workflow 不能为空".to_string());
    }

    if input
        .workflow
        .as_object()
        .and_then(|workflow| workflow.get("runtime"))
        .is_some()
    {
        return Err(
            "协作 workflow 不再接受 runtime 字段；runtime 由 native profile 决定".to_string(),
        );
    }

    if input.agents.is_empty() {
        return Err("协作任务至少需要一个 agent".to_string());
    }

    Ok(())
}

fn validate_collaboration_mode_input(
    input: &RunAgentRuntimeCollaborationModeInput,
) -> Result<(), String> {
    if input.workspace_path.trim().is_empty() {
        return Err("协作任务工作区路径不能为空".to_string());
    }

    if input.mode.trim().is_empty() {
        return Err("协作 mode 不能为空".to_string());
    }

    if input.participants.is_empty() {
        return Err("协作 mode 至少需要一个 participant".to_string());
    }

    Ok(())
}
