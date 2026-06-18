use super::{
    bridge::{append_agent_diagnostic, path_for_node},
    events::{emit_agent_event, emit_bridge_line},
    process::{
        build_agent_bridge_command, resolve_agent_bridge_process_config, spawn_agent_bridge_command,
    },
};
use serde_json::{json, Value};
#[cfg(unix)]
use std::os::unix::process::ExitStatusExt;
use std::{
    collections::{HashMap, VecDeque},
    fs,
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, ExitStatus},
    sync::{Arc, Mutex, Weak},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const AGENT_WORKER_IDLE_TIMEOUT: Duration = Duration::from_secs(180);
const AGENT_WORKER_IDLE_CHECK_INTERVAL: Duration = Duration::from_secs(5);
const AGENT_WORKER_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(15);
const AGENT_WORKER_HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(10);
const AGENT_WORKER_HEARTBEAT_MAX_MISSES: u8 = 2;

fn exit_status_label(status: &ExitStatus) -> String {
    if let Some(code) = status.code() {
        return code.to_string();
    }

    #[cfg(unix)]
    if let Some(signal) = status.signal() {
        return format!("signal {signal}");
    }

    "unknown".to_string()
}

#[derive(Clone, Default)]
pub struct AgentRuntimeSupervisor {
    inner: Arc<Mutex<SupervisorInner>>,
}

#[derive(Default)]
struct SupervisorInner {
    workers: HashMap<String, Arc<AgentRuntimeWorker>>,
    task_index: HashMap<String, Arc<AgentRuntimeWorker>>,
}

#[derive(Clone)]
pub(super) struct AgentTaskSubmission {
    pub task_id: String,
    pub session_key: String,
    pub command: Value,
}

#[derive(Clone)]
struct QueuedAgentTask {
    task_id: String,
    command: Value,
}

struct AgentRuntimeWorker {
    id: String,
    session_key: String,
    app: AppHandle,
    supervisor: Weak<Mutex<SupervisorInner>>,
    child: Mutex<Child>,
    stdin: Mutex<Option<ChildStdin>>,
    state: Mutex<AgentRuntimeWorkerState>,
}

struct AgentRuntimeWorkerState {
    lifecycle: WorkerLifecycle,
    current_task_id: Option<String>,
    queue: VecDeque<QueuedAgentTask>,
    last_activity: Instant,
    last_pong: Instant,
    pending_ping: Option<PendingHeartbeat>,
    missed_heartbeats: u8,
    stop_reason: Option<WorkerStopReason>,
}

struct PendingHeartbeat {
    request_id: String,
    sent_at: Instant,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum WorkerLifecycle {
    Starting,
    Idle,
    Running,
    WaitingUser,
    Unhealthy,
    Stopping,
    Stopped,
    Crashed,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum WorkerStopReason {
    Idle,
    Cancelled,
    Unhealthy,
}

enum HeartbeatAction {
    Send(String),
    Kill(String),
    Stop,
    None,
}

impl AgentRuntimeSupervisor {
    pub(super) fn submit(
        &self,
        app: AppHandle,
        submission: AgentTaskSubmission,
    ) -> Result<(), String> {
        let task = QueuedAgentTask {
            task_id: submission.task_id.clone(),
            command: submission.command,
        };
        let mut last_error = None;

        for _ in 0..2 {
            let worker = self.worker_for_session(&app, &submission.session_key)?;
            self.index_task(&submission.task_id, &worker)?;

            match worker.enqueue(task.clone()) {
                Ok(()) => return Ok(()),
                Err(error) => {
                    last_error = Some(error);
                    self.remove_task(&submission.task_id);
                    if worker.is_usable() {
                        break;
                    }
                    self.remove_worker_if_current(&submission.session_key, &worker);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| "Agent runtime worker 无法接收任务".to_string()))
    }

    pub(super) fn answer_question(&self, task_id: &str, command: &Value) -> Result<(), String> {
        let worker = self.worker_for_task(task_id)?;
        worker.answer_question(task_id, command)
    }

    pub(super) fn abort(&self, task_id: &str) -> Result<(), String> {
        let worker = {
            let inner = self
                .inner
                .lock()
                .map_err(|_| "Agent runtime supervisor 状态已损坏".to_string())?;
            inner.task_index.get(task_id).cloned()
        };

        if let Some(worker) = worker {
            worker.abort(task_id)?;
        }

        Ok(())
    }

    fn worker_for_task(&self, task_id: &str) -> Result<Arc<AgentRuntimeWorker>, String> {
        self.inner
            .lock()
            .map_err(|_| "Agent runtime supervisor 状态已损坏".to_string())?
            .task_index
            .get(task_id)
            .cloned()
            .ok_or_else(|| "Agent runtime agent 任务不存在或已结束".to_string())
    }

    fn remove_task(&self, task_id: &str) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.task_index.remove(task_id);
        }
    }

    fn worker_for_session(
        &self,
        app: &AppHandle,
        session_key: &str,
    ) -> Result<Arc<AgentRuntimeWorker>, String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "Agent runtime supervisor 状态已损坏".to_string())?;

