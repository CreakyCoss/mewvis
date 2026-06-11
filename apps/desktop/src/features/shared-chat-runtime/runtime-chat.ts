import { toAgentRuntimeModelInput } from "@/ai/agent-runtime/config";
import { createAgentRuntime } from "@/ai/agent-runtime/runtime";
import type { ConversationMessage } from "@/ai/agent-context";
import type { LlmProvider, ProviderModel } from "@/ai/llm/types";

const sharedAgentRuntime = createAgentRuntime();

export type RunSharedRuntimeChatInput = {
  agentId?: string;
  provider?: LlmProvider | null;
  model?: ProviderModel | null;
  systemPrompt: string;
  messages: ConversationMessage[];
  stream?: boolean;
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

export type RunSharedRuntimeChatOutput = {
  text: string;
  thinking?: string | null;
};

export async function runSharedRuntimeChat(
  input: RunSharedRuntimeChatInput,
): Promise<RunSharedRuntimeChatOutput> {
  return sharedAgentRuntime.run({
    type: "chat",
    agentId: input.agentId,
    runtimeModel: input.provider && input.model
      ? toAgentRuntimeModelInput(input.provider, input.model)
      : undefined,
    systemPrompt: input.systemPrompt,
    messages: input.messages,
    stream: input.stream ?? true,
    onTextDelta: input.onTextDelta,
    onThinkingDelta: input.onThinkingDelta,
  });
}
