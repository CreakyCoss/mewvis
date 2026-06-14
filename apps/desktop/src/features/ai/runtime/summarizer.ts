import {
  agentContext,
  type ConversationMessage,
  type ConversationSummarizer,
} from "@/ai/agent-context";
import type { RuntimeModelInput } from "@/ai/runtime-protocol";
import { runSharedRuntimeChat } from "./runtime-chat";

const {
  formatConversationForSummary,
} = agentContext;

export type SharedConversationSummaryPromptInput = {
  previousSummary: string;
  messages: ConversationMessage[];
  formattedConversation: string;
};

export type RunSharedConversationSummaryInput = {
  agentId?: string;
  runtimeModel: RuntimeModelInput;
  systemPrompt: string;
  previousSummary?: string;
  messages: ConversationMessage[];
  fallbackSummary?: string;
  buildUserPrompt?: (input: SharedConversationSummaryPromptInput) => string;
};

export type CreateSharedConversationSummarizerInput = Pick<
  RunSharedConversationSummaryInput,
  "agentId" | "runtimeModel" | "systemPrompt" | "buildUserPrompt"
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
  runtimeModel,
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
    runtimeModel,
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
  runtimeModel,
  systemPrompt,
  buildUserPrompt,
}: CreateSharedConversationSummarizerInput): ConversationSummarizer =>
  async ({ previousSummary, messages }) =>
    runSharedConversationSummary({
      agentId,
      runtimeModel,
      systemPrompt,
      previousSummary,
      messages,
      buildUserPrompt,
    });
