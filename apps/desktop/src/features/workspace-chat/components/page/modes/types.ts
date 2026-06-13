import type { MutableRefObject } from "react";
import type {
  AgentMemoryTrace,
  AgentSessionStatus,
  ChatContextSummary,
  ContextEngine,
  ContextRagMatch,
  ConversationMessage,
  PromptContextLimits,
  PromptSkillContext,
  PromptWorkspaceFile,
} from "@/ai/agent-context";
import type {
  AgentToolName,
} from "@/ai/agent-runtime/contracts";
import type { AgentRuntime } from "@/ai/agent-runtime/runtime";
import type { AgentProfile, CollaborationWorkflowProfile } from "@/features/agent-settings/types";
import type { RuntimeModelOption } from "@/features/llm-settings/store";
import type { Workspace } from "@/features/workspaces/types";
import type {
  ChatExecutionMode,
  ChatMode,
  CollaborationPhase,
  CollaborationPlanDecisionRequest,
  ContextDebugPayload,
  ContextDebugSnapshot,
  ResolvedFileReference,
} from "../../../page-types";
import type {
  ChatMessage,
  ChatTraceTurn,
} from "../../../types";
import type { RunningAgentTaskContext } from "../agent-task";
import type { ChatTraceStepInput } from "../trace";

export type LimitsForProvider = (
  runtimeModel?: RuntimeModelOption | null,
) => PromptContextLimits;

export type PublishContextDebugSnapshot = (
  payloads: ContextDebugPayload[],
  overrides?: Partial<ContextDebugSnapshot>,
) => void;

export type FinalizeAssistantTurn = (input: {
  mode: "chat" | "collab";
  assistantText: string;
  assistantMessages?: ConversationMessage[];
}) => Promise<void>;

export type UpdateMessage = (
  messageId: string,
  updater: (message: ChatMessage) => ChatMessage,
) => void;

export type AppendMessage = (message: ChatMessage) => void;

export type AppendVisibleTraceStep = (
  traceTurnId: string,
  step: ChatTraceStepInput,
) => void;

export type PatchVisibleTraceTurn = (
  traceTurnId: string,
  patch: Partial<Omit<ChatTraceTurn, "id" | "steps">>,
) => void;

export type PrepareActiveAgentRun = (input: {
  messageId: string;
  agentSessionId: string;
  agentId: string;
  trace: AgentMemoryTrace;
}) => void;

export type RequestCollaborationPlanDecision = (
  request: Omit<CollaborationPlanDecisionRequest, "id">,
) => Promise<boolean>;

export type CommonModeDeps = {
  workspace: Workspace;
  activeFile: PromptWorkspaceFile | null;
  enabledSkills: PromptSkillContext[];
  runtimeAgentId: string;
  appendVisibleTraceStep: AppendVisibleTraceStep;
  updateMessage: UpdateMessage;
};

export type RunChatTurnInput = {
  traceTurnId: string;
  assistantMessageId: string;
  text: string;
  referencedFiles: ResolvedFileReference[];
  runtimeMessages: ConversationMessage[];
  conversationSummary: string;
  currentAgentExecutionSummary: string;
  knowledgeMatches: ContextRagMatch[];
  knowledgeDebugPayload: ContextDebugPayload;
  limitsFor: LimitsForProvider;
  publishContextDebugSnapshot: PublishContextDebugSnapshot;
  finalizeAssistantTurn: FinalizeAssistantTurn;
};

export type RunChatTurnDeps = CommonModeDeps & {
  modelSource: "direct" | "agent";
  selectedAgent: AgentProfile | null;
  effectiveRuntimeModel: RuntimeModelOption | null;
};

