import {
  applyAgentClientOutputEvent,
  createAgentClientOutputState,
  dispatchAgentClientOutputEvent,
  snapshotAgentClientOutput,
} from "@/agent-client/output";
import { createAgentClient } from "@/agent-client/runtime";
import type {
  AgentClientAgentEvent,
  AgentClientSession,
} from "@/agent-client/contracts";
import type {
  RuntimeAgentToolName,
  RuntimeModelInput,
} from "@/agent-client/protocol";

const tavernAgentClient = createAgentClient();

export type RunTavernRuntimeAgentInput = {
  agentId?: string | null;
  workspacePath: string;
  sessionRootDir?: string | null;
  agentRoleId: string;
  runtimeModel?: RuntimeModelInput | null;
  userMessage: string;
  systemPrompt?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
  allowedTools?: RuntimeAgentToolName[];
  enabledSkills?: string[];
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

export type TavernRuntimeAgentOutput = {
  text: string;
  thinking?: string | null;
  agentSession?: AgentClientSession | null;
  taskId: string;
};

const isOutputEvent = (
  event: AgentClientAgentEvent,
) => event.type === "text_delta" ||
  event.type === "thinking_delta" ||
  event.type === "thinking_end" ||
  event.type === "replace_text" ||
  event.type === "done";

export async function runTavernRuntimeAgent(
  input: RunTavernRuntimeAgentInput,
): Promise<TavernRuntimeAgentOutput> {
  const output = createAgentClientOutputState();
  let taskId = "";
  let unlisten: (() => void) | undefined;
  let settled = false;

  const resultPromise = new Promise<TavernRuntimeAgentOutput>(async (resolve, reject) => {
    const rejectOnce = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
    const resolveOnce = (output: TavernRuntimeAgentOutput) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(output);
    };

    try {
      unlisten = await tavernAgentClient.subscribe((event) => {
        if (!taskId || ("taskId" in event && event.taskId !== taskId)) {
          return;
        }

        if (event.type === "error") {
          rejectOnce(new Error(event.message));
          return;
        }

        if (
          event.type === "state" &&
          (
            event.taskState === "failed" ||
            event.taskState === "error" ||
            event.taskState === "cancelled" ||
            event.workerState === "failed" ||
            event.workerState === "error"
          )
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
            agentSession: event.agentSession ?? null,
            taskId,
          });
        }
      });

      const task = await tavernAgentClient.run({
        type: "agent",
        agentId: input.agentId,
        workspacePath: input.workspacePath,
        sessionRootDir: input.sessionRootDir,
        agentRoleId: input.agentRoleId,
        userMessage: input.userMessage,
        systemPrompt: input.systemPrompt,
        requestContext: input.requestContext,
        runtimeInstruction: input.runtimeInstruction,
        bootstrapInstruction: input.bootstrapInstruction,
        runtimeModel: input.runtimeModel,
        allowedTools: input.allowedTools ?? [],
        enabledSkills: input.enabledSkills ?? [],
      });
      taskId = task.taskId;
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
