import type { RuntimeModelInput } from "@/agent-client/types";
import type { AiAgent } from "@/features/pages/settings/agent/types";
import type { WorkspaceSkill } from "@/features/pages/skills/types";

export type ChatInputResourceOption = {
  value: string;
  label: string;
  description: string;
  isDefault: boolean;
};

export type ChatInputSkillOption = WorkspaceSkill & {
  label: string;
};

export type ChatInputSkillGroupOption = ChatInputResourceOption & {
  skills: ChatInputSkillOption[];
};

export type ChatInputModelOption = ChatInputResourceOption & {
  selectedLabel: string;
  runtimeModel: RuntimeModelInput;
};

export type ChatInputAgentOption = ChatInputResourceOption & {
  agent: AiAgent;
};

export type ChatInputResources = {
  models?: ChatInputModelOption[];
  agents?: ChatInputAgentOption[];
  skillGroups?: ChatInputSkillGroupOption[];
  tools?: ChatInputResourceOption[];
};

export type ChatInputOptionValues = {
  selectedModelId: string;
  selectedAgentId: string;
  selectedSkillKeys: string[];
  selectedToolNames: string[];
  showThinkingProcess: boolean;
  showToolCallProcess: boolean;
};

export type ChatInputSubmitResources = {
  model: RuntimeModelInput;
  agent: AiAgent | null;
  skills: WorkspaceSkill[];
  tools: string[];
  showThinkingProcess: boolean;
  showToolCallProcess: boolean;
};

export type ChatInputSubmitPayload = ChatInputSubmitResources & {
  text: string;
  optionValues: ChatInputOptionValues;
};

export type ChatInputProps = {
  resources: ChatInputResources;
  defaultValue?: string;
  defaultOptionValues?: Partial<ChatInputOptionValues>;
  placeholder?: string;
  disabled?: boolean;
  isRunning?: boolean;
  onStop?: () => void | Promise<void>;
  onSubmit: (payload: ChatInputSubmitPayload) => void;
};
