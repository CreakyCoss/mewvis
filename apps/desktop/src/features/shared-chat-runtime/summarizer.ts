import {
  formatConversationForSummary,
  type ConversationMessage,
  type ConversationSummarizer,
} from "@/ai/agent-context";
import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
import { runSharedRuntimeChat } from "./runtime-chat";

export type SharedConversationSummaryPromptInput = {
  previousSummary: string;
  messages: ConversationMessage[];
  formattedConversation: string;
};

export type RunSharedConversationSummaryInput = {
  agentId?: string;
  provider: LlmProvider;
  model: ProviderModel;
  systemPrompt: string;
  previousSummary?: string;
  messages: ConversationMessage[];
  fallbackSummary?: string;
  buildUserPrompt?: (input: SharedConversationSummaryPromptInput) => string;
};

export type CreateSharedConversationSummarizerInput = Pick<
  RunSharedConversationSummaryInput,
  "agentId" | "provider" | "model" | "systemPrompt" | "buildUserPrompt"
>;

const buildDefaultSummaryUserPrompt = ({
  previousSummary,
  formattedConversation,
}: SharedConversationSummaryPromptInput) => [
  previousSummary ? `已有摘要：\n${previousSummary}` : "已有摘要：无",
  "",
  "需要并入摘要的新对话：",
  formattedConversation,
].join("\n");

export const runSharedConversationSummary = async ({
  agentId,
  provider,
  model,
  systemPrompt,
  previousSummary = "",
  messages,
  fallbackSummary,
  buildUserPrompt = buildDefaultSummaryUserPrompt,
}: RunSharedConversationSummaryInput) => {
  if (messages.length === 0) {
    return previousSummary;
  }

  const formattedConversation = formatConversationForSummary(messages);
  const result = await runSharedRuntimeChat({
    agentId,
    provider,
    model,
    stream: false,
    systemPrompt,
    messages: [{
      id: `summary-${crypto.randomUUID()}`,
      role: "user",
      content: buildUserPrompt({
        previousSummary,
        messages,
        formattedConversation,
      }),
      timestamp: Date.now(),
      metadata: null,
    }],
  });

  return result.text.trim() || fallbackSummary || previousSummary;
};

export const createSharedConversationSummarizer = ({
  agentId,
  provider,
  model,
  systemPrompt,
  buildUserPrompt,
}: CreateSharedConversationSummarizerInput): ConversationSummarizer =>
  async ({ previousSummary, messages }) =>
    runSharedConversationSummary({
      agentId,
      provider,
      model,
      systemPrompt,
      previousSummary,
      messages,
      buildUserPrompt,
    });
