import {
  createAgentClient,
} from "@/agent-client/runtime";
import type {
  AgentClientAgentEvent,
  AgentClientCollaborationEvent,
  AgentClientCollaborationInput,
  AgentClientCollaborationResult,
} from "@/agent-client/contracts";

const tavernCollaborationClient = createAgentClient();

export type RunTavernCollaborationInput = AgentClientCollaborationInput & {
  onEvent?: (event: AgentClientCollaborationEvent) => void;
  onAgentEvent?: (
    event: Extract<AgentClientCollaborationEvent, { type: "agent_event" }>,
  ) => void;
};

export type TavernCollaborationOutput = AgentClientCollaborationResult & {
  taskId: string;
};

const isCollaborationEvent = (
  event: AgentClientAgentEvent,
): event is AgentClientCollaborationEvent =>
  event.type === "workflow_started" ||
  event.type === "step_started" ||
  event.type === "agent_event" ||
  event.type === "step_done" ||
  event.type === "step_skipped" ||
  event.type === "workflow_done" ||
  event.type === "collaboration_result";

const isFailureState = (event: AgentClientAgentEvent) =>
  event.type === "error" ||
  (
    event.type === "state" &&
    (
      event.taskState === "failed" ||
      event.taskState === "error" ||
      event.taskState === "cancelled" ||
      event.workerState === "failed" ||
      event.workerState === "error"
    )
  ) ||
  (event.type === "exit" && !event.success);

const errorMessageFromEvent = (event: AgentClientAgentEvent) => {
  if (event.type === "error") {
    return event.message;
  }
  if (event.type === "state") {
    return `协作任务失败：${event.taskState}/${event.workerState}`;
  }
  if (event.type === "exit") {
    return `协作任务异常退出：${event.code ?? "unknown"}`;
  }
  return "协作任务失败";
};

export const runTavernCollaboration = async ({
  onEvent,
  onAgentEvent,
  ...input
}: RunTavernCollaborationInput): Promise<TavernCollaborationOutput> => {
  let taskId = "";
  let unlisten: (() => void) | undefined;
  let settled = false;

  const resultPromise = new Promise<TavernCollaborationOutput>(async (resolve, reject) => {
    const rejectOnce = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
    const resolveOnce = (result: TavernCollaborationOutput) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    try {
      unlisten = await tavernCollaborationClient.subscribe((event) => {
        if (!taskId || ("taskId" in event && event.taskId !== taskId)) {
          return;
        }

        if (isFailureState(event)) {
          rejectOnce(new Error(errorMessageFromEvent(event)));
          return;
        }

        if (!isCollaborationEvent(event)) {
          return;
        }

        onEvent?.(event);
        if (event.type === "agent_event") {
          onAgentEvent?.(event);
          return;
        }

        if (event.type === "workflow_done") {
          resolveOnce({
            ...event.result,
            taskId,
          });
          return;
        }

        if (event.type === "collaboration_result") {
          const { type: _type, requestId: _requestId, taskId: _eventTaskId, ...result } = event;
          resolveOnce({
            ...result,
            taskId,
          });
        }
      });

      const task = await tavernCollaborationClient.run(input);
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
};