export type RunCollaborationTurnInput = {
  collaborationWorkflow: CollaborationWorkflowProfile;
  traceTurnId: string;
  assistantMessageId: string;
  text: string;
  referencedFiles: ResolvedFileReference[];
  nextConversation: ConversationMessage[];
  nextConversationContext: ChatContextSummary | null;
  runtimeMessages: ConversationMessage[];
  summaryLimits: PromptContextLimits;
  conversationSummary: string;
  currentAgentExecutionSummary: string;
  knowledgeMatches: ContextRagMatch[];
  knowledgeDebugPayload: ContextDebugPayload;
  limitsFor: LimitsForProvider;
  publishContextDebugSnapshot: PublishContextDebugSnapshot;
  finalizeAssistantTurn: FinalizeAssistantTurn;
};

export type RunCollaborationTurnDeps = CommonModeDeps & {
  agentRuntime: AgentRuntime;
  contextEngine: ContextEngine;
  allowedAgentTools: AgentToolName[];
  appendMessage: AppendMessage;
  requestCollaborationPlanDecision: RequestCollaborationPlanDecision;
  setChatError: (message: string) => void;
  setCollaborationPhase: (phase: CollaborationPhase) => void;
};

export type RunAgentTurnInput = {
  nextSessionId: string | null;
  traceTurnId: string;
  assistantMessageId: string;
  text: string;
  referencedFiles: ResolvedFileReference[];
  baseConversation: ConversationMessage[];
  baseConversationContext: ChatContextSummary | null;
  nextConversation: ConversationMessage[];
  nextConversationContext: ChatContextSummary | null;
  nextMessages: ChatMessage[];
  conversationSummary: string;
  knowledgeMatches: ContextRagMatch[];
  knowledgeDebugPayload: ContextDebugPayload;
  limitsFor: LimitsForProvider;
  publishContextDebugSnapshot: PublishContextDebugSnapshot;
};

export type RunAgentTurnDeps = CommonModeDeps & {
  agentRuntime: AgentRuntime;
  contextEngine: ContextEngine;
  setChatError: (message: string) => void;
  setAgentSessionStatus: (status: AgentSessionStatus | null) => void;
  setAgentSessionError: (message: string) => void;
  prepareActiveAgentRun: PrepareActiveAgentRun;
  patchVisibleTraceTurn: PatchVisibleTraceTurn;
  addRunningAgentTask: (task: RunningAgentTaskContext) => void;
  activateAgentTaskId: (taskId: string) => void;
  agentContextInvalidatedRef: MutableRefObject<boolean>;
  agentSessionResetPromiseRef: MutableRefObject<Promise<boolean> | null>;
  handledAgentDoneTaskIdsRef: MutableRefObject<Set<string>>;
  chatTraceRef: MutableRefObject<ChatTraceTurn[]>;
  agentSessionStatus: AgentSessionStatus | null;
  effectiveRuntimeModel: RuntimeModelOption | null;
  modelSource: "direct" | "agent";
  selectedAgent: AgentProfile | null;
  chatMode: ChatMode;
  chatExecutionMode: ChatExecutionMode;
  allowedAgentTools: AgentToolName[];
  currentSessionTitle: string;
};

export type PrepareChatTurnRuntimeInput = {
  now: number;
  userMessageId: string;
  assistantMessageId: string;
  traceTurnId: string;
  text: string;
  referencedFiles: ResolvedFileReference[];
  nextConversation: ConversationMessage[];
  baseConversationContext: ChatContextSummary | null;
  traceProviderName: string | null;
  traceModelName: string | null;
  summaryRuntimeModel: RuntimeModelOption | null;
};

export type PreparedChatTurnRuntime = {
  summaryLimits: PromptContextLimits;
  nextConversationContext: ChatContextSummary | null;
  runtimeMessages: ConversationMessage[];
  conversationSummary: string;
  knowledgeMatches: ContextRagMatch[];
  knowledgeDebugPayload: ContextDebugPayload;
  limitsFor: LimitsForProvider;
  publishContextDebugSnapshot: PublishContextDebugSnapshot;
  finalizeAssistantTurn: FinalizeAssistantTurn;
};
