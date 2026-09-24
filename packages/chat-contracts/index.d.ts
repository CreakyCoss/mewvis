import type {
  AgentPermissions,
  AgentPermissionOption,
} from "./agent-permissions.js";
import type { RuntimeModelThinking } from "./model-thinking.js";

/** Risk levels ordered from least to most severe. */
export declare const RISK_LEVELS: readonly ["low", "medium", "high"];
export type RiskLevel = (typeof RISK_LEVELS)[number];
export declare function isRiskLevel(value: unknown): value is RiskLevel;

export type {
  AgentAccess,
  AgentAccessBase,
  AgentAccessPath,
  AgentAccessPaths,
} from "./agent-access.js";
export type { RuntimeModelThinking } from "./model-thinking.js";
export type {
  AgentPermissions,
  AgentPermissionOption,
} from "./agent-permissions.js";

export type ChatQuestionInput = {
  type: "text" | "select";
  label?: string;
  options?: { value: string; label: string; description?: string }[];
  selected?: string;
};

export type ChatToolEvent = {
  id: string;
  kind: "input" | "update" | "output";
  content: string;
  isError?: boolean;
};

export type ChatAssistantMessageBlock =
  | {
      id: string;
      type: "thinking";
      content: string;
    }
  | {
      id: string;
      type: "text";
      content: string;
    }
  | {
      id: string;
      type: "tool";
      toolCallId: string;
      name: string;
      events: ChatToolEvent[];
      status: "running" | "done" | "error";
    };

export type ChatUserMessageBlock =
  | {
      id: string;
      type: "text";
      content: string;
    }
  | {
      id: string;
      type: "file-reference";
      path: string;
    }
  | {
      id: string;
      type: "command-reference";
      commandId: string;
      name: string;
    }
  | {
      id: string;
      type: "skill-reference";
      skillKey: string;
      name: string;
    };

type ChatMessageBase = {
  id: string;
  createdAt: number;
  status?: "loading" | "streaming" | "done" | "error";
};

export type ChatUserMessage = ChatMessageBase & {
  role: "user";
  blocks: ChatUserMessageBlock[];
};

export type ChatAssistantMessage = ChatMessageBase & {
  role: "assistant";
  blocks: ChatAssistantMessageBlock[];
  /** Built-in avatar ID or a plugin-owned image URL/data URI. */
  agentAvatar?: string;
  /** Message whose execution produced this subtask output. */
  parentMessageId?: string;
  agentName?: string;
};

export type ChatMessage = ChatUserMessage | ChatAssistantMessage;

export type ChatPendingQuestion = {
  taskId: string;
  questionId: string;
  question: string;
  expiresAt: number;
  context?: string | null;
  input?: ChatQuestionInput;
};

export type SessionIdentity = { scope: string; id: string };

export type ChatPermissionMode = AgentPermissions["mode"];
export type ChatPendingApproval = {
  taskId: string;
  approvalId: string;
  executionId: string;
  summary: string;
  details: string;
  reason: string;
  expiresAt: number;
};
export type ChatRunConfig = {
  selectedModelId: string;
  thinkingLevel?: string | null;
  selectedAgentId: string;
  selectedSkillKeys: string[];
  selectedKnowledgeCollectionIds: string[];
  permissionMode: ChatPermissionMode | null;
};
export type ResourceOption = {
  value: string;
  label: string;
  description: string;
  isDefault: boolean;
};
export type SkillOption = {
  key: string;
  name: string;
  label: string;
  description: string;
};
export type ChatResources = {
  commands?: {
    id: string;
    label?: string;
    description: string;
    pluginName?: string;
  }[];
  permissionOptions?: AgentPermissionOption[];
  models?: (ResourceOption & {
    selectedLabel: string;
    thinking?: RuntimeModelThinking;
  })[];
  agents?: ResourceOption[];
  skillGroups?: (ResourceOption & { skills: SkillOption[] })[];
  tools?: ResourceOption[];
  knowledgeCollections?: (ResourceOption & {
    sourceDirectory?: string | null;
  })[];
  errors?: Partial<
    Record<
      | "models"
      | "agents"
      | "skillGroups"
      | "tools"
      | "knowledgeCollections"
      | "commands",
      string
    >
  >;
};
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
export type MessagePart = WithoutId<ChatUserMessageBlock>;
export type MessageInput = {
  text: string;
  blocks?: MessagePart[];
  requestId?: string;
};
export type ChatContext = {
  systemPrompt?: string;
  requestContext?: string;
  runtimeInstruction?: string;
};
export type ChatRecord = {
  title: string;
  messages: ChatMessage[];
  config?: Partial<ChatRunConfig>;
};
export type ChatPhase =
  | "initializing"
  | "idle"
  | "preparing"
  | "submitting"
  | "running"
  | "pausing"
  | "paused"
  | "waiting"
  | "stopping"
  | "closing"
  | "closed";
export type ChatExecution = {
  taskId: string;
  /** A failed cancellation can be retried while the task remains reserved. */
  cancelError?: string;
  state:
    | "running"
    | "pausing"
    | "paused"
    | "cancelling"
    | "completed"
    | "cancelled"
    | "failed";
};
export type ChatSnapshot = {
  /** Host execution state shared by all views; retained at completion for activity correlation. */
  execution?: ChatExecution;
  identity: SessionIdentity;
  phase: ChatPhase;
  initialized: boolean;
  title: string;
  messages: ChatMessage[];
  config: ChatRunConfig;
  resources: ChatResources;
  activeTaskId: string | null;
  pendingQuestion: ChatPendingQuestion | null;
  /** Host-owned approval; applications may observe but cannot approve it. */
  pendingApproval: ChatPendingApproval | null;
  answering: boolean;
  error: string;
  initializationError: string;
  saveError: string;
  dirty: boolean;
};
export type SendResult = {
  status: "dispatched" | "cancelled" | "rejected";
  taskId?: string;
  reason?: string;
};
export type OperationResult = { ok: true } | { ok: false; error: string };
export interface ChatSession {
  readonly identity: SessionIdentity;
  getSnapshot(): Readonly<ChatSnapshot>;
  subscribe(listener: () => void): () => void;
  send(input: MessageInput): Promise<SendResult>;
  stop(): Promise<OperationResult>;
  resume?(): Promise<OperationResult>;
  answer(input: {
    questionId: string;
    /** null cancels this question without stopping the task. */
    answer: string | null;
  }): Promise<OperationResult>;
  updateConfig(patch: Partial<ChatRunConfig>): Promise<OperationResult>;
  refreshResources(): Promise<void>;
  retryInitialization(): Promise<void>;
  flush(): Promise<OperationResult>;
  retrySave(): Promise<OperationResult>;
  close(): Promise<OperationResult>;
}
