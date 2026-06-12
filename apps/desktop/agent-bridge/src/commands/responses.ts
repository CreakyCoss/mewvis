import {
  BridgeEventType,
  BridgeResultType,
  type AgentDefinitionsResult,
  type BridgeCommand,
  type PingCommand,
  type PongResult,
  type ShutdownAckResult,
  type ShutdownCommand,
  type StartTaskCommand,
  type TaskResult,
} from "../contracts/protocol.js";
import type { EmitBridgeEvent } from "../runtimes/types.js";
import {
  bridgeAgentManifest,
} from "../runtimes/index.js";

export type WriteBridgeJsonLine = (value: unknown) => void;

type RequestCommand = {
  requestId?: string | null;
};

type TaskResultStatus = { success: true } | { success: false; message: string };

export const createAgentDefinitionsResult = (
  command: RequestCommand,
): AgentDefinitionsResult => ({
  type: BridgeResultType.AgentDefinitions,
  requestId: command.requestId ?? null,
  defaultAgentId: bridgeAgentManifest.defaultAgentId,
  agents: bridgeAgentManifest.definitions,
});

export const createPongResult = (command: PingCommand): PongResult => ({
  type: BridgeResultType.Pong,
  requestId: command.requestId ?? null,
});

export const createShutdownAckResult = (command: ShutdownCommand): ShutdownAckResult => ({
  type: BridgeResultType.ShutdownAck,
  requestId: command.requestId ?? null,
});

export const createTaskResult = (
  command: StartTaskCommand,
  result: TaskResultStatus,
): TaskResult => ({
  type: BridgeResultType.TaskResult,
  requestId: command.requestId ?? null,
  taskId: command.taskId,
  ...result,
});

export const writeTaskResult = (
  command: StartTaskCommand,
  writeJsonLine: WriteBridgeJsonLine,
  result: TaskResultStatus,
) => {
  writeJsonLine(createTaskResult(command, result));
};

export const emitCommandError = (
  command: BridgeCommand,
  emit: EmitBridgeEvent,
  message: string,
) => {
  emit({
    type: BridgeEventType.Error,
    taskId: taskIdFromCommand(command),
    message,
  });
};

const taskIdFromCommand = (command: BridgeCommand) =>
  "taskId" in command ? command.taskId : undefined;
