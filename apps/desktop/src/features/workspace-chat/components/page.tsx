import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_ALLOWED_AGENT_TOOLS,
  normalizeAllowedAgentTools,
  type AgentRuntimeAgentCapability,
  type AgentRuntimeAgentDefinition,
  type AgentRuntimeModelConfig,
  type AgentToolName,
} from "@/agent-runtime/contracts";
import {
  toAgentRuntimeModelConfig,
  toAgentRuntimeProviderConfig,
} from "@/agent-runtime/config";
import {
  buildAgentConversationContent,
  buildAgentExecutionSummary,
  createAgentMemoryTrace,
  extractAgentExecutionSummary,
  recordAgentMemoryEvent,
  type AgentMemoryTrace,
} from "@/agent-context/agent-memory";
import {
  buildUnsyncedAgentConversationContext,
  createAgentRuntimeSessionId,
  createAgentSessionGenerationId,
  createAgentSessionFingerprint,
  EMPTY_RUNTIME_CONVERSATION_CONTEXT,
  getAgentConversationSync,
  buildRuntimeConversationContext,
  buildRuntimeConversationMessages,
  invalidateConversationContextForHistoryChange,
  markAgentConversationSynced,
  normalizeChatContextSummary,
  normalizeConversationMessages,
  updateConversationContext,
  type ConversationSummarizer,
} from "@/agent-context/conversation";
import {
  buildAgentBootstrapPrompt,
  buildAgentPrompt,
  buildCollaborationSystemPrompt,
  buildSystemPrompt,
  createPromptContextLimits,
  createConversationSummarizer,
} from "@/agent-context/prompts";
import { createAgentRuntime } from "@/agent-runtime/runtime";
import { getAiAgentSettings } from "@/features/agent-settings/api";
import { AgentSettingsDialog } from "@/features/agent-settings/components/dialog";
import type { AiAgent } from "@/features/agent-settings/types";
import { resolveAgentProfiles } from "@/features/agent-settings/utils";
import { getLlmSettings } from "@/features/llm-settings/api";
import { SettingsDialog } from "@/features/llm-settings/components/dialog";
import type { LlmProvider, ProviderModel } from "@/features/llm-settings/types";
import { findDefaultProvider } from "@/features/llm-settings/utils";
import { getWorkspaceSkills, saveWorkspaceSkills } from "@/features/workspace-skills/api";
import { SkillsDialog } from "@/features/workspace-skills/components/skills-dialog";
import type { WorkspaceSkill } from "@/features/workspace-skills/types";
import { getWorkspaceOverview } from "@/features/workspaces/api";
import type { Workspace, WorkspaceSection } from "@/features/workspaces/types";
import { buildSections } from "@/features/workspaces/utils/sections";
import {
  cleanupOrphanAgentSessions,
  deleteChatSession,
  getAgentSessionStatus,
  listChatSessions,
  listWorkspaceFiles,
  loadChatSession,
  readWorkspaceFile,
  resetAgentSessionsForChat,
  runAgentRuntimeChat,
  saveChatSession,
  writeWorkspaceFile,
} from "../api";
import type {
  ChatMode,
  CollaborationPhase,
  ComposerSubmitInput,
  ContextWindowPreset,
  ModelSource,
  PendingAgentQuestion,
  ResolvedFileReference,
  WorkspaceView,
} from "../page-types";
import type {
  AgentSessionStatus,
  ChatContextSummary,
  ChatMessage,
  ChatSessionMeta,
  ConversationMessage,
  WorkspaceFile,
  WorkspaceFileEntry,
} from "../types";
import {
  AGENT_BLOCK_AUTO_COLLAPSE_DELAY_MS,
  appendAgentToolEventBlock,
  finalizeLastAgentThinkingBlock,
  isTimelineEvent,
  mergeAgentThinking,
  removeEmptyAgentThinkingBlocks,
  updateLastAgentTextBlock,
  updateLastAgentThinkingBlock,
} from "../utils/agent-blocks";
import { buildFileTree, getParentDirectoryPaths } from "../utils/file-tree";
import {
  createChatSessionId,
  createMessageId,
  DEFAULT_SESSION_TITLE,
  deriveSessionTitle,
  isMarkdownPath,
} from "../utils/sessions";
import { ChatPanel } from "./panels/chat";
import { ContextPanel } from "./panels/context";
import { FilePanel } from "./panels/file";
import { SettingsPanel } from "./panels/settings";
import { Sidebar } from "./sidebar";
import { WorkbenchHeader } from "./workbench-header";

type WorkspaceChatPageProps = {
  workspace: Workspace;
  onOpenWorkspace: (workspace: Workspace) => void;
  onCreateWorkspace: () => void;
  onEditWorkspace: (workspace: Workspace) => void;
};

const moveHistoryItem = <T extends { id: string }>(
  items: T[],
  itemId: string,
  direction: "up" | "down",
) => {
  const index = items.findIndex((item) => item.id === itemId);
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) {
    return items;
  }

  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
};

const removeHistoryMessageSegment = <T extends { id: string; role: "user" | "assistant" }>(
  items: T[],
  messageId: string,
) => {
  const index = items.findIndex((item) => item.id === messageId);
  if (index < 0) {
    return items;
  }

  const segmentStart = items[index].role === "assistant" && items[index - 1]?.role === "user"
    ? index - 1
    : index;
  return items.slice(0, segmentStart);
};

const keepHistoryThroughMessage = <T extends { id: string }>(
  items: T[],
  messageId: string,
) => {
  const index = items.findIndex((item) => item.id === messageId);
  if (index < 0) {
    return items;
  }

  return items.slice(0, index + 1);
};

const normalizeHistoryText = (text: string) => text.replace(/\s+/g, " ").trim();

const findConversationMatchIndex = (
  conversation: ConversationMessage[],
  usedIndexes: Set<number>,
  chatMessage: ChatMessage,
  originalMessage: ChatMessage,
) => {
  const directIndex = conversation.findIndex((message, index) =>
    !usedIndexes.has(index) && message.id === originalMessage.id,
  );
  if (directIndex >= 0) {
    return directIndex;
  }

  const originalText = normalizeHistoryText(originalMessage.text);
  const textIndex = conversation.findIndex((message, index) =>
    !usedIndexes.has(index) &&
    message.role === chatMessage.role &&
    normalizeHistoryText(message.content) === originalText,
  );
  if (textIndex >= 0) {
    return textIndex;
  }

  return conversation.findIndex((message, index) =>
    !usedIndexes.has(index) &&
    message.role === chatMessage.role &&
    Math.abs(message.timestamp - originalMessage.createdAt) < 60_000,
  );
};

const rebuildConversationFromVisibleMessages = (
  conversation: ConversationMessage[],
  currentMessages: ChatMessage[],
  nextMessages: ChatMessage[],
): ConversationMessage[] => {
  const usedIndexes = new Set<number>();

  return nextMessages.map((chatMessage) => {
    const originalMessage = currentMessages.find((message) => message.id === chatMessage.id) ?? chatMessage;
    const matchIndex = findConversationMatchIndex(
      conversation,
      usedIndexes,
      chatMessage,
      originalMessage,
    );
    const matchedMessage = matchIndex >= 0 ? conversation[matchIndex] : null;
    if (matchIndex >= 0) {
      usedIndexes.add(matchIndex);
    }

    return {
      id: chatMessage.id,
      role: chatMessage.role,
      content: chatMessage.text,
      timestamp: matchedMessage?.timestamp ?? chatMessage.createdAt,
      metadata: matchedMessage?.metadata ?? null,
    };
  });
};

const stripHiddenAgentContextMetadata = (
  conversation: ConversationMessage[],
): ConversationMessage[] => conversation.map((message) =>
  message.metadata?.agentExecutionSummary || message.metadata?.agentSessionId
    ? {
      ...message,
      metadata: null,
    }
    : message,
);

const findLatestAgentExecutionSummary = (conversation: ConversationMessage[]) => {
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const message = conversation[index];
    if (message.role !== "assistant") {
      continue;
    }
    const summary = extractAgentExecutionSummary(message);
    if (summary) {
      return summary;
    }
  }

  return "";
};

