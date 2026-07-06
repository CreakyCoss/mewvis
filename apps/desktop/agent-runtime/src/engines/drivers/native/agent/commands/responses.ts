import {
  AgentResultType,
  type AgentToolsResult,
  type PongResult,
  type RuntimeModelsResult,
  type ShutdownAckResult,
  type TaskResult,
} from "../../../../protocol/index.js";
import type { AgentRunCommand } from "../runtimes/types.js";
import { AGENT_TOOL_DEFINITIONS, DEFAULT_ALLOWED_AGENT_TOOLS } from "../tools/definitions.js";
import { MODEL_CATALOG } from "../../../../models/index.js";

type RequestCommand = {
  requestId?: string | null;
};

type TaskCommand = Pick<AgentRunCommand, "requestId" | "taskId">;

type TaskResultStatus = { success: true } | { success: false; message: string };

export const createAgentToolsResult = (command: RequestCommand): AgentToolsResult => ({
  type: AgentResultType.AgentTools,
  requestId: command.requestId ?? null,
  tools: AGENT_TOOL_DEFINITIONS,
  defaultToolNames: [...DEFAULT_ALLOWED_AGENT_TOOLS],
});

export const createRuntimeModelsResult = (command: RequestCommand): RuntimeModelsResult => ({
  type: AgentResultType.RuntimeModels,
  requestId: command.requestId ?? null,
  catalog: MODEL_CATALOG,
});

export const createPongResult = (command: RequestCommand): PongResult => ({
  type: AgentResultType.Pong,
  requestId: command.requestId ?? null,
});

export const createShutdownAckResult = (command: RequestCommand): ShutdownAckResult => ({
  type: AgentResultType.ShutdownAck,
  requestId: command.requestId ?? null,
});

export const createTaskResult = (command: TaskCommand, result: TaskResultStatus): TaskResult => ({
  type: AgentResultType.TaskResult,
  requestId: command.requestId ?? null,
  taskId: command.taskId,
  ...result,
});
