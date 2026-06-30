export type RuntimeAgentCapability = "agent" | "chat";

export type RuntimeAgentDefinition = Readonly<{
  id: string;
  label: string;
  description: string;
  capabilities: readonly RuntimeAgentCapability[];
  requiresModel: boolean;
}>;

export type ChatMessageInput = {
  role: string;
  content: string;
};
