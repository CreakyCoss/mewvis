import type { MutableRefObject } from "react";
import type {
  AgentContextSession,
  ChatContextSummary,
  ConversationMessage,
  PreparedAgentRunContext,
  PromptKnowledgeReference,
  PromptContextFile,
  PromptContextLimits,
  PromptFileReference,
  PromptSkillContext,
} from "@/ai/agent-context";
import type { AgentMemoryTrace } from "@/ai/agent-runtime/memory";
import type {
  RuntimeAgentToolName,
} from "@/ai/runtime-protocol";
import type { AgentRuntime } from "@/ai/agent-runtime/runtime";
import type { CollaborationWorkflowProfile } from "@/features/ai/agent/types";
import type { RuntimeModelOption } from "@/features/ai/llm/store";
import type { Workspace } from "@/features/workspace/types";
import type {
  ChatExecutionMode,
  ChatMode,
  CollaborationPhase,
  CollaborationPlanDecisionRequest,
  ContextDebugPayload,
  ContextDebugSnapshot,
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
  activeFile: PromptContextFile | null;
  activeSkills: PromptSkillContext[];
  runtimeAgentId: string;
  appendVisibleTraceStep: AppendVisibleTraceStep;
  updateMessage: UpdateMessage;
};

export type RunCollaborationTurnInput = {
  collaborationWorkflow: CollaborationWorkflowProfile;
  traceTurnId: string;
  assistantMessageId: string;
  text: string;
  referencedFiles: PromptFileReference[];
  nextConversation: ConversationMessage[];
  runtimeMessages: ConversationMessage[];
  summaryLimits: PromptContextLimits;
  conversationSummary: string;
  currentAgentExecutionSummary: string;
  knowledgeMatches: PromptKnowledgeReference[];
  knowledgeDebugPayload: ContextDebugPayload;
  limitsFor: LimitsForProvider;
  publishContextDebugSnapshot: PublishContextDebugSnapshot;
  finalizeAssistantTurn: FinalizeAssistantTurn;
};

export type RunCollaborationTurnDeps = CommonModeDeps & {
  agentRuntime: AgentRuntime;
  contextSession: AgentContextSession;
  allowedAgentTools: RuntimeAgentToolName[];
  appendMessage: AppendMessage;
  requestCollaborationPlanDecision: RequestCollaborationPlanDecision;
  setChatError: (message: string) => void;
  setCollaborationPhase: (phase: CollaborationPhase) => void;
};

export type RunAgentTurnInput = {
  nextSessionId: string | null;
  traceTurnId: string;
  assistantMessageId: string;
  nextConversation: ConversationMessage[];
  nextConversationContext: ChatContextSummary | null;
  nextMessages: ChatMessage[];
  conversationSummary: string;
  knowledgeDebugPayload: ContextDebugPayload;
  agentPromptPayload: PreparedAgentRunContext;
  publishContextDebugSnapshot: PublishContextDebugSnapshot;
};

export type RunAgentTurnDeps = CommonModeDeps & {
  agentRuntime: AgentRuntime;
  setChatError: (message: string) => void;
  prepareActiveAgentRun: PrepareActiveAgentRun;
  patchVisibleTraceTurn: PatchVisibleTraceTurn;
  addRunningAgentTask: (task: RunningAgentTaskContext) => void;
  activateAgentTaskId: (taskId: string) => void;
  agentSessionResetPromiseRef: MutableRefObject<Promise<boolean> | null>;
  handledAgentDoneTaskIdsRef: MutableRefObject<Set<string>>;
  chatTraceRef: MutableRefObject<ChatTraceTurn[]>;
  effectiveRuntimeModel: RuntimeModelOption | null;
  chatMode: ChatMode;
  chatExecutionMode: ChatExecutionMode;
  allowedAgentTools: RuntimeAgentToolName[];
  currentSessionTitle: string;
};
