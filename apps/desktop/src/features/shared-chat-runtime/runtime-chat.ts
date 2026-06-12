import { toAgentRuntimeModelInput } from "@/ai/agent-runtime/config";
import {
  applyAgentRuntimeOutputEvent,
  createAgentRuntimeOutputState,
  dispatchAgentRuntimeOutputEvent,
  snapshotAgentRuntimeOutput,
} from "@/ai/agent-runtime/output";
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
  const output = createAgentRuntimeOutputState();
  const onTextDelta = input.onTextDelta
    ? (delta: string) => {
      const event = { type: "text_delta" as const, delta };
      applyAgentRuntimeOutputEvent(output, event);
      dispatchAgentRuntimeOutputEvent(event, input);
    }
    : undefined;
  const onThinkingDelta = input.onThinkingDelta
    ? (delta: string) => {
      const event = { type: "thinking_delta" as const, delta };
      applyAgentRuntimeOutputEvent(output, event);
      dispatchAgentRuntimeOutputEvent(event, input);
    }
    : undefined;

  const result = await sharedAgentRuntime.run({
    type: "chat",
    agentId: input.agentId,
    runtimeModel: input.provider && input.model
      ? toAgentRuntimeModelInput(input.provider, input.model)
      : undefined,
    systemPrompt: input.systemPrompt,
    messages: input.messages,
    stream: input.stream ?? true,
    onTextDelta,
    onThinkingDelta,
  });
  applyAgentRuntimeOutputEvent(output, {
    type: "done",
    text: result.text,
  });
  if (result.thinking?.trim()) {
    applyAgentRuntimeOutputEvent(output, {
      type: "thinking_end",
      content: result.thinking,
    });
  }

  return snapshotAgentRuntimeOutput(output);
}
