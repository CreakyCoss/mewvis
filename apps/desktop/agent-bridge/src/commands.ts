import {
  BRIDGE_AGENT_DEFINITIONS,
  DEFAULT_BRIDGE_AGENT_ID,
} from "./runtimes/index.js";
import { resolveBridgeRunner } from "./runners/index.js";
import { isRunnableBridgeCommand } from "./runners/types.js";
import {
  BridgeCommandType,
  BridgeResultType,
  type AgentDefinitionsResult,
  type AnswerQuestionCommand,
  type BridgeCommand,
  type ChatCommand,
  type ChatResult,
  type StartTaskCommand,
} from "./contracts/protocol.js";
import type { AskUser, EmitBridgeEvent } from "./contracts/runtime.js";

export const createAgentDefinitionsResult = (): AgentDefinitionsResult => ({
  type: BridgeResultType.AgentDefinitions,
  defaultAgentId: DEFAULT_BRIDGE_AGENT_ID,
  agents: BRIDGE_AGENT_DEFINITIONS,
});

export const createAgentDefinitionsResultForCommand = (
  command: { requestId?: string | null },
): AgentDefinitionsResult => ({
  ...createAgentDefinitionsResult(),
  requestId: command.requestId ?? null,
});

export const handleChatCommand = async (
  command: ChatCommand,
  emit: EmitBridgeEvent,
): Promise<ChatResult> => {
  const { runner } = resolveBridgeRunner(command);
  const result = await runner(command, { emit });
  return {
    ...result,
    requestId: command.requestId ?? null,
  };
};

export const handleStartTaskCommand = async (
  command: StartTaskCommand,
  emit: EmitBridgeEvent,
  askUser: AskUser,
) => {
  const { runner } = resolveBridgeRunner(command);
  await runner(command, {
    askUser,
    emit,
  });
};

export const handleRunnableCommand = async (
  command: Exclude<BridgeCommand, AnswerQuestionCommand>,
  emit: EmitBridgeEvent,
  askUser: AskUser,
): Promise<ChatResult | void> => {
  if (!isRunnableBridgeCommand(command)) {
    throw new Error("Agent bridge 首条命令必须是 start_task 或 chat");
  }

  if (command.type === BridgeCommandType.Chat) {
    return handleChatCommand(command, emit);
  }

  await handleStartTaskCommand(command, emit, askUser);
};