export const WorkspaceChatPage = ({
  workspace,
  onOpenWorkspace,
  onCreateWorkspace,
  onEditWorkspace,
}: WorkspaceChatPageProps) => {
  const agentRuntime = useMemo(() => createAgentRuntime(), []);
  const activeAgentTaskIdRef = useRef("");
  const activeAgentMessageIdRef = useRef("");
  const activeAgentSessionIdRef = useRef("");
  const activeAgentIdRef = useRef("");
  const lastAgentErrorRef = useRef("");
  const lastAgentStderrRef = useRef("");
  const handledAgentDoneTaskIdsRef = useRef<Set<string>>(new Set());
  const activeAgentTraceRef = useRef<AgentMemoryTrace>(createAgentMemoryTrace());
  const agentContextInvalidatedRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const conversationRef = useRef<ConversationMessage[]>([]);
  const conversationContextRef = useRef<ChatContextSummary | null>(null);
  const conversationSummarizerRef = useRef<ConversationSummarizer | null>(null);
  const agentSessionResetPromiseRef = useRef<Promise<boolean> | null>(null);
  const isHydratingSessionRef = useRef(false);
  const saveSessionTimerRef = useRef<number | null>(null);
  const agentBlockCollapseTimersRef = useRef<Map<string, number>>(new Map());
  const chatScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [runtimeAgents, setRuntimeAgents] = useState<AgentRuntimeAgentDefinition[]>([]);
  const [defaultRuntimeAgentId, setDefaultRuntimeAgentId] = useState("");
  const [selectedRuntimeAgentId, setSelectedRuntimeAgentId] = useState("");
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [modelSource, setModelSource] = useState<ModelSource>("agent");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedReviewerAgentId, setSelectedReviewerAgentId] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  const [skills, setSkills] = useState<WorkspaceSkill[]>([]);
  const [enabledSkillNames, setEnabledSkillNames] = useState<string[]>([]);
  const [isSkillsDialogOpen, setIsSkillsDialogOpen] = useState(false);
  const [skillsError, setSkillsError] = useState("");
  const [isSkillsLoading, setIsSkillsLoading] = useState(false);
  const [isSkillsSaving, setIsSkillsSaving] = useState(false);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<WorkspaceFile | null>(null);
  const [filePath, setFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [fileError, setFileError] = useState("");
  const [fileViewMode, setFileViewMode] = useState<"source" | "preview">("source");
  const [isFilesLoading, setIsFilesLoading] = useState(false);
  const [expandedFileTreePaths, setExpandedFileTreePaths] = useState<Set<string>>(() => new Set());
  const [isFileSaving, setIsFileSaving] = useState(false);
  const [composerResetKey, setComposerResetKey] = useState(0);
  const [chatError, setChatError] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("agent");
  const [contextWindowPreset, setContextWindowPreset] = useState<ContextWindowPreset>(200000);
  const [allowedAgentTools, setAllowedAgentTools] = useState<AgentToolName[]>(() => [
    ...DEFAULT_ALLOWED_AGENT_TOOLS,
  ]);
  const [collaborationPhase, setCollaborationPhase] = useState<CollaborationPhase>("idle");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("chat");
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(true);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [isLlmSettingsOpen, setIsLlmSettingsOpen] = useState(false);
  const [isAgentSettingsOpen, setIsAgentSettingsOpen] = useState(false);
  const [projectSections, setProjectSections] = useState<WorkspaceSection[]>([]);
  const [projectsError, setProjectsError] = useState("");
  const [isProjectsLoading, setIsProjectsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeAgentTaskId, setActiveAgentTaskId] = useState("");
  const [pendingAgentQuestion, setPendingAgentQuestion] = useState<PendingAgentQuestion | null>(null);
  const [agentQuestionAnswer, setAgentQuestionAnswer] = useState("");
  const [customAgentQuestionAnswer, setCustomAgentQuestionAnswer] = useState("");
  const [isAnsweringAgentQuestion, setIsAnsweringAgentQuestion] = useState(false);
  const [expandedThinkingIds, setExpandedThinkingIds] = useState<Set<string>>(() => new Set());
  const [expandedAgentEventIds, setExpandedAgentEventIds] = useState<Set<string>>(() => new Set());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [conversationContext, setConversationContext] = useState<ChatContextSummary | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSessionMeta[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentSessionTitle, setCurrentSessionTitle] = useState(DEFAULT_SESSION_TITLE);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [, setIsSessionSaving] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [agentRuntimeSessionId, setAgentRuntimeSessionId] = useState<string | null>(null);
  const [agentSessionStatus, setAgentSessionStatus] = useState<AgentSessionStatus | null>(null);
  const [agentSessionError, setAgentSessionError] = useState("");
  const [isAgentSessionLoading, setIsAgentSessionLoading] = useState(false);
  const [isContextCompressing, setIsContextCompressing] = useState(false);

  const updateMessage = useCallback((
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => {
    setMessages((current) => {
      const next = current.map((message) => message.id === messageId ? updater(message) : message);
      messagesRef.current = next;
      return next;
    });
  }, []);

  const loadProjects = useCallback(async () => {
    setIsProjectsLoading(true);
    setProjectsError("");

    try {
      const overview = await getWorkspaceOverview();
      setProjectSections(buildSections(overview));
    } catch (caught) {
      setProjectsError(String(caught));
    } finally {
      setIsProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects, workspace.id, workspace.updatedAt]);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    window.requestAnimationFrame(() => {
      const viewport = chatScrollAreaRef.current?.querySelector<HTMLElement>(
        "[data-slot='scroll-area-viewport']",
      );
      viewport?.scrollTo({
        top: viewport.scrollHeight,
        behavior,
      });
    });
  }, []);

  const scrollActiveThinkingToBottom = useCallback(() => {
    window.requestAnimationFrame(() => {
      const thinkingBlocks = chatScrollAreaRef.current?.querySelectorAll<HTMLElement>(
        "[data-agent-thinking-content='true']",
      );
      const latestThinkingBlock = thinkingBlocks?.item(thinkingBlocks.length - 1);
      if (latestThinkingBlock) {
        latestThinkingBlock.scrollTop = latestThinkingBlock.scrollHeight;
      }
    });
  }, []);

  const toggleAllowedAgentTool = useCallback((toolId: AgentToolName, enabled: boolean) => {
    setAllowedAgentTools((current) => {
      if (enabled) {
        return current.includes(toolId) ? current : normalizeAllowedAgentTools([...current, toolId]);
      }

      return current.filter((item) => item !== toolId);
    });
  }, []);

  const hydrateSession = useCallback((
    session: {
      id: string | null;
      title: string;
      messages: ChatMessage[];
      conversation: ConversationMessage[];
      context?: ChatContextSummary | null;
    } | null,
  ) => {
    if (saveSessionTimerRef.current) {
      window.clearTimeout(saveSessionTimerRef.current);
      saveSessionTimerRef.current = null;
    }
    isHydratingSessionRef.current = true;
    const normalizedConversation = normalizeConversationMessages(session?.conversation ?? []);
    const normalizedMessages = session?.messages ?? [];
    const visibleConversation = normalizedMessages.length > 0
      ? rebuildConversationFromVisibleMessages(
        normalizedConversation,
        normalizedMessages,
        normalizedMessages,
      )
      : normalizedConversation;
    const normalizedContext = normalizeChatContextSummary(
      session?.context ?? null,
      visibleConversation,
    );
    messagesRef.current = normalizedMessages;
    conversationRef.current = visibleConversation;
    conversationContextRef.current = normalizedContext;
    agentContextInvalidatedRef.current = false;
    setMessages(normalizedMessages);
    setConversation(visibleConversation);
    setConversationContext(normalizedContext);
    setCurrentSessionId(session?.id ?? null);
    setCurrentSessionTitle(session?.title || DEFAULT_SESSION_TITLE);
    setAgentRuntimeSessionId(null);
    setAgentSessionStatus(null);
    setAgentSessionError("");
    setExpandedThinkingIds(new Set());
    setExpandedAgentEventIds(new Set());
    window.setTimeout(() => {
      isHydratingSessionRef.current = false;
    }, 0);
  }, []);

  const loadSessions = useCallback(async () => {
    setIsSessionsLoading(true);
    setSessionsError("");

    try {
      const [sessions, latestSession] = await Promise.all([
        listChatSessions(workspace.path),
        loadChatSession(workspace.path),
      ]);
      setChatSessions(sessions);
      hydrateSession(latestSession
        ? {
          id: latestSession.id,
          title: latestSession.title,
          messages: latestSession.messages,
          conversation: latestSession.conversation,
          context: latestSession.context,
        }
        : null);
    } catch (caught) {
      setSessionsError(String(caught));
    } finally {
      setIsSessionsLoading(false);
    }
  }, [hydrateSession, workspace.path]);

  const refreshAgentSessionStatus = useCallback(async () => {
    setIsAgentSessionLoading(true);
    setAgentSessionError("");

    try {
      if (!agentRuntimeSessionId) {
        setAgentSessionStatus(null);
        return;
      }

      const status = await getAgentSessionStatus(workspace.path, agentRuntimeSessionId);
      setAgentSessionStatus(status);
    } catch (caught) {
      setAgentSessionError(String(caught));
    } finally {
      setIsAgentSessionLoading(false);
    }
  }, [agentRuntimeSessionId, workspace.path]);

  const cleanupAgentSessions = useCallback(async () => {
    setIsAgentSessionLoading(true);
    setAgentSessionError("");

    try {
      const result = await cleanupOrphanAgentSessions(workspace.path, agentRuntimeSessionId);
      await refreshAgentSessionStatus();
      setAgentSessionError(
        result.removedCount > 0
          ? `已清理 ${result.removedCount} 个孤儿上下文`
          : "没有需要清理的孤儿上下文",
      );
    } catch (caught) {
      setAgentSessionError(String(caught));
    } finally {
      setIsAgentSessionLoading(false);
    }
  }, [agentRuntimeSessionId, refreshAgentSessionStatus, workspace.path]);

  const loadSessionById = async (sessionId: string) => {
    if (activeAgentTaskIdRef.current) {
      setSessionsError("Agent 正在处理，结束后再切换聊天记录");
      return;
    }

    setIsSessionsLoading(true);
    setSessionsError("");

    try {
      const session = await loadChatSession(workspace.path, sessionId);
      if (!session) {
        setSessionsError("未找到这条聊天记录");
        return;
      }
      hydrateSession({
        id: session.id,
        title: session.title,
        messages: session.messages,
        conversation: session.conversation,
        context: session.context,
      });
    } catch (caught) {
      setSessionsError(String(caught));
    } finally {
      setIsSessionsLoading(false);
    }
  };

  const startNewSession = () => {
    if (activeAgentTaskIdRef.current) {
      setSessionsError("Agent 正在处理，结束后再新建聊天");
      return;
    }

    setSessionsError("");
    setComposerResetKey((current) => current + 1);
    setPendingAgentQuestion(null);
    hydrateSession(null);
  };

  const removeSession = async (sessionId: string) => {
    if (activeAgentTaskIdRef.current) {
      setSessionsError("Agent 正在处理，结束后再删除聊天记录");
      return;
    }

    const confirmed = window.confirm("永久删除该聊天记录？此操作不可恢复。");
    if (!confirmed) {
      return;
    }

    setIsSessionsLoading(true);
    setSessionsError("");

    try {
      const nextSessions = await deleteChatSession(workspace.path, sessionId);
      setChatSessions(nextSessions);
      if (currentSessionId === sessionId) {
        const latestSession = await loadChatSession(workspace.path);
        hydrateSession(latestSession
          ? {
            id: latestSession.id,
            title: latestSession.title,
            messages: latestSession.messages,
            conversation: latestSession.conversation,
            context: latestSession.context,
          }
          : null);
      }
    } catch (caught) {
      setSessionsError(String(caught));
    } finally {
      setIsSessionsLoading(false);
    }
  };

  const toggleThinking = (messageId: string) => {
    setExpandedThinkingIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const toggleAgentThinkingBlock = (messageId: string, blockId: string) => {
    updateMessage(messageId, (message) => ({
      ...message,
      agentBlocks: message.agentBlocks?.map((block) =>
        block.id === blockId && block.type === "thinking"
          ? { ...block, isCollapsed: !block.isCollapsed }
          : block,
      ),
    }));
  };

  const toggleAgentBlock = (messageId: string, blockId: string) => {
    updateMessage(messageId, (message) => ({
      ...message,
      agentBlocks: message.agentBlocks?.map((block) =>
        block.id === blockId && (block.type === "thinking" || block.type === "tool")
          ? { ...block, isCollapsed: !block.isCollapsed }
          : block,
      ),
    }));
  };

  const collapseAgentBlock = useCallback((messageId: string, blockId: string) => {
    updateMessage(messageId, (message) => ({
      ...message,
      agentBlocks: message.agentBlocks?.map((block) =>
        block.id === blockId && (block.type === "thinking" || block.type === "tool")
          ? { ...block, isCollapsed: true }
          : block,
      ),
    }));
  }, [updateMessage]);

  const scheduleAgentBlockCollapse = useCallback((messageId: string, blockId: string) => {
    const timerKey = `${messageId}:${blockId}`;
    const existingTimer = agentBlockCollapseTimersRef.current.get(timerKey);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const timer = window.setTimeout(() => {
      agentBlockCollapseTimersRef.current.delete(timerKey);
      collapseAgentBlock(messageId, blockId);
    }, AGENT_BLOCK_AUTO_COLLAPSE_DELAY_MS);
    agentBlockCollapseTimersRef.current.set(timerKey, timer);
  }, [collapseAgentBlock]);

  const toggleAgentEvents = (messageId: string) => {
    setExpandedAgentEventIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const loadLlmOptions = useCallback(async () => {
    setIsSettingsLoading(true);
    setSettingsError("");

    try {
      const [settings, agentSettings] = await Promise.all([
        getLlmSettings(),
        getAiAgentSettings(),
      ]);
      const nextProviders = settings.providers;
      const defaultProvider = findDefaultProvider(nextProviders);

      setProviders(nextProviders);
      setAgents(agentSettings.agents);
      setSelectedProviderId((currentProviderId) => {
        const currentProvider = nextProviders.find((provider) => provider.id === currentProviderId);
        const nextProvider = currentProvider ?? defaultProvider;

        setSelectedModelId((currentModelId) => {
          const currentModel = nextProvider?.models.find((model) => model.id === currentModelId && model.isEnabled);
          const nextModel = currentModel ?? nextProvider?.models.find((model) => model.isEnabled);
          return nextModel?.id ?? "";
        });

        return nextProvider?.id ?? "";
      });
      setSelectedAgentId((currentAgentId) => {
        const profiles = resolveAgentProfiles(agentSettings.agents, nextProviders);
        const currentProfile = profiles.find((agent) => agent.id === currentAgentId);
        return currentProfile?.id ?? profiles[0]?.id ?? "";
      });
      setSelectedReviewerAgentId((currentAgentId) => {
        const profiles = resolveAgentProfiles(agentSettings.agents, nextProviders);
        const currentProfile = profiles.find((agent) => agent.id === currentAgentId);
        return currentProfile?.id ?? profiles[1]?.id ?? profiles[0]?.id ?? "";
      });
      setModelSource((currentSource) => {
        const profiles = resolveAgentProfiles(agentSettings.agents, nextProviders);
        return currentSource === "agent" && profiles.length === 0 ? "direct" : currentSource;
      });
    } catch (caught) {
      setSettingsError(String(caught));
    } finally {
      setHasLoadedSettings(true);
      setIsSettingsLoading(false);
    }
  }, []);

  const loadWorkspaceSkills = useCallback(async () => {
    setIsSkillsLoading(true);
    setSkillsError("");

    try {
      const settings = await getWorkspaceSkills(workspace.id);
      setSkills(settings.skills);
      setEnabledSkillNames(
        settings.skills
          .filter((skill) => skill.enabled)
          .map((skill) => skill.name),
      );
    } catch (caught) {
      setSkillsError(String(caught));
    } finally {
      setIsSkillsLoading(false);
    }
  }, [workspace.id]);

  const toggleWorkspaceSkill = (name: string, enabled: boolean) => {
    setEnabledSkillNames((current) => {
      const next = new Set(current);
      if (enabled) {
        next.add(name);
      } else {
        next.delete(name);
      }
      return [...next].sort();
    });
  };

  const handleSkillsDialogOpenChange = (open: boolean) => {
    setIsSkillsDialogOpen(open);
    if (!open) {
      setEnabledSkillNames(
        skills
          .filter((skill) => skill.enabled)
          .map((skill) => skill.name),
      );
    }
  };

  const saveSkills = async () => {
    setIsSkillsSaving(true);
    setSkillsError("");

    try {
      const settings = await saveWorkspaceSkills(workspace.id, enabledSkillNames);
      setSkills(settings.skills);
      setEnabledSkillNames(
        settings.skills
          .filter((skill) => skill.enabled)
          .map((skill) => skill.name),
      );
      setIsSkillsDialogOpen(false);
    } catch (caught) {
      setSkillsError(String(caught));
    } finally {
      setIsSkillsSaving(false);
    }
  };

  const loadFiles = useCallback(async () => {
    setIsFilesLoading(true);
    setFileError("");

    try {
      const nextFiles = await listWorkspaceFiles(workspace.path);
      setFiles(nextFiles);
    } catch (caught) {
      setFileError(String(caught));
    } finally {
      setIsFilesLoading(false);
    }
  }, [workspace.path]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    setActiveFile(null);
    setFilePath("");
    setFileContent("");
    setFileError("");
    setFileViewMode("source");
    setExpandedFileTreePaths(new Set());
    setWorkspaceView("chat");
    setShowAllSessions(false);
  }, [workspace.id]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    void refreshAgentSessionStatus();
  }, [refreshAgentSessionStatus]);

  useEffect(() => {
    void loadLlmOptions();
  }, [loadLlmOptions]);

  useEffect(() => {
    void loadWorkspaceSkills();
  }, [loadWorkspaceSkills]);

  useEffect(() => {
    activeAgentTaskIdRef.current = activeAgentTaskId;
  }, [activeAgentTaskId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    conversationContextRef.current = conversationContext;
  }, [conversationContext]);

  useEffect(() => () => {
    if (saveSessionTimerRef.current) {
      window.clearTimeout(saveSessionTimerRef.current);
    }
    agentBlockCollapseTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    agentBlockCollapseTimersRef.current.clear();
  }, []);

  useEffect(() => {
    if (isHydratingSessionRef.current) {
      return;
    }

    if (saveSessionTimerRef.current) {
      window.clearTimeout(saveSessionTimerRef.current);
    }

    if (messages.length === 0 && !currentSessionId) {
      return;
    }

    const title = messages.length === 0 ? currentSessionTitle : deriveSessionTitle(messages);
    if (title !== currentSessionTitle) {
      setCurrentSessionTitle(title);
    }

    saveSessionTimerRef.current = window.setTimeout(() => {
      setIsSessionSaving(true);
      setSessionsError("");

      void saveChatSession({
        workspacePath: workspace.path,
        sessionId: currentSessionId,
        title,
        messages,
        conversation,
        context: conversationContext,
      })
        .then((session) => {
          setCurrentSessionId(session.id);
          setCurrentSessionTitle(session.title);
          setChatSessions((current) => {
            const nextMeta: ChatSessionMeta = {
              id: session.id,
              title: session.title,
              path: "",
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
              messageCount: session.messages.length,
            };
            const withoutCurrent = current.filter((item) => item.id !== session.id);
            return [nextMeta, ...withoutCurrent].sort((left, right) => right.updatedAt - left.updatedAt);
          });
        })
        .catch((caught) => {
          setSessionsError(String(caught));
        })
        .finally(() => {
          setIsSessionSaving(false);
        });
    }, 700);
  }, [conversation, conversationContext, currentSessionId, currentSessionTitle, messages, workspace.path]);

  useEffect(() => {
    scrollActiveThinkingToBottom();
    scrollChatToBottom(messages.length > 2 ? "smooth" : "auto");
  }, [messages, pendingAgentQuestion, scrollActiveThinkingToBottom, scrollChatToBottom]);

  useEffect(() => {
    messages.forEach((message) => {
      if (message.role !== "assistant" || message.mode !== "agent") {
        return;
      }

      message.agentBlocks?.forEach((block) => {
        if (block.type === "tool" && block.status === "done" && !block.isCollapsed) {
          scheduleAgentBlockCollapse(message.id, block.id);
        }
      });
    });
  }, [messages, scheduleAgentBlockCollapse]);

  const appendAgentConversationResult = useCallback((
    assistantText: string,
    status: "done" | "error",
    statusMessage?: string,
  ) => {
    const agentSessionId = activeAgentSessionIdRef.current || agentRuntimeSessionId || "";
    const agentId = activeAgentIdRef.current || "default";
    const executionSummary = buildAgentExecutionSummary(
      activeAgentTraceRef.current,
      status,
      statusMessage,
    );
    const conversationContent = buildAgentConversationContent(assistantText);

    setConversation((current) => {
	      const nextConversation: ConversationMessage[] = [
	        ...current,
        {
          id: activeAgentMessageIdRef.current || createMessageId(),
          role: "assistant",
          content: conversationContent,
          timestamp: Date.now(),
          metadata: {
            agentExecutionSummary: executionSummary,
            agentRunStatus: status,
            agentSessionId,
          },
	        },
	      ];
	      conversationRef.current = nextConversation;

	      void updateConversationContext(
        nextConversation,
        conversationContextRef.current,
        conversationSummarizerRef.current ?? undefined,
      ).then(async (nextContext) => {
        let latestAgentSessionStatus = agentSessionStatus;
        if (agentSessionId) {
          try {
            latestAgentSessionStatus = await getAgentSessionStatus(workspace.path, agentSessionId);
            setAgentSessionStatus(latestAgentSessionStatus);
            setAgentSessionError("");
          } catch (caught) {
            setAgentSessionError(String(caught));
          }
        }

	        const syncedContext = agentSessionId
	          ? markAgentConversationSynced(nextContext, nextConversation, agentId, {
	            sessionId: agentSessionId,
	            updatedAt: Date.now(),
	            lastRunStatus: status,
	            sessionFingerprint: createAgentSessionFingerprint(latestAgentSessionStatus),
	          })
	          : nextContext;
	        agentContextInvalidatedRef.current = false;
	        conversationContextRef.current = syncedContext;
        setConversationContext(syncedContext);
      });

      return nextConversation;
    });

    return executionSummary;
  }, [agentRuntimeSessionId, agentSessionStatus, workspace.path]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let disposed = false;

    void agentRuntime.subscribe((event) => {
      const currentTaskId = activeAgentTaskIdRef.current;
      if (currentTaskId && event.taskId !== currentTaskId) {
        return;
      }

      const messageId = activeAgentMessageIdRef.current;
      if (!messageId) {
        return;
      }

      recordAgentMemoryEvent(activeAgentTraceRef.current, event);

      if (event.type === "text_delta") {
        updateMessage(messageId, (message) => {
          const text = `${message.text}${event.delta}`;
          return {
            ...message,
            text,
            agentBlocks: updateLastAgentTextBlock(message, (content) => `${content}${event.delta}`),
            status: "streaming",
          };
        });
        return;
      }

      if (event.type === "thinking_delta") {
        updateMessage(messageId, (message) => {
          const agentBlocks = updateLastAgentThinkingBlock(
            message,
            (content) => `${content}${event.delta}`,
          );
          return {
            ...message,
            thinking: mergeAgentThinking(agentBlocks),
            agentBlocks,
            status: "streaming",
          };
        });
        return;
      }

      if (event.type === "thinking_end") {
        let thinkingBlockId: string | null = null;
        updateMessage(messageId, (message) => {
          const result = finalizeLastAgentThinkingBlock(message, event.content);
          const agentBlocks = result.blocks;
          thinkingBlockId = result.blockId;
          return {
            ...message,
            thinking: mergeAgentThinking(agentBlocks),
            agentBlocks,
            status: "streaming",
          };
        });
        if (thinkingBlockId) {
          scheduleAgentBlockCollapse(messageId, thinkingBlockId);
        }
        return;
      }

      if (event.type === "replace_text") {
        updateMessage(messageId, (message) => ({
          ...message,
          text: event.text,
          agentBlocks: updateLastAgentTextBlock(message, () => event.text),
          status: "streaming",
        }));
        return;
      }

      if (isTimelineEvent(event)) {
        let completedToolBlockId: string | null = null;
        updateMessage(messageId, (message) => {
          let agentBlocks = message.agentBlocks;
          if (
            event.type === "tool_start" ||
            event.type === "tool_update" ||
            event.type === "tool_end"
          ) {
            const result = appendAgentToolEventBlock(message, event);
            agentBlocks = result.blocks;
            completedToolBlockId = event.type === "tool_end" ? result.blockId : null;
          }

          return {
            ...message,
            agentBlocks,
            agentEvents: [...(message.agentEvents ?? []), event].slice(-80),
            status: event.type === "error" ? "error" : message.status,
          };
        });
        if (completedToolBlockId && event.type === "tool_end" && !event.isError) {
          scheduleAgentBlockCollapse(messageId, completedToolBlockId);
        }
      }

      if (event.type === "question") {
        setPendingAgentQuestion({
          taskId: event.taskId,
          questionId: event.questionId,
          question: event.question,
          context: event.context,
          input: event.input,
        });
        setAgentQuestionAnswer(event.input?.selected ?? "");
        setCustomAgentQuestionAnswer("");
        return;
      }

      if (event.type === "question_answered") {
        setPendingAgentQuestion((current) =>
          current?.questionId === event.questionId ? null : current,
        );
        setAgentQuestionAnswer("");
        setCustomAgentQuestionAnswer("");
        return;
      }

      if (event.type === "done") {
        if (handledAgentDoneTaskIdsRef.current.has(event.taskId)) {
          return;
        }
        handledAgentDoneTaskIdsRef.current.add(event.taskId);

        const assistantText = event.text.trim();
        const conversationText = assistantText || "Agent 任务已完成。";
        updateMessage(messageId, (message) => {
          const text = assistantText || message.text || "Agent 任务已完成。";
          const hasTextBlock = message.agentBlocks?.some((block) => block.type === "text");
          const agentBlocks = removeEmptyAgentThinkingBlocks(message.agentBlocks);
          return {
            ...message,
            text,
            agentBlocks: hasTextBlock ? agentBlocks : updateLastAgentTextBlock({
              ...message,
              agentBlocks,
            }, () => text),
            status: "done",
          };
        });
        appendAgentConversationResult(conversationText, "done");
        setActiveAgentTaskId("");
        setPendingAgentQuestion(null);
        activeAgentTaskIdRef.current = "";
        activeAgentMessageIdRef.current = "";
        activeAgentSessionIdRef.current = "";
        activeAgentIdRef.current = "";
        activeAgentTraceRef.current = createAgentMemoryTrace();
        lastAgentErrorRef.current = "";
        lastAgentStderrRef.current = "";
        void loadFiles();
        void refreshAgentSessionStatus();
      }

      if (event.type === "stderr") {
        lastAgentStderrRef.current = event.message;
      }

      if (event.type === "error") {
        const terminalTaskId = event.taskId ?? currentTaskId;
        if (terminalTaskId && handledAgentDoneTaskIdsRef.current.has(terminalTaskId)) {
          return;
        }
        if (terminalTaskId) {
          handledAgentDoneTaskIdsRef.current.add(terminalTaskId);
        }
        lastAgentErrorRef.current = event.message;
        setChatError(event.message);
        updateMessage(messageId, (message) => ({
          ...message,
          text: event.message,
          status: "error",
        }));
        appendAgentConversationResult(event.message, "error", event.message);
        setActiveAgentTaskId("");
        setPendingAgentQuestion(null);
        activeAgentTaskIdRef.current = "";
        activeAgentMessageIdRef.current = "";
        activeAgentSessionIdRef.current = "";
        activeAgentIdRef.current = "";
        activeAgentTraceRef.current = createAgentMemoryTrace();
        void refreshAgentSessionStatus();
      }

      if (event.type === "exit" && !event.success) {
        if (handledAgentDoneTaskIdsRef.current.has(event.taskId)) {
          return;
        }
        handledAgentDoneTaskIdsRef.current.add(event.taskId);
        const message =
          lastAgentErrorRef.current ||
          lastAgentStderrRef.current ||
          `Agent 任务异常退出：${event.code ?? "unknown"}`;
        setChatError(message);
        updateMessage(messageId, (currentMessage) => ({
          ...currentMessage,
          text: message,
          status: "error",
        }));
        appendAgentConversationResult(message, "error", message);
        setActiveAgentTaskId("");
        setPendingAgentQuestion(null);
        activeAgentTaskIdRef.current = "";
        activeAgentMessageIdRef.current = "";
        activeAgentSessionIdRef.current = "";
        activeAgentIdRef.current = "";
        activeAgentTraceRef.current = createAgentMemoryTrace();
        lastAgentErrorRef.current = "";
        lastAgentStderrRef.current = "";
        void refreshAgentSessionStatus();
      }
    }).then((unsubscribe) => {
      if (disposed) {
        unsubscribe();
        return;
      }
      cleanup = unsubscribe;
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [agentRuntime, appendAgentConversationResult, loadFiles, refreshAgentSessionStatus, updateMessage]);

  const selectableFiles = useMemo(
    () => files.filter((file) => !file.isDirectory),
    [files],
  );
  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );

  const selectedModels = useMemo(
    () => selectedProvider?.models.filter((model) => model.isEnabled) ?? [],
    [selectedProvider],
  );

  const selectedModel = useMemo(
    () => selectedModels.find((model) => model.id === selectedModelId)
      ?? selectedModels[0]
      ?? null,
    [selectedModelId, selectedModels],
  );
  const runtimeAgentCapability: AgentRuntimeAgentCapability = chatMode === "agent" ? "agent" : "chat";
  const availableRuntimeAgents = useMemo(
    () => runtimeAgents.filter((agent) =>
      agent.capabilities.includes(runtimeAgentCapability),
    ),
    [runtimeAgentCapability, runtimeAgents],
  );
  const selectedRuntimeAgent = useMemo(
    () => availableRuntimeAgents.find((agent) => agent.id === selectedRuntimeAgentId)
      ?? availableRuntimeAgents.find((agent) => agent.id === defaultRuntimeAgentId)
      ?? availableRuntimeAgents[0]
      ?? null,
    [availableRuntimeAgents, defaultRuntimeAgentId, selectedRuntimeAgentId],
  );
  const runtimeAgentId = selectedRuntimeAgent?.id ?? defaultRuntimeAgentId;
  const runtimeAgentRequiresModel = selectedRuntimeAgent?.requiresModel ?? true;
  useEffect(() => {
    if (activeAgentTaskId) {
      return;
    }

    const sync = conversationContext?.historyInvalidatedAt
      ? null
      : getAgentConversationSync(conversationContext, runtimeAgentId);
    setAgentRuntimeSessionId(sync && !sync.invalidatedAt ? sync.sessionId : null);
  }, [activeAgentTaskId, conversationContext, runtimeAgentId]);

  const agentProfiles = useMemo(
    () => resolveAgentProfiles(agents, providers),
    [agents, providers],
  );
  const selectedAgent = useMemo(
    () => agentProfiles.find((agent) => agent.id === selectedAgentId)
      ?? agentProfiles[0]
      ?? null,
    [agentProfiles, selectedAgentId],
  );
  const reviewerAgent = useMemo(
    () => agentProfiles.find((agent) => agent.id === selectedReviewerAgentId)
      ?? agentProfiles.find((agent) => agent.id !== selectedAgent?.id)
      ?? selectedAgent
      ?? null,
    [agentProfiles, selectedAgent, selectedReviewerAgentId],
  );
  const effectiveProvider = modelSource === "agent"
    ? selectedAgent?.provider ?? null
    : selectedProvider;
  const effectiveModel = modelSource === "agent"
    ? selectedAgent?.model ?? null
    : selectedModel;
  const runtimeModelFor = useCallback((
    provider: LlmProvider,
    model: ProviderModel,
  ): AgentRuntimeModelConfig => ({
    ...toAgentRuntimeModelConfig(provider, model),
    contextWindow: contextWindowPreset,
  }), [contextWindowPreset]);
  const contextModelFor = useCallback((
    provider?: LlmProvider | null,
    model?: ProviderModel | null,
  ) => provider && model
    ? runtimeModelFor(provider, model)
    : { contextWindow: contextWindowPreset }, [contextWindowPreset, runtimeModelFor]);
  const compressConversationContext = useCallback(async () => {
    if (conversation.length === 0) {
      return;
    }

    setIsContextCompressing(true);
    setSessionsError("");

    try {
      const limits = createPromptContextLimits(contextModelFor(effectiveProvider, effectiveModel));
      const summarizer = runtimeAgentRequiresModel && effectiveProvider && effectiveModel
        ? createConversationSummarizer(effectiveProvider, effectiveModel)
        : undefined;
      const nextContext = await updateConversationContext(
        conversation,
        conversationContext,
        {
          summarizer,
          tokenBudget: limits.recentHistoryTokens,
          forceSummarize: true,
          rebuildSummary: true,
        },
      );
      conversationContextRef.current = nextContext;
      setConversationContext(nextContext);
    } catch (caught) {
      setSessionsError(String(caught));
    } finally {
      setIsContextCompressing(false);
    }
  }, [
    conversation,
    conversationContext,
    contextModelFor,
    effectiveModel,
    effectiveProvider,
    runtimeAgentRequiresModel,
  ]);

  const rebuildConversationContextAfterHistoryChange = useCallback(async (
    nextConversation: ConversationMessage[],
  ) => {
    if (nextConversation.length === 0) {
      const invalidatedContext = invalidateConversationContextForHistoryChange(
        conversationContextRef.current,
        nextConversation,
      );
      conversationContextRef.current = invalidatedContext;
      setConversationContext(invalidatedContext);
      return;
    }

    const summaryProvider = chatMode === "collab" && selectedAgent
      ? selectedAgent.provider
      : effectiveProvider;
    const summaryModel = chatMode === "collab" && selectedAgent
      ? selectedAgent.model
      : effectiveModel;
    const limits = createPromptContextLimits(contextModelFor(summaryProvider, summaryModel));
    const summarizer = runtimeAgentRequiresModel && summaryProvider && summaryModel
      ? createConversationSummarizer(summaryProvider, summaryModel)
      : undefined;
    conversationSummarizerRef.current = summarizer ?? null;

    const nextContext = await updateConversationContext(
      nextConversation,
      conversationContextRef.current,
      {
        summarizer,
        tokenBudget: limits.recentHistoryTokens,
        forceSummarize: true,
        rebuildSummary: true,
      },
    );
    conversationContextRef.current = nextContext;
    setConversationContext(nextContext);
  }, [
    chatMode,
    contextModelFor,
    effectiveModel,
    effectiveProvider,
    runtimeAgentRequiresModel,
    selectedAgent,
  ]);

  const applyHistoryChange = useCallback((
    nextMessages: ChatMessage[],
  ) => {
    if (activeAgentTaskIdRef.current) {
      setSessionsError("Agent 正在处理，结束后再修改历史记录");
      return;
    }

    setSessionsError("");
    const sanitizedConversation = stripHiddenAgentContextMetadata(
      rebuildConversationFromVisibleMessages(
        conversationRef.current,
        messagesRef.current,
        nextMessages,
      ),
    );
    agentContextInvalidatedRef.current = true;
    const invalidatedContext = invalidateConversationContextForHistoryChange(
      conversationContextRef.current,
      sanitizedConversation,
    );
    conversationContextRef.current = invalidatedContext;
    setConversationContext(invalidatedContext);
    setAgentRuntimeSessionId(null);
    setAgentSessionStatus(null);
    setAgentSessionError("");
    messagesRef.current = nextMessages;
    conversationRef.current = sanitizedConversation;
    setMessages(nextMessages);
    setConversation(sanitizedConversation);
    if (currentSessionId) {
      const resetPromise = resetAgentSessionsForChat(workspace.path, currentSessionId)
        .then(() => true)
        .catch((caught) => {
          setSessionsError(String(caught));
          return false;
        })
        .finally(() => {
          if (agentSessionResetPromiseRef.current === resetPromise) {
            agentSessionResetPromiseRef.current = null;
          }
        });
      agentSessionResetPromiseRef.current = resetPromise;
    }
    void rebuildConversationContextAfterHistoryChange(sanitizedConversation).catch((caught) => {
      setSessionsError(String(caught));
    });
  }, [currentSessionId, rebuildConversationContextAfterHistoryChange, workspace.path]);

  const editHistoryMessage = useCallback((messageId: string, nextText: string) => {
    const content = nextText.trim();
    if (!content) {
      setSessionsError("消息内容不能为空，可以使用删除操作移除这条消息");
      return;
    }

    const currentMessages = messagesRef.current;
    const editedMessage = currentMessages.find((message) => message.id === messageId);
    const editedMessages = currentMessages.map((message) =>
      message.id === messageId
        ? {
          ...message,
          text: content,
          thinking: undefined,
          agentBlocks: undefined,
          status: message.status === "error" ? "done" : message.status,
        }
        : message,
    );
    const nextMessages = editedMessage
      ? keepHistoryThroughMessage(editedMessages, messageId)
      : editedMessages;

    applyHistoryChange(nextMessages);
  }, [applyHistoryChange]);

  const deleteHistoryMessage = useCallback((messageId: string) => {
    applyHistoryChange(removeHistoryMessageSegment(messagesRef.current, messageId));
  }, [applyHistoryChange]);

  const moveHistoryMessage = useCallback((
    messageId: string,
    direction: "up" | "down",
  ) => {
    applyHistoryChange(moveHistoryItem(messagesRef.current, messageId, direction));
  }, [applyHistoryChange]);
  const enabledSkills = useMemo(() => {
    const names = new Set(enabledSkillNames);
    return skills.filter((skill) => names.has(skill.name));
  }, [enabledSkillNames, skills]);
  const latestAgentExecutionSummary = useMemo(
    () => findLatestAgentExecutionSummary(conversation),
    [conversation],
  );

  useEffect(() => {
    if (selectedRuntimeAgent && selectedRuntimeAgent.id !== selectedRuntimeAgentId) {
      setSelectedRuntimeAgentId(selectedRuntimeAgent.id);
    }
  }, [selectedRuntimeAgent, selectedRuntimeAgentId]);

  const loadRuntimeAgents = useCallback(async () => {
    try {
      const definitions = await agentRuntime.listAgents();
      setRuntimeAgents([...definitions.agents]);
      setDefaultRuntimeAgentId(definitions.defaultAgentId);
      setSelectedRuntimeAgentId((currentAgentId) =>
        definitions.agents.some((agent) => agent.id === currentAgentId)
          ? currentAgentId
          : definitions.defaultAgentId,
      );
    } catch (caught) {
      setSettingsError(String(caught));
    }
  }, [agentRuntime]);

  useEffect(() => {
    void loadRuntimeAgents();
  }, [loadRuntimeAgents]);
  const sidebarWorkspaces = useMemo(
    () => projectSections.flatMap((section) => section.workspaces),
    [projectSections],
  );
  const visibleSidebarSessions = showAllSessions
    ? chatSessions
    : chatSessions.slice(0, 5);
  const isMarkdownFile = useMemo(
    () => isMarkdownPath(filePath),
    [filePath],
  );
  useEffect(() => {
    setExpandedFileTreePaths((current) => {
      const next = new Set(current);
      files.forEach((file) => {
        if (file.isDirectory && !file.path.includes("/")) {
          next.add(file.path);
        }
      });
      if (activeFile?.path) {
        getParentDirectoryPaths(activeFile.path).forEach((path) => next.add(path));
      }
      return next;
    });
  }, [activeFile?.path, files]);

  useEffect(() => {
    if (!selectedProvider) {
      setSelectedModelId("");
      return;
    }

    if (!selectedModel || !selectedProvider.models.some((model) => model.id === selectedModel.id)) {
      setSelectedModelId(selectedProvider.models.find((model) => model.isEnabled)?.id ?? "");
    }
  }, [selectedModel, selectedProvider]);

  useEffect(() => {
    if (hasLoadedSettings && modelSource === "agent" && !selectedAgent && agentProfiles.length === 0) {
      setModelSource("direct");
    }
  }, [agentProfiles.length, hasLoadedSettings, modelSource, selectedAgent]);

  useEffect(() => {
    if (!reviewerAgent) {
      setSelectedReviewerAgentId("");
      return;
    }

    if (!agentProfiles.some((agent) => agent.id === selectedReviewerAgentId)) {
      setSelectedReviewerAgentId(reviewerAgent.id);
    }
  }, [agentProfiles, reviewerAgent, selectedReviewerAgentId]);

  useEffect(() => {
    if (!isMarkdownFile && fileViewMode === "preview") {
      setFileViewMode("source");
    }
  }, [fileViewMode, isMarkdownFile]);

  const openFile = async (path: string) => {
    setFileError("");

    try {
      const file = await readWorkspaceFile(workspace.path, path);
      setActiveFile(file);
      setFilePath(file.path);
      setFileContent(file.content);
      setWorkspaceView((current) => current === "split" ? "split" : "file");
    } catch (caught) {
      setFileError(String(caught));
    }
  };

  const prepareNewFile = () => {
    setActiveFile(null);
    setFilePath("");
    setFileContent("");
    setFileError("");
    setFileViewMode("source");
    setWorkspaceView((current) => current === "split" ? "split" : "file");
  };

  const saveFile = async () => {
    setIsFileSaving(true);
    setFileError("");

    try {
      const saved = await writeWorkspaceFile(workspace.path, filePath, fileContent);
      setActiveFile(saved);
      setFilePath(saved.path);
      setFileContent(saved.content);
      await loadFiles();
    } catch (caught) {
      setFileError(String(caught));
    } finally {
      setIsFileSaving(false);
    }
  };

  const submitAgentQuestionAnswer = async (answerValue: string) => {
    const answer = answerValue.trim();
    if (!pendingAgentQuestion || !answer || isAnsweringAgentQuestion) {
      return;
    }

    setIsAnsweringAgentQuestion(true);
    setChatError("");

    try {
      await agentRuntime.answerQuestion(
        pendingAgentQuestion.taskId,
        pendingAgentQuestion.questionId,
        answer,
      );
      setAgentQuestionAnswer("");
      setCustomAgentQuestionAnswer("");
    } catch (caught) {
      setChatError(String(caught));
    } finally {
      setIsAnsweringAgentQuestion(false);
    }
  };

  const answerAgentQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    await submitAgentQuestionAnswer(
      agentQuestionAnswer === "other" ? customAgentQuestionAnswer : agentQuestionAnswer,
    );
  };

  const sendMessage = async ({
    text,
    referencedFilePreviews,
    unresolvedFileReferences,
    ambiguousFileReferences,
  }: ComposerSubmitInput) => {
    if (!text || isSending || activeAgentTaskId) {
      return;
    }

    if (chatMode === "collab" && (!selectedAgent || !reviewerAgent)) {
      setChatError("请选择写作 Agent 和审查 Agent");
      return;
    }

    if (chatMode !== "collab" && runtimeAgentRequiresModel && (!effectiveProvider || !effectiveModel)) {
      setChatError("请选择要使用的 LLM 和模型");
      return;
    }

    if (unresolvedFileReferences.length > 0) {
      setChatError(`未找到引用文件：${unresolvedFileReferences.map((match) => `@${match.token}`).join("、")}`);
      return;
    }

    if (ambiguousFileReferences.length > 0) {
      setChatError(
        ambiguousFileReferences
          .map((match) => {
            const candidates = match.matches.slice(0, 5).map((file) => file.path).join("、");
            return `@${match.token} 匹配到多个文件：${candidates}`;
          })
          .join("\n"),
      );
      return;
    }

    let referencedFiles: ResolvedFileReference[] = [];
    try {
      referencedFiles = await Promise.all(
        referencedFilePreviews.map(async (file) => {
          const content = await readWorkspaceFile(workspace.path, file.path);
          return {
            path: content.path,
            content: content.content,
          };
        }),
      );
    } catch (caught) {
      setChatError(`读取引用文件失败：${String(caught)}`);
      return;
    }

	    const now = Date.now();
	    const userMessageId = createMessageId();
	    const assistantMessageId = createMessageId();
	    const baseConversation = conversationRef.current;
	    const baseConversationContext = conversationContextRef.current;
	    const currentAgentExecutionSummary = findLatestAgentExecutionSummary(baseConversation);
	    const userMessage: ConversationMessage = {
	      id: userMessageId,
	      role: "user",
	      content: text,
	      timestamp: now,
	    };
	    const nextConversation = [...baseConversation, userMessage];
    const userUiMessage: ChatMessage = {
      id: userMessageId,
      role: "user",
      text,
      createdAt: now,
      referencedFiles: referencedFiles.map((file) => ({ path: file.path })),
    };
    const assistantUiMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      mode: chatMode,
      text: "",
      status: "loading",
      createdAt: now,
      agentAvatar: modelSource === "agent" || chatMode === "collab" ? selectedAgent?.avatar : undefined,
      agentName: chatMode === "collab" && selectedAgent && reviewerAgent
        ? `${selectedAgent.name} + ${reviewerAgent.name}`
        : modelSource === "agent" ? selectedAgent?.name : undefined,
      agentEvents: chatMode === "agent" ? [] : undefined,
      agentBlocks: chatMode === "agent" ? [] : undefined,
    };
    const nextSessionId = chatMode === "agent" && !currentSessionId
      ? createChatSessionId()
      : currentSessionId;

	    if (nextSessionId && nextSessionId !== currentSessionId) {
	      setCurrentSessionId(nextSessionId);
	    }
	    const nextMessages = [...messagesRef.current, userUiMessage, assistantUiMessage];
	    messagesRef.current = nextMessages;
	    conversationRef.current = nextConversation;
	    setMessages(nextMessages);
	    setConversation(nextConversation);
    setIsSending(true);
    setChatError("");

    try {
      const limitsFor = (
        provider?: LlmProvider | null,
        model?: ProviderModel | null,
      ) => createPromptContextLimits(contextModelFor(provider, model));
      const summaryProvider = chatMode === "collab" && selectedAgent
        ? selectedAgent.provider
        : effectiveProvider;
      const summaryModel = chatMode === "collab" && selectedAgent
        ? selectedAgent.model
        : effectiveModel;
      const summaryLimits = limitsFor(summaryProvider, summaryModel);
      const summarizeConversation = runtimeAgentRequiresModel && summaryProvider && summaryModel
        ? createConversationSummarizer(summaryProvider, summaryModel)
        : undefined;
      conversationSummarizerRef.current = summarizeConversation ?? null;
	      const nextConversationContext = await updateConversationContext(
	        nextConversation,
	        baseConversationContext,
	        {
          summarizer: summarizeConversation,
          tokenBudget: summaryLimits.recentHistoryTokens,
        },
      );
      const runtimeMessages = buildRuntimeConversationMessages(
        nextConversation,
        nextConversationContext,
        summaryLimits.recentHistoryTokens,
      );
      const conversationSummary = nextConversationContext?.summary;
      setConversationContext(nextConversationContext);
      conversationContextRef.current = nextConversationContext;

      if (chatMode === "collab" && selectedAgent && reviewerAgent) {
        setCollaborationPhase("drafting");
        const draftResult = await runAgentRuntimeChat({
          agentId: runtimeAgentId,
          provider: selectedAgent.provider,
          model: selectedAgent.model,
          contextWindow: contextWindowPreset,
          stream: false,
          systemPrompt: buildCollaborationSystemPrompt(
            workspace,
            activeFile,
            referencedFiles,
            enabledSkills,
            selectedAgent,
            "draft",
            {
              limits: limitsFor(selectedAgent.provider, selectedAgent.model),
	              conversationSummary,
	              agentExecutionSummary: currentAgentExecutionSummary,
              contextQuery: text,
            },
          ),
          messages: runtimeMessages,
        });
        const draftText = draftResult.text.trim();
        updateMessage(assistantMessageId, (message) => ({
          ...message,
          text: [
            `## ${selectedAgent.name}：初稿`,
            draftText,
            "",
            `## ${reviewerAgent.name}：审查中`,
            "",
            "正在审查初稿...",
          ].join("\n\n"),
          thinking: draftResult.thinking?.trim() || undefined,
          status: "streaming",
        }));

        setCollaborationPhase("reviewing");
        const reviewResult = await runAgentRuntimeChat({
          agentId: runtimeAgentId,
          provider: reviewerAgent.provider,
          model: reviewerAgent.model,
          contextWindow: contextWindowPreset,
          stream: false,
          systemPrompt: buildCollaborationSystemPrompt(
            workspace,
            activeFile,
            referencedFiles,
            enabledSkills,
            reviewerAgent,
            "review",
            {
              limits: limitsFor(reviewerAgent.provider, reviewerAgent.model),
	              conversationSummary,
	              agentExecutionSummary: currentAgentExecutionSummary,
              contextQuery: text,
            },
          ),
          messages: buildRuntimeConversationMessages([
            ...nextConversation,
            {
              id: createMessageId(),
              role: "assistant",
              content: draftText,
              timestamp: Date.now(),
            },
          ], nextConversationContext, summaryLimits.recentHistoryTokens),
        });
        const reviewText = reviewResult.text.trim();
        updateMessage(assistantMessageId, (message) => ({
          ...message,
          text: [
            `## ${selectedAgent.name}：初稿`,
            draftText,
            "",
            `## ${reviewerAgent.name}：审查意见`,
            reviewText,
            "",
            `## ${selectedAgent.name}：修订中`,
            "",
            "正在根据审查意见修订...",
          ].join("\n\n"),
          thinking: [message.thinking, reviewResult.thinking?.trim()].filter(Boolean).join("\n\n") || undefined,
          status: "streaming",
        }));

        setCollaborationPhase("revising");
        const finalResult = await runAgentRuntimeChat({
          agentId: runtimeAgentId,
          provider: selectedAgent.provider,
          model: selectedAgent.model,
          contextWindow: contextWindowPreset,
          stream: false,
          systemPrompt: buildCollaborationSystemPrompt(
            workspace,
            activeFile,
            referencedFiles,
            enabledSkills,
            selectedAgent,
            "revise",
            {
              limits: limitsFor(selectedAgent.provider, selectedAgent.model),
	              conversationSummary,
	              agentExecutionSummary: currentAgentExecutionSummary,
              contextQuery: text,
            },
          ),
          messages: buildRuntimeConversationMessages([
            ...nextConversation,
            {
              id: createMessageId(),
              role: "assistant",
              content: draftText,
              timestamp: Date.now(),
            },
            {
              id: createMessageId(),
              role: "user",
              content: `这是审查 Agent 的意见，请据此修订并输出最终版本：\n\n${reviewText}`,
              timestamp: Date.now(),
            },
          ], nextConversationContext, summaryLimits.recentHistoryTokens),
        });
        const finalText = finalResult.text.trim();
        const collaborationText = [
          `## ${selectedAgent.name}：最终修订`,
          finalText,
          "",
          "<details>",
          `<summary>${selectedAgent.name} 初稿</summary>`,
          "",
          draftText,
          "",
          "</details>",
          "",
          "<details>",
          `<summary>${reviewerAgent.name} 审查意见</summary>`,
          "",
          reviewText,
          "",
          "</details>",
        ].join("\n\n");

        updateMessage(assistantMessageId, (message) => ({
          ...message,
          text: collaborationText,
          thinking: [message.thinking, finalResult.thinking?.trim()].filter(Boolean).join("\n\n") || undefined,
          status: "done",
        }));
	        const finalConversation: ConversationMessage[] = [
	          ...nextConversation,
          {
            id: assistantMessageId,
            role: "assistant",
            content: collaborationText,
            timestamp: Date.now(),
	          },
	        ];
	        conversationRef.current = finalConversation;
	        setConversation(finalConversation);
        const finalContext = await updateConversationContext(
          finalConversation,
          conversationContextRef.current,
          {
            summarizer: summarizeConversation,
            tokenBudget: summaryLimits.recentHistoryTokens,
          },
        );
        conversationContextRef.current = finalContext;
        setConversationContext(finalContext);
        setCollaborationPhase("idle");
        return;
      }

      if (runtimeAgentRequiresModel && (!effectiveProvider || !effectiveModel)) {
        setChatError("请选择要使用的 LLM 和模型");
        return;
      }

      if (chatMode === "agent") {
        if (!nextSessionId) {
          setChatError("无法创建 Agent 长期上下文，请重试");
          return;
        }
        const agentLimits = limitsFor(effectiveProvider, effectiveModel);
	        const agentPromptHistory = buildUnsyncedAgentConversationContext(
	          baseConversation,
	          baseConversationContext,
	          runtimeAgentId,
	          agentLimits.recentHistoryTokens,
	        );
	        const existingAgentSessionId = agentPromptHistory.agentSessionId ||
	          getAgentConversationSync(baseConversationContext, runtimeAgentId)?.sessionId ||
	          null;
	        const shouldRebuildAgentSessionFromAppHistory = Boolean(
	          agentContextInvalidatedRef.current ||
	          baseConversationContext?.historyInvalidatedAt ||
	          agentPromptHistory.syncStatus === "stale",
	        );
	        const shouldStartFreshAgentSession = shouldRebuildAgentSessionFromAppHistory;
	        const agentSessionId = shouldStartFreshAgentSession || !existingAgentSessionId
	          ? createAgentRuntimeSessionId(
	            nextSessionId,
	            runtimeAgentId,
	            shouldStartFreshAgentSession ? createAgentSessionGenerationId() : null,
	          )
	          : existingAgentSessionId;
        activeAgentMessageIdRef.current = assistantMessageId;
        activeAgentSessionIdRef.current = agentSessionId;
        activeAgentIdRef.current = runtimeAgentId;
        setAgentRuntimeSessionId(agentSessionId);
        activeAgentTraceRef.current = createAgentMemoryTrace();
        lastAgentErrorRef.current = "";
        lastAgentStderrRef.current = "";
        if (agentSessionResetPromiseRef.current) {
          const resetSucceeded = await agentSessionResetPromiseRef.current;
          if (!resetSucceeded) {
            throw new Error("无法重置旧 Agent 长期上下文，已停止本次运行以避免复用旧记忆。");
          }
        }
        let currentAgentSessionStatus = agentSessionStatus;
        try {
          currentAgentSessionStatus = await getAgentSessionStatus(workspace.path, agentSessionId);
          setAgentSessionStatus(currentAgentSessionStatus);
        } catch (caught) {
          setAgentSessionError(String(caught));
        }
	        const shouldBootstrapAgentContext =
	          shouldStartFreshAgentSession ||
	          currentAgentSessionStatus?.exists === false ||
	          currentAgentSessionStatus?.sessionFileCount === 0;
	        const agentBootstrapHistory = buildRuntimeConversationContext(
	          baseConversation,
	          baseConversationContext,
	          agentLimits.recentHistoryTokens,
	        );
        const effectiveAgentPromptHistory = shouldBootstrapAgentContext
          ? EMPTY_RUNTIME_CONVERSATION_CONTEXT
          : agentPromptHistory;
        const task = await agentRuntime.run({
          type: "agent",
          agentId: runtimeAgentId,
          workspacePath: workspace.path,
          chatSessionId: agentSessionId,
          bootstrapContext: buildAgentBootstrapPrompt(
            agentBootstrapHistory,
            modelSource === "agent" ? selectedAgent : null,
            agentLimits,
          ),
          prompt: buildAgentPrompt(
            text,
            referencedFiles,
            effectiveAgentPromptHistory,
            modelSource === "agent" ? selectedAgent : null,
            agentLimits,
            {
              includeConversationSummary: effectiveAgentPromptHistory.syncStatus === "stale",
              includeRecentConversation: true,
              contextQuery: text,
            },
          ),
          provider: effectiveProvider ? toAgentRuntimeProviderConfig(effectiveProvider) : undefined,
          model: effectiveProvider && effectiveModel
            ? runtimeModelFor(effectiveProvider, effectiveModel)
            : undefined,
          allowedTools: normalizeAllowedAgentTools(allowedAgentTools),
          enabledSkills: enabledSkills.map((skill) => skill.name),
        });
        handledAgentDoneTaskIdsRef.current.delete(task.taskId);
        activeAgentTaskIdRef.current = task.taskId;
        setActiveAgentTaskId(task.taskId);
        updateMessage(assistantMessageId, (message) => ({
          ...message,
          status: "streaming",
        }));
        return;
      }

      const result = await runAgentRuntimeChat({
        agentId: runtimeAgentId,
        provider: effectiveProvider,
        model: effectiveModel,
        contextWindow: contextWindowPreset,
        systemPrompt: buildSystemPrompt(
          workspace,
          activeFile,
          referencedFiles,
          enabledSkills,
          modelSource === "agent" ? selectedAgent : null,
          {
	            limits: limitsFor(effectiveProvider, effectiveModel),
	            conversationSummary,
	            agentExecutionSummary: currentAgentExecutionSummary,
	            contextQuery: text,
          },
        ),
        messages: runtimeMessages,
        onTextDelta: (delta) => {
          updateMessage(assistantMessageId, (message) => ({
            ...message,
            text: `${message.text}${delta}`,
            status: "streaming",
          }));
        },
        onThinkingDelta: (delta) => {
          updateMessage(assistantMessageId, (message) => ({
            ...message,
            thinking: `${message.thinking ?? ""}${delta}`,
            status: "streaming",
          }));
        },
      });
      const assistantText = result.text.trim();

      updateMessage(assistantMessageId, (message) => ({
        ...message,
        text: assistantText,
        thinking: result.thinking?.trim() || undefined,
        status: "done",
      }));
	      const finalConversation: ConversationMessage[] = [
	        ...nextConversation,
        {
          id: assistantMessageId,
          role: "assistant",
          content: assistantText,
          timestamp: Date.now(),
	        },
	      ];
	      conversationRef.current = finalConversation;
	      setConversation(finalConversation);
      const finalContext = await updateConversationContext(
        finalConversation,
        conversationContextRef.current,
        {
          summarizer: summarizeConversation,
          tokenBudget: summaryLimits.recentHistoryTokens,
        },
      );
      conversationContextRef.current = finalContext;
      setConversationContext(finalContext);
    } catch (caught) {
      const message = String(caught);
      setChatError(message);
      activeAgentTaskIdRef.current = "";
      activeAgentMessageIdRef.current = "";
      setActiveAgentTaskId("");
      updateMessage(assistantMessageId, (currentMessage) => ({
        ...currentMessage,
        text: message,
        status: "error",
      }));
      if (chatMode === "agent") {
        appendAgentConversationResult(message, "error", message);
        activeAgentSessionIdRef.current = "";
        activeAgentIdRef.current = "";
        activeAgentTraceRef.current = createAgentMemoryTrace();
      }
    } finally {
      setIsSending(false);
      setCollaborationPhase("idle");
    }
  };

  const toggleFileTreeDirectory = (path: string) => {
    setExpandedFileTreePaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const filePanel = (
    <FilePanel
      activeFile={activeFile}
      filePath={filePath}
      fileContent={fileContent}
      fileError={fileError}
      fileViewMode={fileViewMode}
      isMarkdownFile={isMarkdownFile}
      isFileSaving={isFileSaving}
      onFilePathChange={setFilePath}
      onFileContentChange={setFileContent}
      onFileViewModeChange={setFileViewMode}
      onSaveFile={() => void saveFile()}
    />
  );

  const chatPanel = (
    <ChatPanel
      chatScrollAreaRef={chatScrollAreaRef}
      workspace={workspace}
      messages={messages}
      expandedThinkingIds={expandedThinkingIds}
      expandedAgentEventIds={expandedAgentEventIds}
      modelSource={modelSource}
      selectedAgent={selectedAgent}
      chatError={chatError}
      settingsError={settingsError}
      skillsError={skillsError}
      sessionsError={sessionsError}
      pendingAgentQuestion={pendingAgentQuestion}
      agentQuestionAnswer={agentQuestionAnswer}
      customAgentQuestionAnswer={customAgentQuestionAnswer}
      isAnsweringAgentQuestion={isAnsweringAgentQuestion}
      files={files}
      composerResetKey={composerResetKey}
      isSending={isSending}
      activeAgentTaskId={activeAgentTaskId}
      isSettingsLoading={isSettingsLoading}
      chatMode={chatMode}
      contextWindowPreset={contextWindowPreset}
      availableRuntimeAgents={availableRuntimeAgents}
      selectedRuntimeAgent={selectedRuntimeAgent}
      runtimeAgentId={runtimeAgentId}
      agentProfiles={agentProfiles}
      providers={providers}
      selectedProviderId={selectedProviderId}
      selectedModel={selectedModel}
      reviewerAgent={reviewerAgent}
      allowedAgentTools={allowedAgentTools}
      toggleThinking={toggleThinking}
      toggleAgentEvents={toggleAgentEvents}
      toggleAgentThinkingBlock={toggleAgentThinkingBlock}
      toggleAgentBlock={toggleAgentBlock}
      onEditHistoryMessage={editHistoryMessage}
      onDeleteHistoryMessage={deleteHistoryMessage}
      onMoveHistoryMessage={moveHistoryMessage}
      answerAgentQuestion={answerAgentQuestion}
      setAgentQuestionAnswer={setAgentQuestionAnswer}
      setCustomAgentQuestionAnswer={setCustomAgentQuestionAnswer}
      submitAgentQuestionAnswer={submitAgentQuestionAnswer}
      setChatMode={setChatMode}
      setContextWindowPreset={setContextWindowPreset}
      setModelSource={setModelSource}
      setSelectedRuntimeAgentId={setSelectedRuntimeAgentId}
      setSelectedAgentId={setSelectedAgentId}
      setSelectedReviewerAgentId={setSelectedReviewerAgentId}
      setSelectedProviderId={setSelectedProviderId}
      setSelectedModelId={setSelectedModelId}
      toggleAllowedAgentTool={toggleAllowedAgentTool}
      sendMessage={sendMessage}
    />
  );

  const settingsPanel = (
    <SettingsPanel
      settingsError={settingsError}
      skillsError={skillsError}
      onBack={() => setWorkspaceView("chat")}
      onOpenLlmSettings={() => setIsLlmSettingsOpen(true)}
      onOpenAgentSettings={() => setIsAgentSettingsOpen(true)}
    />
  );

  return (
    <main className="flex h-screen min-h-screen overflow-hidden bg-muted/35 text-foreground">
      <SkillsDialog
        open={isSkillsDialogOpen}
        skills={skills}
        enabledSkillNames={enabledSkillNames}
        isLoading={isSkillsLoading}
        isSaving={isSkillsSaving}
        error={skillsError}
        onOpenChange={handleSkillsDialogOpenChange}
        onToggleSkill={toggleWorkspaceSkill}
        onSave={() => void saveSkills()}
      />
      <SettingsDialog
        open={isLlmSettingsOpen}
        onOpenChange={(open) => {
          setIsLlmSettingsOpen(open);
          if (!open) {
            void loadLlmOptions();
          }
        }}
      />
      <AgentSettingsDialog
        open={isAgentSettingsOpen}
        onOpenChange={(open) => {
          setIsAgentSettingsOpen(open);
          if (!open) {
            void loadLlmOptions();
          }
        }}
      />
      <Sidebar
        workspace={workspace}
        workspaces={sidebarWorkspaces}
        currentSessionId={currentSessionId}
        currentSessionTitle={currentSessionTitle}
        hasUnsavedSession={messages.length > 0 && !currentSessionId}
        isProjectsLoading={isProjectsLoading}
        projectsError={projectsError}
        isSessionsLoading={isSessionsLoading}
        chatSessions={chatSessions}
        visibleSessions={visibleSidebarSessions}
        showAllSessions={showAllSessions}
        onOpenWorkspace={onOpenWorkspace}
        onCreateWorkspace={onCreateWorkspace}
        onEditWorkspace={onEditWorkspace}
        onStartNewSession={startNewSession}
        onOpenSkills={() => setIsSkillsDialogOpen(true)}
        onRefreshConfig={() => void loadLlmOptions()}
        onRefreshProjects={() => void loadProjects()}
        onLoadSession={(sessionId) => void loadSessionById(sessionId)}
        onRemoveSession={(sessionId) => void removeSession(sessionId)}
        onToggleShowAllSessions={() => setShowAllSessions((current) => !current)}
        onOpenSettings={() => setWorkspaceView("settings")}
      />

      <section className="flex min-w-0 flex-1 flex-col bg-background">
        {workspaceView !== "settings" && (
          <WorkbenchHeader
            workspaceView={workspaceView}
            currentSessionTitle={currentSessionTitle}
            modelSource={modelSource}
            selectedAgent={selectedAgent}
            selectedRuntimeAgent={selectedRuntimeAgent}
            runtimeAgentRequiresModel={runtimeAgentRequiresModel}
            effectiveProvider={effectiveProvider}
            effectiveModel={effectiveModel}
            isContextPanelOpen={isContextPanelOpen}
            activeAgentTaskId={activeAgentTaskId}
            onWorkspaceViewChange={setWorkspaceView}
            onToggleContextPanel={() => setIsContextPanelOpen((current) => !current)}
            onAbortTask={() => void agentRuntime.abortTask(activeAgentTaskId)}
          />
        )}

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden">
            {workspaceView === "split" ? (
              <div className="grid min-h-0 h-full overflow-hidden grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]">
                <div className="min-h-0 overflow-hidden border-r border-border/80">
                  {filePanel}
                </div>
                <div className="min-h-0 overflow-hidden">
                  {chatPanel}
                </div>
              </div>
            ) : workspaceView === "file" ? (
              filePanel
            ) : workspaceView === "settings" ? (
              settingsPanel
            ) : (
              chatPanel
            )}
          </div>

          {isContextPanelOpen && workspaceView !== "settings" && (
            <ContextPanel
              selectableFileCount={selectableFiles.length}
              isFilesLoading={isFilesLoading}
              fileTree={fileTree}
              expandedFileTreePaths={expandedFileTreePaths}
              activeFile={activeFile}
              fileContent={fileContent}
              isMarkdownFile={isMarkdownFile}
              chatMode={chatMode}
              collaborationPhase={collaborationPhase}
              selectedAgent={selectedAgent}
              reviewerAgent={reviewerAgent}
              currentSessionId={currentSessionId}
              agentRuntimeSessionId={agentRuntimeSessionId}
              agentSessionStatus={agentSessionStatus}
              agentSessionError={agentSessionError}
              isAgentSessionLoading={isAgentSessionLoading}
              isContextCompressing={isContextCompressing}
              latestAgentExecutionSummary={latestAgentExecutionSummary}
              onRefreshFiles={() => void loadFiles()}
              onRefreshAgentSession={() => void refreshAgentSessionStatus()}
              onCleanupAgentSessions={() => void cleanupAgentSessions()}
              onCompressConversationContext={() => void compressConversationContext()}
              onPrepareNewFile={prepareNewFile}
              onClose={() => setIsContextPanelOpen(false)}
              onOpenFile={(path) => void openFile(path)}
              onToggleDirectory={toggleFileTreeDirectory}
              onEditFile={() => setWorkspaceView("file")}
            />
          )}
        </div>
      </section>
    </main>
  );
};
