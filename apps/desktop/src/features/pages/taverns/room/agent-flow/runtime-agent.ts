import {
  applyAgentClientOutputEvent,
  createAgentClientOutputState,
  dispatchAgentClientOutputEvent,
  snapshotAgentClientOutput,
} from "@/agent-client/output";
import { createAgentClient } from "@/agent-client/runtime";
import type { AgentClientAgentEvent } from "@/agent-client/types";
import { readLedger } from "@/features/ai/components/conversation-ledger/api";
import type { TavernAgentFlowRunAgentInput, TavernAgentFlowRunAgentOutput } from "./types";

const tavernAgentFlowClient = createAgentClient();

const isOutputEvent = (event: AgentClientAgentEvent) =>
  event.type === "text_delta" ||
  event.type === "thinking_delta" ||
  event.type === "thinking_end" ||
  event.type === "replace_text" ||
  event.type === "done";

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

    const handleEvent = (event: AgentClientAgentEvent) => {
      const eventTaskId = "taskId" in event ? event.taskId : undefined;
      if (!taskId) {
        if (eventTaskId) {
          pendingEvents.push(event);
          return;
        }

        if (event.type === "error") {
          rejectOnce(new Error(event.message));
        }
        return;
      }

      if (eventTaskId && eventTaskId !== taskId) {
        return;
      }

      if (event.type === "error") {
        rejectOnce(new Error(event.message));
        return;
      }

      if (event.type === "question") {
        rejectOnce(new Error("酒馆 Agent 请求了额外用户输入，当前流程暂不支持中途询问。"));
        return;
      }

      if (
        event.type === "state" &&
        (event.taskState === "failed" ||
          event.taskState === "error" ||
          event.taskState === "cancelled" ||
          event.workerState === "failed" ||
          event.workerState === "error")
      ) {
        rejectOnce(new Error(`Agent 任务失败：${event.taskState}/${event.workerState}`));
        return;
      }

      if (event.type === "exit" && !event.success) {
        rejectOnce(new Error(`Agent 任务异常退出：${event.code ?? "unknown"}`));
        return;
      }

      if (!isOutputEvent(event)) {
        return;
      }

      applyAgentClientOutputEvent(output, event);
      dispatchAgentClientOutputEvent(event, input);

      if (event.type === "done") {
        resolveOnce({
          ...snapshotAgentClientOutput(output),
          agentSession: event.runtimeSession ?? null,
          taskId,
        });
      }
    };

    try {
      const systemPrompt = await resolveSystemPrompt(input);
      unlisten = await tavernAgentFlowClient.events.subscribe(handleEvent);
      const task = await tavernAgentFlowClient.agent.run({
        workspacePath: input.workspacePath,
        sessionRootDir: input.sessionRootDir,
        agentRoleId: input.agentRoleId,
        userMessage: input.userMessage,
        systemPrompt,
        requestContext: input.requestContext,
        runtimeInstruction: input.runtimeInstruction,
        bootstrapInstruction: input.bootstrapInstruction,
        runtimeModel: input.runtimeModel,
        allowedTools: input.allowedTools ?? [],
        enabledSkills: input.enabledSkills ?? [],
      });
      taskId = task.taskId;
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
