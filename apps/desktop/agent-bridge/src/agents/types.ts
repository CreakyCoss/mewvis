import type { AskUserInput, BridgeEvent, StartTaskCommand } from "../protocol.js";

export type AskUser = (
  taskId: string,
  question: string,
  context?: string | null,
  input?: AskUserInput,
) => Promise<string>;

export type EmitBridgeEvent = (event: BridgeEvent) => void;

export type AgentRunnerContext = {
  askUser: AskUser;
  emit: EmitBridgeEvent;
};

export type AgentRunner = (
  command: StartTaskCommand,
  context: AgentRunnerContext,
) => Promise<void>;
