import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { SubtaskEvent } from "../../engines/protocol/wire.js";
import type {
  AgentRunCommand,
  AgentRuntimeContext,
} from "../../engines/drivers/native/agent/runtimes/types.js";

/** Stream child output in its own scope; child lifecycle never settles the parent. */
export async function runExtensionTask(
  input: { text: string; systemPrompt?: string; title?: string; avatar?: string },
  command: AgentRunCommand,
  context: AgentRuntimeContext,
  signal: AbortSignal,
) {
  if (!command.runtimeModel) throw new Error("请先选择模型");
  const childId = randomUUID();
  const taskId = `extension-child-${childId}`;
  let finished = false;
  const emit = (event: SubtaskEvent["event"]) => {
    if (finished) return;
    context.emit({
      type: "subtask_event",
      taskId: command.taskId,
      subtaskId: taskId,
      title: input.title ?? "子任务",
      ...(event.type === "started" && input.avatar ? { avatar: input.avatar } : {}),
      event,
    });
  };
  signal.throwIfAborted();
  emit({ type: "started", taskId });
  try {
    const result = await context.callbacks.runExtensionTask!(
      {
        ...command,
        taskId,
        sessionRootDir: command.sessionRootDir
          ? join(command.sessionRootDir, "children", childId)
          : undefined,
        agentRoleId: `extension-task-${childId}`,
        sessionLink: null,
        requestId: null,
        recordUserMessage: true,
        userMessage: input.text,
        systemPrompt: input.systemPrompt ?? null,
        requestContext: null,
        runtimeInstruction: null,
        bootstrapInstruction: null,
      },
      {
        signal,
        emit(event) {
          // Approval/questions use the parent's callback channel below. Terminal
          // output is emitted only once, after the child execution settles.
          switch (event.type) {
            case "text_delta":
            case "replace_text":
            case "thinking_delta":
            case "thinking_end":
            case "tool_call_start":
            case "tool_call_delta":
            case "tool_call_end":
            case "tool_execution_start":
            case "tool_execution_update":
            case "tool_execution_end":
              emit(event);
          }
        },
        callbacks: {
          ...context.callbacks,
          runExtensionTask: undefined,
          requestApproval:
            context.callbacks.requestApproval &&
            ((request) => context.callbacks.requestApproval!({ ...request, taskId: command.taskId })),
          requestUserInput: (request) =>
            context.callbacks.requestUserInput({ ...request, taskId: command.taskId }),
        },
      },
    );
    signal.throwIfAborted();
    emit({ type: "done", taskId, text: result.text });
    return result;
  } catch (error) {
    emit({
      type: "error",
      taskId,
      message: signal.aborted ? "任务已取消" : error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    finished = true;
  }
}
