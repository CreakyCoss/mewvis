import { useCallback, useEffect, useRef, useState } from "react";
import { executeExtensionCommand, type ExtensionCommandTarget } from "@/api/extensions";
import { answerAgentRuntimeApproval, abortAgentRuntimeTask, listenAgentRuntimeAgentEvents } from "@/api/agent-runtime";
import { observeConnection, getConnectionState } from "@/transport/events";
import { requestBackend, BackendError } from "@/transport/http";

import {
  AgentRuntimeEventType,
  AgentRuntimeResultType,
  type ApprovalRequestedEvent,
  type ExtensionCommandResult,
} from "@/agent-client/wire";
import { AgentClientTransportEventType, type AgentClientAgentEvent } from "@/agent-client/contracts";

type Approval = ApprovalRequestedEvent;
type Result = ExtensionCommandResult;
type CommandEvent = AgentClientAgentEvent["event"];
const terminal = new Set(["done", "failed", "cancelled"]);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Keep command identity with the open chat, not the visible side panel. Never replay a write after reconnect. */
export function useExtensionCommands(target: ExtensionCommandTarget) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [answering, setAnswering] = useState(false);
  const active = useRef<string | null>(null);
  const dispose = useRef<(() => void) | undefined>(undefined);
  const mounted = useRef(true);
  const subscription = useRef(0);
  const accepted = useRef(false);
  const recovering = useRef(false);
  const key = `isle:extension-command:${target.workspacePath}:${target.chatId}`;
  const onEvent = useCallback((taskId: string, event: CommandEvent) => {
    if (!mounted.current || active.current !== taskId) return;
    if (event.type === AgentRuntimeEventType.ApprovalRequested) {
      setApproval(event);
      setStatus("waiting_user");
    }
    if (event.type === AgentRuntimeEventType.ApprovalResolved) setApproval(null);
    if (event.type === AgentRuntimeEventType.Error) setError(event.message ?? "命令执行失败");
    if (event.type === AgentRuntimeResultType.ExtensionCommandResult) {
      setResult(event);
      setApproval(null);
      if (!event.success) setError(event.message ?? "命令执行失败");
    }
    if (event.type === AgentClientTransportEventType.State && event.taskState) {
      setStatus(event.taskState);
      if (event.taskState !== "waiting_user") setApproval(null);
      if (terminal.has(event.taskState)) {
        active.current = null;
        setApproval(null);
        dispose.current?.();
        dispose.current = undefined;
      }
    }
  }, []);
  const subscribe = useCallback(
    async (taskId: string) => {
      const generation = ++subscription.current;
      dispose.current?.();
      dispose.current = undefined;
      active.current = taskId;
      const stop = await listenAgentRuntimeAgentEvents((payload) => {
        if (payload.taskId === taskId) onEvent(taskId, payload.event);
      });
      if (!mounted.current || active.current !== taskId || generation !== subscription.current) {
        stop();
        return false;
      }
      dispose.current = stop;
      return true;
    },
    [onEvent],
  );
  const recover = useCallback(async () => {
    const taskId = active.current;
    if (!taskId || recovering.current) return;
    recovering.current = true;
    try {
      if (!dispose.current && !(await subscribe(taskId))) return;
      const snapshot = await (await requestBackend(`tasks/${encodeURIComponent(taskId)}`)).json();
      if (active.current !== taskId) return;
      setError("");
      if (snapshot.result) onEvent(taskId, snapshot.result);
      if (snapshot.pendingInput) onEvent(taskId, snapshot.pendingInput);
      onEvent(taskId, {
        type: AgentClientTransportEventType.State,
        taskState: snapshot.taskState,
        workerState: snapshot.workerState,
      });
    } catch (caught) {
      if (active.current !== taskId) return;
      setError(message(caught));
      if (caught instanceof BackendError && caught.status === 404) {
        onEvent(taskId, { type: AgentClientTransportEventType.State, taskState: "failed", workerState: "unknown" });
      }
    } finally {
      recovering.current = false;
    }
  }, [onEvent, subscribe]);
  useEffect(() => {
    mounted.current = true;
    accepted.current = false;
    setStatus("");
    setError("");
    setResult(null);
    setApproval(null);
    const taskId = sessionStorage.getItem(key);
    if (taskId) {
      setStatus("connecting");
      void subscribe(taskId)
        .then((ready) => {
          if (ready) {
            accepted.current = true;
            return recover();
          }
        })
        .catch((caught) => {
          if (mounted.current) setError(message(caught));
        });
    }
    const stop = observeConnection(() => {
      if (accepted.current && getConnectionState() === "connected") void recover();
    });
    return () => {
      mounted.current = false;
      active.current = null;
      ++subscription.current;
      dispose.current?.();
      dispose.current = undefined;
      stop();
    };
  }, [key, subscribe, recover]);

  const execute = async (commandId: string, args: Record<string, unknown>) => {
    if (active.current) return;
    const taskId = crypto.randomUUID();
    active.current = taskId;
    accepted.current = false;
    setStatus("connecting");
    setError("");
    setResult(null);
    setApproval(null);
    try {
      if (!(await subscribe(taskId))) return;
      sessionStorage.setItem(key, taskId);
      await executeExtensionCommand({ ...target, taskId, commandId, arguments: args });
      accepted.current = true;
      await recover();
    } catch (caught) {
      if (!mounted.current || active.current !== taskId) return;
      setError(message(caught));
      accepted.current = true;
      // Check acceptance before allowing another submission; HTTP errors never trigger a replay.
      await recover();
    }
  };
  const answer = async (approved: boolean) => {
    if (!active.current || !approval || answering) return;
    setAnswering(true);
    try {
      await answerAgentRuntimeApproval({ taskId: active.current, approvalId: approval.approvalId, approved });
      setApproval(null);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setAnswering(false);
    }
  };
  const cancel = async () => {
    if (!active.current) return;
    try {
      await abortAgentRuntimeTask(active.current);
      await recover();
    } catch (caught) {
      setError(message(caught));
    }
  };
  return {
    status,
    error,
    result,
    approval,
    answering,
    busy: !!status && !terminal.has(status),
    execute,
    answer,
    cancel,
    recover,
  };
}
export type ExtensionCommandController = ReturnType<typeof useExtensionCommands>;
