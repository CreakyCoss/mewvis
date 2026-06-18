import type { MutableRefObject } from "react";
import type {
  PromptContextFile,
} from "@/features/ai/runtime";
import type { AgentMemoryTrace } from "@/ai/agent-runtime/memory";
import type {
  RuntimeAgentToolName,
} from "@/ai/runtime-protocol";
import type { AgentRuntime } from "@/ai/agent-runtime/runtime";
import type { RuntimeModelOption } from "@/features/ai/components/llm-setting/store";
import type { Workspace } from "@/features/workspace/types";
import type {
  ChatContextSummary,
  ChatMessage,
  ChatTraceTurn,
  ConversationMessage,
} from "../../../types";
import type { RunningAgentTaskContext } from "../agent-task";
import type { WorkspacePromptSkillContext } from "../prompt-context";
import type { ChatTraceStepInput } from "../trace";

export type UpdateMessage = (
  messageId: string,
  updater: (message: ChatMessage) => ChatMessage,
) => void;

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

export type CommonModeDeps = {
  workspace: Workspace;
  activeFile: PromptContextFile | null;
  activeSkills: WorkspacePromptSkillContext[];
  runtimeAgentId: string;
  appendVisibleTraceStep: AppendVisibleTraceStep;
  updateMessage: UpdateMessage;
};

export type RunAgentTurnInput = {
  nextSessionId: string | null;
  traceTurnId: string;
  assistantMessageId: string;
  nextConversation: ConversationMessage[];
  nextConversationContext: ChatContextSummary | null;
  nextMessages: ChatMessage[];
  agentPromptPayload: {
    agentRoleId: string;
    systemPrompt: string;
    requestContext: string;
    runtimeInstruction: string;
    bootstrapInstruction?: string | null;
    userMessage: string;
  };
};

export type RunAgentTurnDeps = CommonModeDeps & {
  agentRuntime: AgentRuntime;
  setChatError: (message: string) => void;
  prepareActiveAgentRun: PrepareActiveAgentRun;
  patchVisibleTraceTurn: PatchVisibleTraceTurn;
  addRunningAgentTask: (task: RunningAgentTaskContext) => void;
  activateAgentTaskId: (taskId: string) => void;
  handledAgentDoneTaskIdsRef: MutableRefObject<Set<string>>;
  chatTraceRef: MutableRefObject<ChatTraceTurn[]>;
  effectiveRuntimeModel: RuntimeModelOption | null;
  allowedAgentTools: RuntimeAgentToolName[];
  currentSessionTitle: string;
};