        match inner.workers.get(session_key) {
            Some(worker) if worker.is_usable() => Ok(worker.clone()),
            _ => {
                let worker = AgentRuntimeWorker::spawn(
                    app.clone(),
                    session_key.to_string(),
                    Arc::downgrade(&self.inner),
                )?;
                inner
                    .workers
                    .insert(session_key.to_string(), worker.clone());
                Ok(worker)
            }
        }
    }

    fn index_task(&self, task_id: &str, worker: &Arc<AgentRuntimeWorker>) -> Result<(), String> {
        self.inner
            .lock()
            .map_err(|_| "Agent runtime supervisor 状态已损坏".to_string())?
            .task_index
            .insert(task_id.to_string(), worker.clone());
        Ok(())
    }

    fn remove_worker_if_current(&self, session_key: &str, worker: &Arc<AgentRuntimeWorker>) {
        if let Ok(mut inner) = self.inner.lock() {
            if inner
                .workers
                .get(session_key)
                .is_some_and(|current| Arc::ptr_eq(current, worker))
            {
                inner.workers.remove(session_key);
            }
        }
    }
}

impl AgentRuntimeWorker {
    fn spawn(
        app: AppHandle,
        session_key: String,
        supervisor: Weak<Mutex<SupervisorInner>>,
    ) -> Result<Arc<Self>, String> {
        let worker_id = Uuid::now_v7().to_string();
        let bridge_process = resolve_agent_bridge_process_config(&app)?;
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
                "worker start worker={worker_id} session_key={} node={} node_exists={} bridge={} bridge_exists={} agent_dir={}",
                session_key,
                bridge_process.node_binary.display(),
                bridge_process.node_binary.exists(),
                bridge_process.bridge_path.display(),
                bridge_process.bridge_path.exists(),
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
            "Agent runtime bridge worker",
            &bridge_process.node_binary,
            format!("worker={worker_id}"),
        )?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Agent runtime bridge worker stdin 不可用".to_string())?;
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let worker = Arc::new(Self {
            id: worker_id,
            session_key,
            app,
            supervisor,
            child: Mutex::new(child),
            stdin: Mutex::new(Some(stdin)),
            state: Mutex::new(AgentRuntimeWorkerState {
                lifecycle: WorkerLifecycle::Starting,
                current_task_id: None,
                queue: VecDeque::new(),
                last_activity: Instant::now(),
                last_pong: Instant::now(),
                pending_ping: None,
                missed_heartbeats: 0,
                stop_reason: None,
            }),
        });

        if let Some(stdout) = stdout {
            let worker_for_stdout = worker.clone();
            thread::spawn(move || worker_for_stdout.read_stdout(stdout));
        }

