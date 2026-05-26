import type { AgentRunResult, AskUserInput, BridgeEvent, ChatCommand, ChatResult, StartTaskCommand } from "./protocol.js";

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

export type RuntimeMode = "agent" | "llm";

export abstract class BaseAgent {
  constructor(readonly id: string) {}

  abstract run(
    command: StartTaskCommand,
    context: AgentRunnerContext,
  ): Promise<AgentRunResult>;
}

export abstract class BaseLLM {
  constructor(readonly id: string) {}

  abstract chat(command: ChatCommand): Promise<ChatResult>;
}

export type AgentRuntime = BaseAgent;

export type LlmRuntime = BaseLLM;

export type BridgeRuntimeProvider = {
  id: string;
  agent?: AgentRuntime;
  llm?: LlmRuntime;
};
