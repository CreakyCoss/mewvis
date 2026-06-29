import {
  AgentResultType,
  type AgentDefinitionsResult,
  type AgentCommand,
  type PingCommand,
  type PongResult,
  type ShutdownAckResult,
  type ShutdownCommand,
  type TaskResult,
} from "../../../protocol/agent.js";
import { AgentEventType } from "../contracts/events.js";
import type { AgentRunCommand, EmitAgentEvent } from "../runtimes/types.js";
import { runtimeAgentManifest } from "../runtimes/registry.js";

export type WriteAgentRuntimeJsonLine = (value: unknown) => void;

type RequestCommand = {
  requestId?: string | null;
};

type TaskCommand = Pick<AgentRunCommand, "requestId" | "taskId">;

type TaskResultStatus = { success: true } | { success: false; message: string };

export const createAgentDefinitionsResult = (
  command: RequestCommand,
): AgentDefinitionsResult => ({
  type: AgentResultType.AgentDefinitions,
  requestId: command.requestId ?? null,
  defaultAgentId: runtimeAgentManifest.defaultAgentId,
  agents: runtimeAgentManifest.definitions,
});

export const createPongResult = (command: PingCommand): PongResult => ({
  type: AgentResultType.Pong,
  requestId: command.requestId ?? null,
});

export const createShutdownAckResult = (command: ShutdownCommand): ShutdownAckResult => ({
  type: AgentResultType.ShutdownAck,
  requestId: command.requestId ?? null,
});

export const createTaskResult = (
  command: TaskCommand,
  result: TaskResultStatus,
): TaskResult => ({
  type: AgentResultType.TaskResult,
  requestId: command.requestId ?? null,
  taskId: command.taskId,
  ...result,
});

export const writeTaskResult = (
  command: TaskCommand,
  writeJsonLine: WriteAgentRuntimeJsonLine,
  result: TaskResultStatus,
) => {
  writeJsonLine(createTaskResult(command, result));
};

export const emitCommandError = (
  command: AgentCommand,
  emit: EmitAgentEvent,
  message: string,
) => {
  emit({
    type: AgentEventType.Error,
    taskId: taskIdFromCommand(command),
    message,
  });
};

const taskIdFromCommand = (command: AgentCommand) =>
  "taskId" in command ? command.taskId ?? undefined : undefined;
