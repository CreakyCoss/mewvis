import {
  applyAgentClientOutputEvent,
  createAgentClientOutputState,
  dispatchAgentClientOutputEvent,
  snapshotAgentClientOutput,
} from "@/agent-client/output";
import { createAgentClient } from "@/agent-client/runtime";
import type { AgentClientSession } from "@/agent-client/contracts";
import type { RuntimeModelInput } from "@/agent-client/protocol";
import type { TavernRuntimeMessage } from "./conversation";

const tavernAgentClient = createAgentClient();

export type RunTavernRuntimeChatInput = {
  agentId?: string;
  workspacePath?: string | null;
  sessionRootDir?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  systemPrompt: string;
  userMessage?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  messages?: TavernRuntimeMessage[];
  stream?: boolean;
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

export type TavernRuntimeChatOutput = {
  text: string;
  thinking?: string | null;
  agentSession?: AgentClientSession | null;
};

const latestUserMessageContent = (messages: TavernRuntimeMessage[] | undefined) => {
  for (const message of (messages ?? []).slice().reverse()) {
    if (message.role === "user" && message.content.trim()) {
      return message.content.trim();
    }
  }
  return "";
};

export async function runTavernRuntimeChat(
  input: RunTavernRuntimeChatInput,
): Promise<TavernRuntimeChatOutput> {
  const output = createAgentClientOutputState();
  const onTextDelta = input.onTextDelta
    ? (delta: string) => {
      const event = { type: "text_delta" as const, delta };
      applyAgentClientOutputEvent(output, event);
      dispatchAgentClientOutputEvent(event, input);
    }
    : undefined;
  const onThinkingDelta = input.onThinkingDelta
    ? (delta: string) => {
      const event = { type: "thinking_delta" as const, delta };
      applyAgentClientOutputEvent(output, event);
      dispatchAgentClientOutputEvent(event, input);
    }
    : undefined;

  const result = await tavernAgentClient.run({
    type: "chat",
    agentId: input.agentId,
    workspacePath: input.workspacePath,
    sessionRootDir: input.sessionRootDir,
    runtimeModel: input.runtimeModel,
    systemPrompt: input.systemPrompt,
    userMessage: input.userMessage ?? latestUserMessageContent(input.messages),
    requestContext: input.requestContext,
    runtimeInstruction: input.runtimeInstruction,
    messages: input.messages,
    stream: input.stream ?? true,
    onTextDelta,
    onThinkingDelta,
  });
  applyAgentClientOutputEvent(output, {
    type: "done",
    text: result.text,
  });
  if (result.thinking?.trim()) {
    applyAgentClientOutputEvent(output, {
      type: "thinking_end",
      content: result.thinking,
    });
  }

  return {
    ...snapshotAgentClientOutput(output),
    agentSession: result.agentSession ?? null,
  };
}
