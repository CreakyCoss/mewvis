import { AgentRuntimeResultType, type EmptyParams } from "../../../../protocol/wire.js";
import {
  type AgentToolsResult,
  type PongResult,
  type RuntimeModelsResult,
  type ShutdownAckResult,
  type TaskResult,
} from "../../../../protocol/index.js";
import type { AgentRunCommand } from "../runtimes/types.js";
import { AGENT_TOOL_DEFINITIONS, DEFAULT_ALLOWED_AGENT_TOOLS } from "../tools/definitions.js";
import { MODEL_CATALOG } from "../../../../models/index.js";
import { getAgentPermissionOptions } from "../../../../safety/permissions.js";

type RequestCommand = {
  requestId?: string | null;
};

type TaskCommand = Pick<AgentRunCommand, "requestId" | "taskId">;

type TaskResultStatus = { success: true } | { success: false; message: string };

export const createAgentToolsResult = (command: RequestCommand & EmptyParams): AgentToolsResult => {
  return {
    type: AgentRuntimeResultType.AgentTools,
    requestId: command.requestId ?? null,
    tools: AGENT_TOOL_DEFINITIONS.map(({ name, label, description, enabledByDefault }) => ({
      name,
      label,
      description,
      enabledByDefault,
    })),
    defaultToolNames: [...DEFAULT_ALLOWED_AGENT_TOOLS],
    permissionOptions: getAgentPermissionOptions(),
  };
};

export const createRuntimeModelsResult = (command: RequestCommand): RuntimeModelsResult => ({
  type: AgentRuntimeResultType.RuntimeModels,
  requestId: command.requestId ?? null,
  catalog: MODEL_CATALOG,
});

export const createPongResult = (command: RequestCommand): PongResult => ({
  type: AgentRuntimeResultType.Pong,
  requestId: command.requestId ?? null,
});

export const createShutdownAckResult = (command: RequestCommand): ShutdownAckResult => ({
  type: AgentRuntimeResultType.ShutdownAck,
  requestId: command.requestId ?? null,
});

export const createTaskResult = (command: TaskCommand, result: TaskResultStatus): TaskResult => ({
  type: AgentRuntimeResultType.TaskResult,
  requestId: command.requestId ?? null,
  taskId: command.taskId,
  ...result,
});
