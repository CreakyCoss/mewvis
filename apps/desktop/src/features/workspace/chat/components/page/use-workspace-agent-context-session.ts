import { useCallback, useMemo, useRef } from "react";
import {
  agentContext,
  type AgentContextConversationContextController,
  type AgentContextConversationSelector,
  type AgentContextSessionAdapterInput,
  type AgentContextSessionManager,
  type AgentContextSessionStateReader,
  type AgentContextSessionStateWriter,
  type AgentContextSessionTurnRunner,
  type ChatContextSummary,
} from "@/ai/agent-context";

type ContextSessionStateInput = {
  chatId: string | null;
  engineId: string;
  context: ChatContextSummary | null;
};

export type WorkspaceAgentContextTurnSession =
  AgentContextSessionStateWriter &
  AgentContextSessionTurnRunner;

export type WorkspaceAgentContextChatTurnFinalizer =
  AgentContextSessionStateWriter &
  Pick<AgentContextConversationContextController, "finalizeChatTurn">;

export type WorkspaceAgentContextCompressor =
  AgentContextSessionStateReader &
  AgentContextSessionStateWriter &
  Pick<AgentContextConversationContextController, "compressConversation">;

export type WorkspaceAgentContextHistorySession =
  AgentContextSessionStateWriter &
  Pick<
    AgentContextConversationContextController,
    "invalidateAfterHistoryChange" | "rebuildAfterHistoryChange"
  >;

export type WorkspaceAgentContextAgentRunFinalizer =
  AgentContextSessionStateReader &
  AgentContextSessionStateWriter &
  Pick<AgentContextConversationContextController, "finalizeAgentRun">;

export type WorkspaceAgentContextSessionBridge = {
  turnSession: WorkspaceAgentContextTurnSession;
  chatTurnFinalizer: WorkspaceAgentContextChatTurnFinalizer;
  compressor: WorkspaceAgentContextCompressor;
  historySession: WorkspaceAgentContextHistorySession;
  agentRunFinalizer: WorkspaceAgentContextAgentRunFinalizer;
  syncState(input: ContextSessionStateInput): void;
  getContext(): ChatContextSummary | null;
  getActiveAgentRuntimeSessionId(agentId?: string | null): string | null;
  selectRecentConversation: AgentContextConversationSelector["selectRecentConversation"];
};

export const useWorkspaceAgentContextSession = ({
  engineId,
  loadFile,
}: {
  engineId: string;
  loadFile: NonNullable<AgentContextSessionAdapterInput["loadFile"]>;
}): WorkspaceAgentContextSessionBridge => {
  const sessionRef = useRef<AgentContextSessionManager | null>(null);

  if (!sessionRef.current) {
    sessionRef.current = agentContext.createSessionManager({
      engineId,
      loadFile,
    });
  }

  const requireSession = useCallback(() => {
    if (!sessionRef.current) {
      throw new Error("上下文会话尚未初始化");
    }
    return sessionRef.current;
  }, []);

  const syncState = useCallback((input: ContextSessionStateInput) => {
    requireSession().set(input);
  }, [requireSession]);

  const getContext = useCallback(
    () => sessionRef.current?.get() ?? null,
    [],
  );

  const getActiveAgentRuntimeSessionId = useCallback((
    agentId?: string | null,
  ) => sessionRef.current?.getActiveAgentRuntimeSessionId(agentId) ?? null, []);

  const selectRecentConversation = useCallback<
    AgentContextConversationSelector["selectRecentConversation"]
  >((input) => {
    return requireSession().selectRecentConversation(input);
  }, [requireSession]);

  const turnSession = useMemo<WorkspaceAgentContextTurnSession>(() => ({
    set: (input) => requireSession().set(input),
    setConversation: (conversation) =>
      requireSession().setConversation(conversation),
    getContextLimits: (input) => requireSession().getContextLimits(input),
    prompt: async (input) => {
      return requireSession().prompt(input);
    },
    prepareAgentTurn: async (input) => {
      return requireSession().prepareAgentTurn(input);
    },
  }), [requireSession]);

  const chatTurnFinalizer = useMemo<WorkspaceAgentContextChatTurnFinalizer>(() => ({
    set: (input) => requireSession().set(input),
    setConversation: (conversation) =>
      requireSession().setConversation(conversation),
    finalizeChatTurn: async (input) => {
      return requireSession().finalizeChatTurn(input);
    },
  }), [requireSession]);

  const compressor = useMemo<WorkspaceAgentContextCompressor>(() => ({
    get: () => requireSession().get(),
    snapshot: () => requireSession().snapshot(),
    getConversation: () => requireSession().getConversation(),
    getTrace: () => requireSession().getTrace(),
    getLastPrompt: () => requireSession().getLastPrompt(),
    getDebugSnapshot: () => requireSession().getDebugSnapshot(),
    getSummary: () => requireSession().getSummary(),
    getActiveAgentRuntimeSessionId: (agentId) =>
      requireSession().getActiveAgentRuntimeSessionId(agentId),
    set: (input) => requireSession().set(input),
    setConversation: (conversation) =>
      requireSession().setConversation(conversation),
    compressConversation: async (input) => {
      return requireSession().compressConversation(input);
    },
  }), [requireSession]);

  const historySession = useMemo<WorkspaceAgentContextHistorySession>(() => ({
    set: (input) => requireSession().set(input),
    setConversation: (conversation) =>
      requireSession().setConversation(conversation),
    rebuildAfterHistoryChange: async (input) => {
      return requireSession().rebuildAfterHistoryChange(input);
    },
    invalidateAfterHistoryChange: (input) => {
      return requireSession().invalidateAfterHistoryChange(input);
    },
  }), [requireSession]);

  const agentRunFinalizer = useMemo<WorkspaceAgentContextAgentRunFinalizer>(() => ({
    get: () => requireSession().get(),
    snapshot: () => requireSession().snapshot(),
    getConversation: () => requireSession().getConversation(),
    getTrace: () => requireSession().getTrace(),
    getLastPrompt: () => requireSession().getLastPrompt(),
    getDebugSnapshot: () => requireSession().getDebugSnapshot(),
    getSummary: () => requireSession().getSummary(),
    getActiveAgentRuntimeSessionId: (agentId) =>
      requireSession().getActiveAgentRuntimeSessionId(agentId),
    set: (input) => requireSession().set(input),
    setConversation: (conversation) =>
      requireSession().setConversation(conversation),
    finalizeAgentRun: async (input) => {
      return requireSession().finalizeAgentRun(input);
    },
  }), [requireSession]);

  return useMemo(() => ({
    turnSession,
    chatTurnFinalizer,
    compressor,
    historySession,
    agentRunFinalizer,
    syncState,
    getContext,
    getActiveAgentRuntimeSessionId,
    selectRecentConversation,
  }), [
    agentRunFinalizer,
    chatTurnFinalizer,
    compressor,
    getActiveAgentRuntimeSessionId,
    getContext,
    historySession,
    selectRecentConversation,
    syncState,
    turnSession,
  ]);
};
