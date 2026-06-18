import type { ConversationMessage } from "./protocol/context";

export type PreparedAgentConversationContext = {
  summary: string;
  recentMessages: ConversationMessage[];
  syncStatus?: "fresh" | "stale";
  agentRoleId?: string | null;
};

export type PreparedAgentRunContext = {
  agentRoleId: string;
  bootstrapContext: string;
  prompt: string;
  shouldBootstrapAgentContext: boolean;
  bootstrapHistory: PreparedAgentConversationContext;
  promptHistory: PreparedAgentConversationContext;
};