        if let Some(stderr) = stderr {
            let worker_for_stderr = worker.clone();
            thread::spawn(move || worker_for_stderr.read_stderr(stderr));
        }

        let worker_for_wait = worker.clone();
        thread::spawn(move || worker_for_wait.wait_for_exit());

        let worker_for_idle = worker.clone();
        thread::spawn(move || worker_for_idle.reap_when_idle());

        let worker_for_heartbeat = worker.clone();
        thread::spawn(move || worker_for_heartbeat.monitor_heartbeat());

        worker.set_idle();
        Ok(worker)
    }

    fn is_usable(&self) -> bool {
        self.state
            .lock()
            .map(|state| {
                !matches!(
                    state.lifecycle,
                    WorkerLifecycle::Unhealthy
                        | WorkerLifecycle::Stopping
                        | WorkerLifecycle::Stopped
                        | WorkerLifecycle::Crashed
                )
            })
            .unwrap_or(false)
    }

    fn enqueue(self: &Arc<Self>, task: QueuedAgentTask) -> Result<(), String> {
        let should_start = {
            let mut state = self
                .state
                .lock()
                .map_err(|_| "Agent runtime worker 状态已损坏".to_string())?;
            if matches!(
                state.lifecycle,
                WorkerLifecycle::Unhealthy
                    | WorkerLifecycle::Stopping
                    | WorkerLifecycle::Stopped
                    | WorkerLifecycle::Crashed
            ) {
                return Err("Agent runtime worker 不可用".to_string());
            }
            state.touch();

            if state.current_task_id.is_none()
                && matches!(
                    state.lifecycle,
                    WorkerLifecycle::Idle | WorkerLifecycle::Starting
                )
            {
                state.current_task_id = Some(task.task_id.clone());
                state.lifecycle = WorkerLifecycle::Running;
                true
            } else {
                state.queue.push_back(task.clone());
                false
            }
        };

        if should_start {
            self.launch_task(task)
        } else {
            self.emit_task_state(&task.task_id, "queued");
            Ok(())
        }
    }

    fn launch_task(self: &Arc<Self>, task: QueuedAgentTask) -> Result<(), String> {
        self.emit_task_state(&task.task_id, "starting");

        if let Err(error) = self.write_command(&task.command) {
            self.emit_error(&task.task_id, &error);
            self.complete_task(&task.task_id, false);
            return Err(error);
        }

        self.emit_task_state(&task.task_id, "running");
        Ok(())
    }

    fn answer_question(&self, task_id: &str, command: &Value) -> Result<(), String> {
        let is_current = self
            .state
            .lock()
            .map_err(|_| "Agent runtime worker 状态已损坏".to_string())?
            .current_task_id
            .as_deref()
            == Some(task_id);
        if !is_current {
            return Err("Agent runtime agent 任务尚未运行，无法回答问题".to_string());
        }

        self.write_command(command)
    }

    fn abort(self: &Arc<Self>, task_id: &str) -> Result<(), String> {
        let removed_from_queue = {
            let mut state = self
                .state
                .lock()
                .map_err(|_| "Agent runtime worker 状态已损坏".to_string())?;
            if let Some(index) = state.queue.iter().position(|task| task.task_id == task_id) {
                state.queue.remove(index);
                state.touch();
                true
            } else {
                false
            }
        };

        if removed_from_queue {
            Self::remove_task_from_supervisor(&self.supervisor, task_id);
            self.emit_task_state(task_id, "cancelled");
            return Ok(());
        }

        let should_kill = {
            let mut state = self
                .state
                .lock()
                .map_err(|_| "Agent runtime worker 状态已损坏".to_string())?;
            if state.current_task_id.as_deref() != Some(task_id) {
                return Ok(());
            }
            state.lifecycle = WorkerLifecycle::Stopping;
            state.stop_reason = Some(WorkerStopReason::Cancelled);
            state.touch();
            true
        };

        if should_kill {
            self.emit_task_state(task_id, "cancelling");
            self.emit_error(task_id, "Agent 任务已取消");
            self.kill_child()?;
        }

        Ok(())
    }

    fn read_stdout(self: Arc<Self>, stdout: impl std::io::Read) {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let line = match line {
                Ok(line) => line,
                Err(error) => {
                    self.emit_current_error(&format!(
                        "读取 Agent runtime worker 输出失败：{error}"
                    ));
                    break;
                }
            };

            if line.trim().is_empty() {
                continue;
            }

            let value = match serde_json::from_str::<Value>(&line) {
                Ok(value) => value,
                Err(_) => {
                    self.touch();
                    if let Some(task_id) = self.current_task_id() {
                        emit_bridge_line(&self.app, &task_id, &line);
                    } else {
                        append_agent_diagnostic(
                            &self.app,
                            format!("worker={} unparsed stdout {}", self.id, line),
                        );
                    }
                    continue;
                }
            };

            let event_type = value.get("type").and_then(Value::as_str);
            match event_type {
                Some("pong") => {
                    self.handle_pong(&value);
                    continue;
                }
                Some("task_result") => {
                    self.handle_task_result(&value);
                    continue;
                }
                Some("shutdown_ack") => continue,
                Some("chat_result" | "agent_definitions") => {
                    self.touch();
                    continue;
                }
                Some("started") => self.mark_current_state(WorkerLifecycle::Running, "running"),
                Some("question") => {
                    self.mark_current_state(WorkerLifecycle::WaitingUser, "waiting_user")
                }
                Some("question_answered") => {
                    self.mark_current_state(WorkerLifecycle::Running, "running")
                }
                Some("done") => self.mark_current_state(WorkerLifecycle::Running, "completing"),
                _ => {}
            }

            self.touch();

            let task_id = value
                .get("taskId")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| self.current_task_id());
            if let Some(task_id) = task_id {
                emit_bridge_line(&self.app, &task_id, &line);
            }
        }
    }

    fn read_stderr(self: Arc<Self>, stderr: impl std::io::Read) {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            append_agent_diagnostic(
                &self.app,
                format!(
                    "stderr worker={} session_key={} {line}",
                    self.id, self.session_key
                ),
            );
            if let Some(task_id) = self.current_task_id() {
                emit_agent_event(
                    &self.app,
                    json!({
                        "type": "stderr",
                        "taskId": task_id,
                        "message": line,
                    }),
                );
            }
        }
    }

    fn wait_for_exit(self: Arc<Self>) {
        let status = loop {
            let status = self
                .child
                .lock()
                .ok()
                .and_then(|mut child| child.try_wait().ok().flatten());
            if let Some(status) = status {
                break status;
            }

            thread::sleep(Duration::from_millis(200));
        };

        self.handle_process_exit(status);
    }

    fn reap_when_idle(self: Arc<Self>) {
        loop {
            thread::sleep(AGENT_WORKER_IDLE_CHECK_INTERVAL);

            let should_stop = {
                let state = match self.state.lock() {
                    Ok(state) => state,
                    Err(_) => return,
                };

                if matches!(
                    state.lifecycle,
                    WorkerLifecycle::Unhealthy
                        | WorkerLifecycle::Stopping
                        | WorkerLifecycle::Stopped
                        | WorkerLifecycle::Crashed
                ) {
                    return;
                }

                state.lifecycle == WorkerLifecycle::Idle
                    && state.current_task_id.is_none()
                    && state.queue.is_empty()
                    && state.last_activity.elapsed() >= AGENT_WORKER_IDLE_TIMEOUT
            };

            if should_stop {
                self.stop_idle();
                return;
            }
        }
    }

    fn monitor_heartbeat(self: Arc<Self>) {
        loop {
            thread::sleep(AGENT_WORKER_HEARTBEAT_INTERVAL);

            match self.next_heartbeat_action() {
                HeartbeatAction::Send(request_id) => {
                    if let Err(error) = self.write_command(&json!({
                        "type": "ping",
                        "requestId": request_id,
                    })) {
                        self.mark_unhealthy(format!("Agent worker 心跳发送失败：{error}"));
                        return;
                    }
                }
                HeartbeatAction::Kill(message) => {
                    self.mark_unhealthy(message);
                    return;
                }
                HeartbeatAction::Stop => return,
                HeartbeatAction::None => {}
            }
        }
    }

    fn next_heartbeat_action(&self) -> HeartbeatAction {
        let mut state = match self.state.lock() {
            Ok(state) => state,
            Err(_) => return HeartbeatAction::Stop,
        };

        if matches!(
            state.lifecycle,
            WorkerLifecycle::Unhealthy
                | WorkerLifecycle::Stopping
                | WorkerLifecycle::Stopped
                | WorkerLifecycle::Crashed
        ) {
            return HeartbeatAction::Stop;
        }

        if let Some((pending_request_id, pending_sent_at)) = state
            .pending_ping
            .as_ref()
            .map(|pending| (pending.request_id.clone(), pending.sent_at))
        {
            if pending_sent_at.elapsed() < AGENT_WORKER_HEARTBEAT_TIMEOUT {
                return HeartbeatAction::None;
            }

            state.missed_heartbeats = state.missed_heartbeats.saturating_add(1);
            append_agent_diagnostic(
                &self.app,
                format!(
                    "worker heartbeat missed worker={} session_key={} request_id={} misses={}",
                    self.id, self.session_key, pending_request_id, state.missed_heartbeats,
                ),
            );

            if state.missed_heartbeats >= AGENT_WORKER_HEARTBEAT_MAX_MISSES {
                if state.current_task_id.is_some() {
                    append_agent_diagnostic(
                        &self.app,
                        format!(
                            "worker heartbeat deferred worker={} session_key={} active_task={:?} misses={}",
                            self.id,
                            self.session_key,
                            state.current_task_id,
                            state.missed_heartbeats,
                        ),
                    );
                    state.pending_ping = None;
                    state.missed_heartbeats = 0;
                } else {
                    state.lifecycle = WorkerLifecycle::Unhealthy;
                    state.stop_reason = Some(WorkerStopReason::Unhealthy);
                    return HeartbeatAction::Kill(format!(
                        "Agent worker 心跳超时，连续 {} 次未响应",
                        state.missed_heartbeats
                    ));
                }
            }
        }

        let request_id = format!("heartbeat-{}-{}", self.id, Uuid::now_v7());
        state.pending_ping = Some(PendingHeartbeat {
            request_id: request_id.clone(),
            sent_at: Instant::now(),
        });
        HeartbeatAction::Send(request_id)
    }

    fn handle_pong(&self, value: &Value) {
        let request_id = value.get("requestId").and_then(Value::as_str);
        if let Ok(mut state) = self.state.lock() {
            let matches_pending = state
                .pending_ping
                .as_ref()
                .is_some_and(|pending| Some(pending.request_id.as_str()) == request_id);
            if matches_pending {
                state.pending_ping = None;
                state.missed_heartbeats = 0;
                state.last_pong = Instant::now();
            }
        }
    }

    fn mark_unhealthy(&self, message: String) {
        let current_task_id = {
            let mut state = match self.state.lock() {
                Ok(state) => state,
                Err(_) => return,
            };
            if matches!(
                state.lifecycle,
                WorkerLifecycle::Stopping | WorkerLifecycle::Stopped | WorkerLifecycle::Crashed
            ) {
                return;
            }
            state.lifecycle = WorkerLifecycle::Unhealthy;
            state.stop_reason = Some(WorkerStopReason::Unhealthy);
            state.current_task_id.clone()
        };

        append_agent_diagnostic(
            &self.app,
            format!(
                "worker unhealthy worker={} session_key={} message={}",
                self.id, self.session_key, message,
            ),
        );

        if let Some(task_id) = current_task_id {
            self.emit_error(&task_id, &message);
            self.emit_task_state(&task_id, "failed");
        }

        let _ = self.kill_child();
    }

    fn stop_idle(&self) {
        {
            let mut state = match self.state.lock() {
                Ok(state) => state,
                Err(_) => return,
            };
            if state.current_task_id.is_some() || !state.queue.is_empty() {
                return;
            }
            state.lifecycle = WorkerLifecycle::Stopping;
            state.stop_reason = Some(WorkerStopReason::Idle);
            state.touch();
        }

        append_agent_diagnostic(
            &self.app,
            format!(
                "worker idle shutdown worker={} session_key={}",
                self.id, self.session_key
            ),
        );

        if self
            .write_command(&json!({
                "type": "shutdown",
                "requestId": format!("idle-shutdown-{}", self.id),
            }))
            .is_err()
        {
            let _ = self.kill_child();
        }
    }

    fn handle_process_exit(self: &Arc<Self>, status: ExitStatus) {
        let (current_task_id, queued_tasks, stop_reason) = {
            let mut state = match self.state.lock() {
                Ok(state) => state,
                Err(_) => return,
            };
            let current_task_id = state.current_task_id.take();
            let queued_tasks = state.queue.drain(..).collect::<Vec<_>>();
            let stop_reason = state.stop_reason;
            state.lifecycle = if status.success() || stop_reason == Some(WorkerStopReason::Idle) {
                WorkerLifecycle::Stopped
            } else {
                WorkerLifecycle::Crashed
            };
            state.touch();
            (current_task_id, queued_tasks, stop_reason)
        };

        append_agent_diagnostic(
            &self.app,
            format!(
                "worker exit worker={} session_key={} success={} status={}",
                self.id,
                self.session_key,
                status.success(),
                exit_status_label(&status),
            ),
        );

        if let Some(task_id) = current_task_id {
            let task_state = if stop_reason == Some(WorkerStopReason::Cancelled) {
                "cancelled"
            } else {
                "failed"
            };
            if stop_reason.is_none() {
                let message = if status.success() {
                    "Agent worker 在任务完成前退出，未收到任务结果".to_string()
                } else {
                    format!(
                        "Agent worker 异常退出，任务未完成：{}",
                        exit_status_label(&status)
                    )
                };
                self.emit_error(&task_id, &message);
            }
            self.emit_task_state(&task_id, task_state);
            emit_agent_event(
                &self.app,
                json!({
                    "type": "exit",
                    "taskId": task_id,
                    "success": status.success(),
                    "code": status.code(),
                }),
            );
            Self::remove_task_from_supervisor(&self.supervisor, &task_id);
        }

        Self::remove_worker_from_supervisor(&self.supervisor, &self.session_key, self);

        if !queued_tasks.is_empty() && stop_reason != Some(WorkerStopReason::Idle) {
            Self::resubmit_queued_tasks(
                &self.supervisor,
                &self.app,
                self.session_key.clone(),
                queued_tasks,
            );
        } else {
            for task in queued_tasks {
                self.emit_error(&task.task_id, "Agent worker 已停止，队列任务已取消");
                self.emit_task_state(&task.task_id, "failed");
                Self::remove_task_from_supervisor(&self.supervisor, &task.task_id);
            }
        }
    }

    fn handle_task_result(self: &Arc<Self>, value: &Value) {
        let Some(task_id) = value.get("taskId").and_then(Value::as_str) else {
            append_agent_diagnostic(
                &self.app,
                format!(
                    "worker={} task_result missing taskId value={value}",
                    self.id
                ),
            );
            return;
        };
        let success = value
            .get("success")
            .and_then(Value::as_bool)
            .unwrap_or(false);

        self.complete_task(task_id, success);
    }

    fn complete_task(self: &Arc<Self>, task_id: &str, success: bool) {
        Self::remove_task_from_supervisor(&self.supervisor, task_id);
        self.emit_task_state(task_id, if success { "done" } else { "failed" });

        let next_task = {
            let mut state = match self.state.lock() {
                Ok(state) => state,
                Err(_) => return,
            };
            if state.current_task_id.as_deref() == Some(task_id) {
                state.current_task_id = None;
            }
            let next_task = state.queue.pop_front();
            if let Some(task) = &next_task {
                state.current_task_id = Some(task.task_id.clone());
                state.lifecycle = WorkerLifecycle::Running;
            } else {
                state.lifecycle = WorkerLifecycle::Idle;
            }
            state.touch();
            next_task
        };

        if let Some(task) = next_task {
            if let Err(error) = self.launch_task(task.clone()) {
                self.emit_error(&task.task_id, &error);
            }
        }
    }

    fn write_command(&self, command: &Value) -> Result<(), String> {
        let mut stdin = self
            .stdin
            .lock()
            .map_err(|_| "Agent runtime worker 输入通道已无法访问".to_string())?;
        let stdin = stdin
            .as_mut()
            .ok_or_else(|| "Agent runtime worker 输入通道已关闭".to_string())?;
        writeln!(stdin, "{command}")
            .map_err(|error| format!("发送 Agent runtime worker 命令失败：{error}"))?;
        stdin
            .flush()
            .map_err(|error| format!("刷新 Agent runtime worker 命令失败：{error}"))?;
        Ok(())
    }

    fn kill_child(&self) -> Result<(), String> {
        self.child
            .lock()
            .map_err(|_| "Agent runtime worker 进程已无法访问".to_string())?
            .kill()
            .map_err(|error| format!("终止 Agent runtime worker 失败：{error}"))
    }

    fn set_idle(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.lifecycle = WorkerLifecycle::Idle;
            state.touch();
        }
    }

    fn touch(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.touch();
        }
    }

    fn current_task_id(&self) -> Option<String> {
        self.state
            .lock()
            .ok()
            .and_then(|state| state.current_task_id.clone())
    }

    fn mark_current_state(&self, lifecycle: WorkerLifecycle, task_state: &str) {
        let task_id = {
            let mut state = match self.state.lock() {
                Ok(state) => state,
                Err(_) => return,
            };
            state.lifecycle = lifecycle;
            state.touch();
            state.current_task_id.clone()
        };

        if let Some(task_id) = task_id {
            self.emit_task_state(&task_id, task_state);
        }
    }

    fn emit_current_error(&self, message: &str) {
        if let Some(task_id) = self.current_task_id() {
            self.emit_error(&task_id, message);
        } else {
            append_agent_diagnostic(
                &self.app,
                format!("worker={} error without task {message}", self.id),
            );
        }
    }

    fn emit_error(&self, task_id: &str, message: &str) {
        emit_agent_event(
            &self.app,
            json!({
                "type": "error",
                "taskId": task_id,
                "message": message,
            }),
        );
    }

    fn emit_task_state(&self, task_id: &str, task_state: &str) {
        let (worker_state, queue_depth) = self
            .state
            .lock()
            .map(|state| (state.lifecycle.as_str(), state.queue.len()))
            .unwrap_or(("crashed", 0));
        emit_agent_event(
            &self.app,
            json!({
                "type": "state",
                "taskId": task_id,
                "taskState": task_state,
                "workerState": worker_state,
                "workerId": self.id,
                "sessionKey": self.session_key,
                "queueDepth": queue_depth,
            }),
        );
    }

    fn remove_task_from_supervisor(supervisor: &Weak<Mutex<SupervisorInner>>, task_id: &str) {
        if let Some(supervisor) = supervisor.upgrade() {
            if let Ok(mut inner) = supervisor.lock() {
                inner.task_index.remove(task_id);
            }
        }
    }

    fn remove_worker_from_supervisor(
        supervisor: &Weak<Mutex<SupervisorInner>>,
        session_key: &str,
        worker: &Arc<Self>,
    ) {
        if let Some(supervisor) = supervisor.upgrade() {
            if let Ok(mut inner) = supervisor.lock() {
                if inner
                    .workers
                    .get(session_key)
                    .is_some_and(|current| Arc::ptr_eq(current, worker))
                {
                    inner.workers.remove(session_key);
                }
            }
        }
    }

    fn resubmit_queued_tasks(
        supervisor: &Weak<Mutex<SupervisorInner>>,
        app: &AppHandle,
        session_key: String,
        queued_tasks: Vec<QueuedAgentTask>,
    ) {
        append_agent_diagnostic(
            app,
            format!(
                "worker resubmit queued session_key={} count={}",
                session_key,
                queued_tasks.len(),
            ),
        );

        let Some(supervisor) = supervisor.upgrade() else {
            for task in queued_tasks {
                emit_agent_event(
                    app,
                    json!({
                        "type": "error",
                        "taskId": task.task_id,
                        "message": "Agent supervisor 已停止，队列任务无法恢复",
                    }),
                );
            }
            return;
        };

        let worker = {
            let mut inner = match supervisor.lock() {
                Ok(inner) => inner,
                Err(_) => {
                    for task in queued_tasks {
                        emit_agent_event(
                            app,
                            json!({
                                "type": "error",
                                "taskId": task.task_id,
                                "message": "Agent runtime supervisor 状态已损坏，队列任务无法恢复",
                            }),
                        );
                    }
                    return;
                }
            };

            let worker = match inner.workers.get(&session_key) {
                Some(worker) if worker.is_usable() => worker.clone(),
                _ => match AgentRuntimeWorker::spawn(
                    app.clone(),
                    session_key.clone(),
                    Arc::downgrade(&supervisor),
                ) {
                    Ok(worker) => {
                        inner.workers.insert(session_key.clone(), worker.clone());
                        worker
                    }
                    Err(error) => {
                        for task in queued_tasks {
                            inner.task_index.remove(&task.task_id);
                            emit_agent_event(
                                app,
                                json!({
                                    "type": "error",
                                    "taskId": task.task_id,
                                    "message": format!("恢复 Agent 队列任务失败：{error}"),
                                }),
                            );
                        }
                        return;
                    }
                },
            };

            for task in &queued_tasks {
                inner
                    .task_index
                    .insert(task.task_id.clone(), worker.clone());
            }
            worker
        };

        for task in queued_tasks {
            let task_id = task.task_id.clone();
            worker.emit_task_state(&task_id, "recovering");
            if let Err(error) = worker.enqueue(task) {
                emit_agent_event(
                    app,
                    json!({
                        "type": "error",
                        "taskId": task_id,
                        "message": format!("恢复 Agent 队列任务失败：{error}"),
                    }),
                );
                Self::remove_task_from_supervisor(&Arc::downgrade(&supervisor), &task_id);
            }
        }
    }
}

impl AgentRuntimeWorkerState {
    fn touch(&mut self) {
        self.last_activity = Instant::now();
    }
}

impl WorkerLifecycle {
    fn as_str(self) -> &'static str {
        match self {
            WorkerLifecycle::Starting => "starting",
            WorkerLifecycle::Idle => "idle",
            WorkerLifecycle::Running => "running",
            WorkerLifecycle::WaitingUser => "waiting_user",
            WorkerLifecycle::Unhealthy => "unhealthy",
            WorkerLifecycle::Stopping => "stopping",
            WorkerLifecycle::Stopped => "stopped",
            WorkerLifecycle::Crashed => "crashed",
        }
    }
}
