import {
  applyAgentClientOutputEvent,
  createAgentClientOutputState,
  dispatchAgentClientOutputEvent,
  isAgentClientOutputEvent,
  snapshotAgentClientOutput,
} from "@/agent-client/output";
import { AgentClientTransportEventType, type AgentClientAgentEvent } from "@/agent-client/contracts";
import { createAgentClient } from "@/agent-client/runtime";
import { AgentRuntimeEventType } from "@/agent-client/wire";
import { readLedger } from "@/api/conversation-ledger";
import type { TavernAgentFlowRunAgentInput, TavernAgentFlowRunAgentOutput } from "../types";

const tavernAgentFlowClient = createAgentClient();

const resolveSystemPrompt = async (input: TavernAgentFlowRunAgentInput) => {
  const currentSystemPrompt = input.systemPrompt?.trim();
  const sessionRootDir = input.sessionRootDir?.trim();
  if (!currentSystemPrompt || !sessionRootDir) {
    return input.systemPrompt;
  }

  try {
    const ledger = await readLedger({
      workspacePath: input.workspacePath,
      sessionRootDir,
    });
    const hasCachedSystemPrompt = ledger?.messages.some(
      (message) => message.role === "system" && message.content.trim(),
    );
    return hasCachedSystemPrompt ? null : input.systemPrompt;
  } catch {
    return input.systemPrompt;
  }
};

export async function runTavernAgentFlowRuntimeAgent(
  input: TavernAgentFlowRunAgentInput,
): Promise<TavernAgentFlowRunAgentOutput> {
  const output = createAgentClientOutputState();
  let taskId = "";
  const pendingEvents: AgentClientAgentEvent[] = [];
  let unlisten: (() => void) | undefined;
  let settled = false;

  const resultPromise = new Promise<TavernAgentFlowRunAgentOutput>(async (resolve, reject) => {
    const rejectOnce = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
    const resolveOnce = (agentOutput: TavernAgentFlowRunAgentOutput) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(agentOutput);
    };

    const handleEvent = (envelope: AgentClientAgentEvent) => {
      if (!taskId) {
        pendingEvents.push(envelope);
        return;
      }

      if (envelope.taskId !== taskId) {
        return;
      }
      const event = envelope.event;

      if (event.type === AgentRuntimeEventType.Error) {
        rejectOnce(new Error(event.message));
        return;
      }

      if (event.type === AgentRuntimeEventType.Question) {
        rejectOnce(new Error("酒馆 Agent 请求了额外用户输入，当前流程暂不支持中途询问。"));
        return;
      }

      if (
        event.type === AgentClientTransportEventType.State &&
        (event.taskState === "failed" ||
          event.taskState === "error" ||
          event.taskState === "cancelled" ||
          event.workerState === "failed" ||
          event.workerState === "error")
      ) {
        rejectOnce(new Error(`Agent 任务失败：${event.taskState}/${event.workerState}`));
        return;
      }

      if (event.type === AgentClientTransportEventType.Exit && !event.success) {
        rejectOnce(new Error(`Agent 任务异常退出：${event.code ?? "unknown"}`));
        return;
      }

      if (!isAgentClientOutputEvent(event)) {
        return;
      }

      applyAgentClientOutputEvent(output, event);
      dispatchAgentClientOutputEvent(event, input);

      if (event.type === AgentRuntimeEventType.Done) {
        resolveOnce({
          ...snapshotAgentClientOutput(output),
          agentSession: event.runtimeSession ?? null,
          taskId,
        });
      }
    };

    try {
      const systemPrompt = await resolveSystemPrompt(input);
      taskId = crypto.randomUUID();
      unlisten = await tavernAgentFlowClient.events.subscribe(handleEvent);
      const task = await tavernAgentFlowClient.agent.run({
        taskId,
        workspacePath: input.workspacePath,
        sessionRootDir: input.sessionRootDir,
        agentRoleId: input.agentRoleId,
        userMessage: input.userMessage,
        systemPrompt,
        requestContext: input.requestContext,
        runtimeInstruction: input.runtimeInstruction,
        bootstrapInstruction: input.bootstrapInstruction,
        runtimeModel: input.runtimeModel,
        resources: {
          tools: { allowed: input.allowedTools ?? [] },
          skills: { enabled: input.enabledSkills ?? [] },
        },
      });
      if (task.taskId !== taskId) {
        throw new Error(`Agent runtime 返回了不匹配的任务 ID：${task.taskId}`);
      }
      pendingEvents.splice(0).forEach(handleEvent);
    } catch (error) {
      rejectOnce(error);
    }
  });

  try {
    return await resultPromise;
  } finally {
    unlisten?.();
  }
}
