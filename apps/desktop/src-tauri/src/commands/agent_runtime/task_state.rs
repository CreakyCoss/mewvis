use std::{
    collections::HashMap,
    io::Write,
    process::{Child, ChildStdin},
    sync::{Arc, Mutex},
};

#[derive(Clone, Default)]
pub struct AgentRuntimeAgentTasks {
    tasks: Arc<Mutex<HashMap<String, Arc<AgentRuntimeAgentProcess>>>>,
}

pub(super) struct AgentRuntimeAgentProcess {
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
}

impl AgentRuntimeAgentTasks {
    pub(super) fn insert(
        &self,
        task_id: String,
        child: Child,
        stdin: ChildStdin,
    ) -> Result<Arc<AgentRuntimeAgentProcess>, String> {
        let process = Arc::new(AgentRuntimeAgentProcess {
            child: Mutex::new(child),
            stdin: Mutex::new(stdin),
        });
        self.tasks
            .lock()
            .map_err(|_| "Agent runtime agent 任务状态已损坏".to_string())?
            .insert(task_id, process.clone());
        Ok(process)
    }

    pub(super) fn remove(&self, task_id: &str) {
        if let Ok(mut tasks) = self.tasks.lock() {
            tasks.remove(task_id);
        }
    }

    pub(super) fn answer_question(
        &self,
        task_id: &str,
        command: &serde_json::Value,
    ) -> Result<(), String> {
        let task = self
            .tasks
            .lock()
            .map_err(|_| "Agent runtime agent 任务状态已损坏".to_string())?
            .get(task_id)
            .cloned()
            .ok_or_else(|| "Agent runtime agent 任务不存在或已结束".to_string())?;

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

    pub(super) fn abort(&self, task_id: &str) -> Result<(), String> {
        let task = self
            .tasks
            .lock()
            .map_err(|_| "Agent runtime agent 任务状态已损坏".to_string())?
            .remove(task_id);

        if let Some(task) = task {
            task.child
                .lock()
                .map_err(|_| "Agent runtime agent 任务进程已无法访问".to_string())?
                .kill()
                .map_err(|error| format!("终止 Agent runtime agent 任务失败：{error}"))?;
        }

        Ok(())
    }
}

impl AgentRuntimeAgentProcess {
    pub(super) fn try_wait(&self) -> Option<std::process::ExitStatus> {
        self.child
            .lock()
            .ok()
            .and_then(|mut child| child.try_wait().ok().flatten())
    }
}
