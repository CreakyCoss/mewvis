import type { RuntimeModelInput } from "@/agent-client/wire";
import type { AiAgent } from "@/features/pages/settings/agent/types";
import type { Skill } from "@/features/pages/skills/types";

export type ChatInputResourceOption = {
  value: string;
  label: string;
  description: string;
  isDefault: boolean;
};

export type ChatInputSkillOption = Skill & {
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

export type ChatInputKnowledgeOption = ChatInputResourceOption & {
  sourceDirectory: string | null;
};

export type ChatInputResources = {
  models?: ChatInputModelOption[];
  agents?: ChatInputAgentOption[];
  skillGroups?: ChatInputSkillGroupOption[];
  knowledgeCollections?: ChatInputKnowledgeOption[];
  tools?: ChatInputResourceOption[];
};

export type ChatInputFile = {
  path: string;
  name: string;
  isDirectory: boolean;
};

export type ChatInputSubmitBlock =
  | {
      type: "text";
      content: string;
    }
  | {
      type: "file-reference";
      path: string;
    }
  | {
      type: "skill-reference";
      skillKey: string;
      name: string;
    };

export type ChatInputOptionValues = {
  selectedModelId: string;
  selectedAgentId: string;
  selectedSkillKeys: string[];
  selectedKnowledgeCollectionIds: string[];
  selectedToolNames: string[];
};

export type ChatDisplayOptions = {
  showThinkingProcess: boolean;
  showToolCallProcess: boolean;
};

export type ChatInputOptions = ChatInputOptionValues & ChatDisplayOptions;

export type ChatInputInitialOptions = Partial<ChatInputOptions>;

export type ChatInputSubmitResources = {
  model: RuntimeModelInput;
  agent: AiAgent | null;
  skills: Skill[];
  knowledgeCollections: ChatInputKnowledgeOption[];
  tools: string[];
};

export type ChatTurnRequest = ChatInputSubmitResources & {
  text: string;
  blocks: ChatInputSubmitBlock[];
};

export type ChatInputSubmission = {
  request: ChatTurnRequest;
  options: ChatInputOptions;
};

export type ChatInputProps = {
  resources: ChatInputResources;
  files?: ChatInputFile[];
  initialOptions?: ChatInputInitialOptions;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  isRunning?: boolean;
  onStop?: () => void | Promise<void>;
  onOptionsChange?: (options: ChatInputOptions) => void;
  onSubmit: (submission: ChatInputSubmission) => void;
};
