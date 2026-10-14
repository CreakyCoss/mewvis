import {
  AgentRuntimeResultType,
  type EmptyParams,
} from "../../../../protocol/wire.js";
import {
  type AgentToolsResult,
  type PongResult,
  type ShutdownAckResult,
  type TaskResult,
} from "../../../../protocol/index.js";
import type { AgentRunCommand } from "../runtimes/types.js";
import {
  AGENT_TOOL_DEFINITIONS,
  DEFAULT_ALLOWED_AGENT_TOOLS,
} from "../tools/definitions.js";
import { getAgentPermissionOptions } from "../../../../../security/safety/index.js";

type RequestCommand = {
  requestId?: string | null;
};

type TaskCommand = Pick<AgentRunCommand, "requestId" | "taskId">;

type TaskResultStatus = { success: true } | { success: false; message: string };

export const createAgentToolsResult = (
  command: RequestCommand & EmptyParams,
): AgentToolsResult => {
  return {
    type: AgentRuntimeResultType.AgentTools,
    requestId: command.requestId ?? null,
    tools: AGENT_TOOL_DEFINITIONS.map(
      ({ name, label, description, enabledByDefault }) => ({
        name,
        label,
        description,
        enabledByDefault,
      }),
    ),
    defaultToolNames: [...DEFAULT_ALLOWED_AGENT_TOOLS],
    permissionOptions: getAgentPermissionOptions(),
  };
};

export const createPongResult = (command: RequestCommand): PongResult => ({
  type: AgentRuntimeResultType.Pong,
  requestId: command.requestId ?? null,
});

export const createShutdownAckResult = (
  command: RequestCommand,
): ShutdownAckResult => ({
  type: AgentRuntimeResultType.ShutdownAck,
  requestId: command.requestId ?? null,
});

export const createTaskResult = (
  command: TaskCommand,
  result: TaskResultStatus,
): TaskResult => ({
  type: AgentRuntimeResultType.TaskResult,
  requestId: command.requestId ?? null,
  taskId: command.taskId,
  ...result,
});
