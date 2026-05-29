import type { FormEvent, ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Brain,
  ChevronDown,
  ChevronRight,
  Columns3,
  Eye,
  FileText,
  FileType,
  Folder,
  FolderOpen,
  Link,
  Loader2,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Plug,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  User,
  Wrench,
} from "lucide-react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import {
  AGENT_TOOL_DEFINITIONS,
  DEFAULT_ALLOWED_AGENT_TOOLS,
  normalizeAllowedAgentTools,
  type AgentToolName,
} from "@/agent-runtime/contract";
import { createAgentRuntime } from "@/agent-runtime/runtime";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { getLlmSettings } from "@/features/llm-settings/api";
import { SettingsDialog } from "@/features/llm-settings/components/dialog";
import type { LlmProvider, ProviderModel } from "@/features/llm-settings/types";
import { findDefaultProvider } from "@/features/llm-settings/utils";
import { getAiAgentSettings } from "@/features/agent-settings/api";
import { AgentSettingsDialog } from "@/features/agent-settings/components/dialog";
import type { AgentProfile, AiAgent } from "@/features/agent-settings/types";
import { resolveAgentProfiles } from "@/features/agent-settings/utils";
import { getWorkspaceSkills, saveWorkspaceSkills } from "@/features/workspace-skills/api";
import { SkillsDialog } from "@/features/workspace-skills/components/skills-dialog";
import type { WorkspaceSkill } from "@/features/workspace-skills/types";
import { getWorkspaceOverview } from "@/features/workspaces/api";
import type { Workspace, WorkspaceSection } from "@/features/workspaces/types";
import { buildSections } from "@/features/workspaces/utils/sections";
import {
  buildRuntimeConversationContext,
  buildRuntimeConversationMessages,
  updateConversationContext,
  type ConversationSummarizer,
} from "../context";
import {
  toAgentRuntimeModelConfig,
  toAgentRuntimeProviderConfig,
} from "../utils/agent-runtime-config";
import type {
  ChatMode,
  CollaborationPhase,
  ComposerSubmitInput,
  FileTreeNode,
  ModelSource,
  PendingAgentQuestion,
  ResolvedFileReference,
  WorkspaceView,
} from "../page-types";
import {
  deleteChatSession,
  listWorkspaceFiles,
  listChatSessions,
  loadChatSession,
  readWorkspaceFile,
  runAgentRuntimeChat,
  saveChatSession,
  writeWorkspaceFile,
} from "../api";
import { MarkdownContent } from "./markdown-content";
import type {
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
  describeAgentGroupEvent,
  finalizeLastAgentThinkingBlock,
  groupAgentEvents,
  isTimelineEvent,
  mergeAgentThinking,
  removeEmptyAgentThinkingBlocks,
  updateLastAgentTextBlock,
  updateLastAgentThinkingBlock,
} from "../utils/agent-blocks";
import { buildFileTree, getParentDirectoryPaths } from "../utils/file-tree";
import {
  getActiveReferenceToken,
  quoteReferencePath,
  resolveFileReferenceMatches,
  summarizeReferenceMatches,
} from "../utils/references";
import {
  buildAgentPrompt,
  buildCollaborationSystemPrompt,
  buildSystemPrompt,
  createConversationSummarizer,
} from "../utils/prompts";
import {
  createMessageId,
  DEFAULT_SESSION_TITLE,
  deriveSessionTitle,
  formatSessionTime,
  isMarkdownPath,
} from "../utils/sessions";
import { CollaborationStatusPanel } from "./collaboration-status-panel";

type WorkspaceChatPageProps = {
  workspace: Workspace;
  onOpenWorkspace: (workspace: Workspace) => void;
};

type ChatComposerProps = {
  files: WorkspaceFileEntry[];
  resetKey: number;
  isSending: boolean;
  activeAgentTaskId: string;
  isSettingsLoading: boolean;
  chatMode: ChatMode;
  modelSource: ModelSource;
  agentProfiles: AgentProfile[];
  providers: LlmProvider[];
  selectedProviderId: string;
  selectedModel: ProviderModel | null;
  selectedAgent: AgentProfile | null;
  reviewerAgent: AgentProfile | null;
  allowedAgentTools: AgentToolName[];
  onChatModeChange: (mode: ChatMode) => void;
  onModelSourceChange: (source: ModelSource) => void;
  onSelectedAgentChange: (agentId: string) => void;
  onReviewerAgentChange: (agentId: string) => void;
  onProviderChange: (providerId: string) => void;
  onModelChange: (modelId: string) => void;
  onToggleAllowedAgentTool: (toolId: AgentToolName, enabled: boolean) => void;
  onSubmit: (input: ComposerSubmitInput) => void;
};

const ChatComposer = memo(({
  files,
  resetKey,
  isSending,
  activeAgentTaskId,
  isSettingsLoading,
  chatMode,
  modelSource,
  agentProfiles,
  providers,
  selectedProviderId,
  selectedModel,
  selectedAgent,
  reviewerAgent,
  allowedAgentTools,
  onChatModeChange,
  onModelSourceChange,
  onSelectedAgentChange,
  onReviewerAgentChange,
  onProviderChange,
  onModelChange,
  onToggleAllowedAgentTool,
  onSubmit,
}: ChatComposerProps) => {
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [prompt, setPrompt] = useState("");
  const [promptCursor, setPromptCursor] = useState(0);

  useEffect(() => {
    setPrompt("");
    setPromptCursor(0);
  }, [resetKey]);

  const selectableFiles = useMemo(
    () => files.filter((file) => !file.isDirectory),
    [files],
  );
  const activeReferenceToken = useMemo(
    () => getActiveReferenceToken(prompt, promptCursor),
    [prompt, promptCursor],
  );
  const referenceSuggestions = useMemo(() => {
    if (!activeReferenceToken) {
      return [];
    }

    const query = activeReferenceToken.query.toLowerCase();
    const candidates = query
      ? selectableFiles.filter((file) => {
        const path = file.path.toLowerCase();
        const name = file.name.toLowerCase();
        return path.includes(query) || name.includes(query);
      })
      : selectableFiles;

    return candidates.slice(0, 8);
  }, [activeReferenceToken, selectableFiles]);
  const fileReferenceMatches = useMemo(
    () => resolveFileReferenceMatches(prompt, files),
    [files, prompt],
  );
  const referencedFilePreviews = useMemo(
    () => summarizeReferenceMatches(fileReferenceMatches),
    [fileReferenceMatches],
  );
  const unresolvedFileReferences = useMemo(
    () => fileReferenceMatches.filter((match) => match.matches.length === 0),
    [fileReferenceMatches],
  );
  const ambiguousFileReferences = useMemo(
    () => fileReferenceMatches.filter((match) => match.matches.length > 1),
    [fileReferenceMatches],
  );
  const modeLabel =
    chatMode === "collab" ? "协作" : chatMode === "agent" ? "Agent" : "聊天";
  const modelLabel = chatMode === "collab" && selectedAgent && reviewerAgent
    ? `${selectedAgent.name} + ${reviewerAgent.name}`
    : modelSource === "agent"
      ? selectedAgent?.name ?? "选择 Agent"
      : selectedModel?.modelName || selectedModel?.modelId || "选择模型";

  const updatePromptCursor = () => {
    setPromptCursor(promptInputRef.current?.selectionStart ?? 0);
  };

  const insertFileReference = (file: WorkspaceFileEntry) => {
    if (!activeReferenceToken) {
      return;
    }

    const reference = quoteReferencePath(file.path);
    const nextPrompt = [
      prompt.slice(0, activeReferenceToken.start),
      reference,
      " ",
      prompt.slice(activeReferenceToken.end),
    ].join("");
    const nextCursor = activeReferenceToken.start + reference.length + 1;

    setPrompt(nextPrompt);
    setPromptCursor(nextCursor);
    window.setTimeout(() => {
      promptInputRef.current?.focus();
      promptInputRef.current?.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  };

  const submitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const text = prompt.trim();
    if (!text || isSending || activeAgentTaskId) {
      return;
    }

    onSubmit({
      text,
      referencedFilePreviews,
      unresolvedFileReferences,
      ambiguousFileReferences,
    });
    setPrompt("");
    setPromptCursor(0);
  };

  return (
    <>
      {fileReferenceMatches.length > 0 && (
        <div className="mx-auto mb-3 flex max-w-5xl flex-wrap gap-2 text-xs">
          {referencedFilePreviews.map((file) => (
            <span
              key={file.path}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-primary"
            >
              <Link className="size-3" />
              <span className="truncate">{file.path}</span>
            </span>
          ))}
          {unresolvedFileReferences.map((match) => (
            <span
              key={`missing-${match.token}`}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive"
            >
              未找到 @{match.token}
            </span>
          ))}
          {ambiguousFileReferences.map((match) => (
            <span
              key={`ambiguous-${match.token}`}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-muted-foreground"
              title={match.matches.map((file) => file.path).join("\n")}
            >
              @{match.token} 匹配 {match.matches.length} 个文件
            </span>
          ))}
        </div>
      )}

      <form
        action="#"
        className="mx-auto flex max-w-5xl flex-col overflow-hidden rounded-xl border border-input bg-card shadow-sm focus-within:ring-3 focus-within:ring-ring/25"
        onSubmit={submitPrompt}
      >
        <div className="relative min-w-0">
          {activeReferenceToken && (
            <div className="absolute right-0 bottom-[calc(100%+0.5rem)] left-0 z-20 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
              <div className="border-b border-border/70 px-2.5 py-1.5 text-xs text-muted-foreground">
                {activeReferenceToken.query
                  ? `选择引用文件：${activeReferenceToken.query}`
                  : "选择要引用的文件"}
              </div>
              <div className="max-h-56 overflow-auto p-1">
                {referenceSuggestions.length > 0 ? (
                  referenceSuggestions.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertFileReference(file)}
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{file.path}</span>
                    </button>
                  ))
                ) : (
                  <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                    没有匹配的文件
                  </div>
                )}
              </div>
            </div>
          )}
          <Textarea
            ref={promptInputRef}
            value={prompt}
            onChange={(event) => {
              setPrompt(event.currentTarget.value);
              setPromptCursor(event.currentTarget.selectionStart);
            }}
            placeholder="输入问题，使用 @文件名 引用工作区文件"
            rows={3}
            className="max-h-40 min-h-24 resize-none border-0 bg-transparent px-4 py-3 text-base shadow-none focus-visible:ring-0"
            onClick={updatePromptCursor}
            onSelect={updatePromptCursor}
            onKeyUp={updatePromptCursor}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs">
                  {chatMode === "collab" ? (
                    <Sparkles className="size-3.5" />
                  ) : chatMode === "agent" ? (
                    <Wrench className="size-3.5" />
                  ) : (
                    <MessageSquare className="size-3.5" />
                  )}
                  <span>{modeLabel}</span>
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-36">
                <DropdownMenuLabel>模式</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={chatMode} onValueChange={(value) => onChatModeChange(value as ChatMode)}>
                  <DropdownMenuRadioItem value="chat">聊天</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="agent">Agent</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="collab" disabled={agentProfiles.length === 0}>
                    协作
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 max-w-48 px-2 text-xs"
                  disabled={isSettingsLoading}
                  title={modelLabel}
                >
                  <span className="truncate">{modelLabel}</span>
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>模型选择</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {agentProfiles.length > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Agent</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      <DropdownMenuRadioGroup
                        value={modelSource === "agent" ? selectedAgent?.id ?? "" : ""}
                        onValueChange={(value) => {
                          onModelSourceChange("agent");
                          onSelectedAgentChange(value);
                        }}
                      >
                        {agentProfiles.map((agent) => (
                          <DropdownMenuRadioItem key={agent.id} value={agent.id}>
                            <span className="truncate">{agent.name}</span>
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>模型</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-52">
                    {providers.length === 0 ? (
                      <DropdownMenuItem disabled>未配置 LLM</DropdownMenuItem>
                    ) : (
                      providers.map((provider) => {
                        const enabledModels = provider.models.filter((model) => model.isEnabled);

                        return (
                          <DropdownMenuSub key={provider.id}>
                            <DropdownMenuSubTrigger>{provider.name}</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="w-56">
                              {enabledModels.length === 0 ? (
                                <DropdownMenuItem disabled>未启用模型</DropdownMenuItem>
                              ) : (
                                <DropdownMenuRadioGroup
                                  value={selectedProviderId === provider.id ? selectedModel?.id ?? "" : ""}
                                  onValueChange={(value) => {
                                    onModelSourceChange("direct");
                                    onProviderChange(provider.id);
                                    onModelChange(value);
                                  }}
                                >
                                  {enabledModels.map((model) => (
                                    <DropdownMenuRadioItem key={model.id} value={model.id}>
                                      <span className="truncate">{model.modelName || model.modelId}</span>
                                    </DropdownMenuRadioItem>
                                  ))}
                                </DropdownMenuRadioGroup>
                              )}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        );
                      })
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {chatMode === "collab" && agentProfiles.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>写作 Agent</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-56">
                        <DropdownMenuRadioGroup value={selectedAgent?.id ?? ""} onValueChange={onSelectedAgentChange}>
                          {agentProfiles.map((agent) => (
                            <DropdownMenuRadioItem key={agent.id} value={agent.id}>
                              <span className="truncate">{agent.name}</span>
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>审查 Agent</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-56">
                        <DropdownMenuRadioGroup value={reviewerAgent?.id ?? ""} onValueChange={onReviewerAgentChange}>
                          {agentProfiles.map((agent) => (
                            <DropdownMenuRadioItem key={agent.id} value={agent.id}>
                              <span className="truncate">{agent.name}</span>
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {chatMode === "agent" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs">
                    <Wrench className="size-3.5" />
                    <span>工具 {allowedAgentTools.length}</span>
                    <ChevronDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuLabel>Agent 工具</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {AGENT_TOOL_DEFINITIONS.map((tool) => (
                    <DropdownMenuCheckboxItem
                      key={tool.name}
                      checked={allowedAgentTools.includes(tool.name)}
                      onCheckedChange={(checked) => onToggleAllowedAgentTool(tool.name, checked)}
                      title={tool.description}
                    >
                      {tool.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <Button
            type="submit"
            size="icon"
            className="size-9 shrink-0 rounded-full"
            disabled={isSending || Boolean(activeAgentTaskId) || !prompt.trim()}
            title={isSending || activeAgentTaskId ? "处理中" : "发送"}
          >
            {isSending || activeAgentTaskId ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            <span className="sr-only">{isSending || activeAgentTaskId ? "处理中" : "发送"}</span>
          </Button>
        </div>
      </form>
    </>
  );
});
ChatComposer.displayName = "ChatComposer";

export const WorkspaceChatPage = ({
  workspace,
  onOpenWorkspace,
}: WorkspaceChatPageProps) => {
  const agentRuntime = useMemo(() => createAgentRuntime(), []);
  const activeAgentTaskIdRef = useRef("");
  const activeAgentMessageIdRef = useRef("");
  const lastAgentErrorRef = useRef("");
  const lastAgentStderrRef = useRef("");
  const handledAgentDoneTaskIdsRef = useRef<Set<string>>(new Set());
  const conversationContextRef = useRef<ChatContextSummary | null>(null);
  const conversationSummarizerRef = useRef<ConversationSummarizer | null>(null);
  const isHydratingSessionRef = useRef(false);
  const saveSessionTimerRef = useRef<number | null>(null);
  const agentBlockCollapseTimersRef = useRef<Map<string, number>>(new Map());
  const chatScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
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

  const updateMessage = useCallback((
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => {
    setMessages((current) =>
      current.map((message) => message.id === messageId ? updater(message) : message),
    );
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
  }, [loadProjects]);

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
    setMessages(session?.messages ?? []);
    setConversation(session?.conversation ?? []);
    setConversationContext(session?.context ?? null);
    setCurrentSessionId(session?.id ?? null);
    setCurrentSessionTitle(session?.title || DEFAULT_SESSION_TITLE);
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
    void loadLlmOptions();
  }, [loadLlmOptions]);

  useEffect(() => {
    void loadWorkspaceSkills();
  }, [loadWorkspaceSkills]);

  useEffect(() => {
    activeAgentTaskIdRef.current = activeAgentTaskId;
  }, [activeAgentTaskId]);

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

    if (messages.length === 0) {
      return;
    }

    const title = deriveSessionTitle(messages);
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
        setConversation((current) => {
          const nextConversation: ConversationMessage[] = [
            ...current,
            {
              role: "assistant",
              content: assistantText || "Agent 任务已完成。",
              timestamp: Date.now(),
            },
          ];
          void updateConversationContext(
            nextConversation,
            conversationContextRef.current,
            conversationSummarizerRef.current ?? undefined,
          ).then((nextContext) => {
            conversationContextRef.current = nextContext;
            setConversationContext(nextContext);
          });
          return nextConversation;
        });
        setActiveAgentTaskId("");
        setPendingAgentQuestion(null);
        activeAgentTaskIdRef.current = "";
        activeAgentMessageIdRef.current = "";
        lastAgentErrorRef.current = "";
        lastAgentStderrRef.current = "";
        void loadFiles();
      }

      if (event.type === "stderr") {
        lastAgentStderrRef.current = event.message;
      }

      if (event.type === "error") {
        lastAgentErrorRef.current = event.message;
        setChatError(event.message);
        updateMessage(messageId, (message) => ({
          ...message,
          text: event.message,
          status: "error",
        }));
        setActiveAgentTaskId("");
        setPendingAgentQuestion(null);
        activeAgentTaskIdRef.current = "";
        activeAgentMessageIdRef.current = "";
      }

      if (event.type === "exit" && !event.success) {
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
        setActiveAgentTaskId("");
        setPendingAgentQuestion(null);
        activeAgentTaskIdRef.current = "";
        activeAgentMessageIdRef.current = "";
        lastAgentErrorRef.current = "";
        lastAgentStderrRef.current = "";
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
  }, [agentRuntime, loadFiles, updateMessage]);

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
  const enabledSkills = useMemo(() => {
    const names = new Set(enabledSkillNames);
    return skills.filter((skill) => names.has(skill.name));
  }, [enabledSkillNames, skills]);
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

    if (chatMode !== "collab" && (!effectiveProvider || !effectiveModel)) {
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
    const assistantMessageId = createMessageId();
    const userMessage: ConversationMessage = {
      role: "user",
      content: text,
      timestamp: now,
    };
    const nextConversation = [...conversation, userMessage];
    const userUiMessage: ChatMessage = {
      id: createMessageId(),
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

    setMessages((current) => [...current, userUiMessage, assistantUiMessage]);
    setConversation(nextConversation);
    setIsSending(true);
    setChatError("");

    try {
      const summaryProvider = chatMode === "collab" && selectedAgent
        ? selectedAgent.provider
        : effectiveProvider;
      const summaryModel = chatMode === "collab" && selectedAgent
        ? selectedAgent.model
        : effectiveModel;
      const summarizeConversation = summaryProvider && summaryModel
        ? createConversationSummarizer(summaryProvider, summaryModel)
        : undefined;
      conversationSummarizerRef.current = summarizeConversation ?? null;
      const nextConversationContext = await updateConversationContext(
        nextConversation,
        conversationContext,
        summarizeConversation,
      );
      const runtimeMessages = buildRuntimeConversationMessages(
        nextConversation,
        nextConversationContext,
      );
      setConversationContext(nextConversationContext);
      conversationContextRef.current = nextConversationContext;

      if (chatMode === "collab" && selectedAgent && reviewerAgent) {
        setCollaborationPhase("drafting");
        const draftResult = await runAgentRuntimeChat({
          provider: selectedAgent.provider,
          model: selectedAgent.model,
          stream: false,
          systemPrompt: buildCollaborationSystemPrompt(
            workspace,
            activeFile,
            referencedFiles,
            enabledSkills,
            selectedAgent,
            "draft",
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
          provider: reviewerAgent.provider,
          model: reviewerAgent.model,
          stream: false,
          systemPrompt: buildCollaborationSystemPrompt(
            workspace,
            activeFile,
            referencedFiles,
            enabledSkills,
            reviewerAgent,
            "review",
          ),
          messages: buildRuntimeConversationMessages([
            ...nextConversation,
            {
              role: "assistant",
              content: draftText,
              timestamp: Date.now(),
            },
          ], nextConversationContext),
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
          provider: selectedAgent.provider,
          model: selectedAgent.model,
          stream: false,
          systemPrompt: buildCollaborationSystemPrompt(
            workspace,
            activeFile,
            referencedFiles,
            enabledSkills,
            selectedAgent,
            "revise",
          ),
          messages: buildRuntimeConversationMessages([
            ...nextConversation,
            {
              role: "assistant",
              content: draftText,
              timestamp: Date.now(),
            },
            {
              role: "user",
              content: `这是审查 Agent 的意见，请据此修订并输出最终版本：\n\n${reviewText}`,
              timestamp: Date.now(),
            },
          ], nextConversationContext),
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
            role: "assistant",
            content: collaborationText,
            timestamp: Date.now(),
          },
        ];
        setConversation(finalConversation);
        const finalContext = await updateConversationContext(
          finalConversation,
          conversationContextRef.current,
          summarizeConversation,
        );
        conversationContextRef.current = finalContext;
        setConversationContext(finalContext);
        setCollaborationPhase("idle");
        return;
      }

      if (!effectiveProvider || !effectiveModel) {
        setChatError("请选择要使用的 LLM 和模型");
        return;
      }

      if (chatMode === "agent") {
        activeAgentMessageIdRef.current = assistantMessageId;
        lastAgentErrorRef.current = "";
        lastAgentStderrRef.current = "";
        const task = await agentRuntime.run({
          type: "agent",
          workspacePath: workspace.path,
          prompt: buildAgentPrompt(
            text,
            referencedFiles,
            buildRuntimeConversationContext(conversation, nextConversationContext),
            modelSource === "agent" ? selectedAgent : null,
          ),
          provider: toAgentRuntimeProviderConfig(effectiveProvider),
          model: toAgentRuntimeModelConfig(effectiveProvider, effectiveModel),
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
        provider: effectiveProvider,
        model: effectiveModel,
        systemPrompt: buildSystemPrompt(
          workspace,
          activeFile,
          referencedFiles,
          enabledSkills,
          modelSource === "agent" ? selectedAgent : null,
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
          role: "assistant",
          content: assistantText,
          timestamp: Date.now(),
        },
      ];
      setConversation(finalConversation);
      const finalContext = await updateConversationContext(
        finalConversation,
        conversationContextRef.current,
        summarizeConversation,
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

  const renderFileTreeNode = (node: FileTreeNode, depth: number): ReactNode => {
    const isExpanded = expandedFileTreePaths.has(node.path);
    const paddingLeft = `${0.5 + depth * 0.85}rem`;

    if (node.isDirectory) {
      return (
        <div key={node.path}>
          <button
            type="button"
            className="flex h-8 w-full items-center gap-1.5 rounded-md border border-transparent pr-2 text-left text-sm transition-colors hover:border-sidebar-border hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
            style={{ paddingLeft }}
            onClick={() => toggleFileTreeDirectory(node.path)}
          >
            <ChevronRight
              className={[
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                isExpanded ? "rotate-90" : "",
              ].join(" ")}
            />
            {isExpanded ? (
              <FolderOpen className="size-4 shrink-0 text-sidebar-primary" />
            ) : (
              <Folder className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
            {node.children.length > 0 && (
              <span className="rounded-sm bg-sidebar-accent px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {node.children.length}
              </span>
            )}
          </button>
          {isExpanded && node.children.length > 0 && (
            <div className="space-y-0.5">
              {node.children.map((child) => renderFileTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={node.path}
        type="button"
        className="flex h-8 w-full items-center gap-2 rounded-md border border-transparent pr-2 text-left text-sm transition-colors hover:border-sidebar-border hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none data-[active=true]:border-primary/25 data-[active=true]:bg-card"
        style={{ paddingLeft: `${1.55 + depth * 0.85}rem` }}
        data-active={node.path === activeFile?.path}
        onClick={() => void openFile(node.path)}
      >
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      </button>
    );
  };

  const filePanel = (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-card/70 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-md border border-primary/15 bg-accent text-primary">
            <FileText className="size-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">文件查看</h3>
            <p className="truncate text-xs text-muted-foreground">
              {filePath || "选择或新建一个文件"}
            </p>
          </div>
        </div>
        {isMarkdownFile && (
          <div className="flex h-9 rounded-md border border-input bg-muted/60 p-0.5 shadow-xs">
            <Button
              type="button"
              size="sm"
              variant={fileViewMode === "source" ? "secondary" : "ghost"}
              className="h-7 px-2"
              onClick={() => setFileViewMode("source")}
            >
              <FileType className="size-3.5" />
              <span>原文</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant={fileViewMode === "preview" ? "secondary" : "ghost"}
              className="h-7 px-2"
              onClick={() => setFileViewMode("preview")}
            >
              <Eye className="size-3.5" />
              <span>预览</span>
            </Button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-5">
        <Input
          value={filePath}
          onChange={(event) => setFilePath(event.currentTarget.value)}
          placeholder="例如：chapters/01.md"
        />
        {isMarkdownFile && fileViewMode === "preview" ? (
          <ScrollArea className="h-full min-h-0 flex-1 overflow-hidden rounded-md border border-input bg-card shadow-xs">
            <div className="mx-auto w-full max-w-4xl p-6">
              {fileContent.trim() ? (
                <MarkdownContent content={fileContent} />
              ) : (
                <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
                  暂无可预览内容
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <Textarea
            value={fileContent}
            onChange={(event) => setFileContent(event.currentTarget.value)}
            placeholder="选择文件或输入新文件内容"
            className="min-h-0 flex-1 resize-none overflow-auto bg-card font-mono text-sm leading-6 shadow-xs"
          />
        )}
        {fileError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {fileError}
          </div>
        )}
      </div>

      <div className="flex justify-end border-t border-border/80 bg-card/80 px-5 py-3">
        <Button
          type="button"
          onClick={() => void saveFile()}
          disabled={isFileSaving || !filePath.trim()}
        >
          {isFileSaving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          <span>{activeFile ? "保存修改" : "创建文件"}</span>
        </Button>
      </div>
    </section>
  );

  const chatPanel = (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <ScrollArea ref={chatScrollAreaRef} className="h-full min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-6">
          {messages.length === 0 ? (
            <div className="flex min-h-[44vh] flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="space-y-2">
                <h3 className="text-2xl font-semibold">
                  我们应该在 {workspace.name} 中构建什么？
                </h3>
                <p className="text-sm text-muted-foreground">
                  选择左侧会话继续，或者直接开始一个新的工作区任务。
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const thinking = message.thinking?.trim();
              const isThinkingCollapsed =
                Boolean(thinking) &&
                message.status === "done" &&
                !expandedThinkingIds.has(message.id);
              const agentEvents = message.agentEvents?.filter(isTimelineEvent) ?? [];
              const agentEventGroups = groupAgentEvents(agentEvents);
              const isAgentEventsCollapsed =
                message.status === "done" && !expandedAgentEventIds.has(message.id);
              const visibleAgentEventGroups =
                message.status === "done" || expandedAgentEventIds.has(message.id)
                  ? agentEventGroups
                  : agentEventGroups.slice(-5);
              const hiddenAgentEventGroupCount =
                agentEventGroups.length - visibleAgentEventGroups.length;
              const agentErrorCount = agentEventGroups.filter((group) => group.status === "error").length;
              const isAssistantLoading =
                message.role === "assistant" &&
                (message.status === "loading" || message.status === "streaming") &&
                !message.text.trim();
              const messageAgentAvatar = resolveAgentAvatar(
                message.agentAvatar ?? (modelSource === "agent" ? selectedAgent?.avatar : null),
              );
              const agentBlocks = message.agentBlocks ?? [];
              const hasAgentBlocks =
                message.role === "assistant" &&
                message.mode === "agent" &&
                agentBlocks.length > 0;

              return (
                <div
                  key={message.id}
                  className="flex gap-3 data-[role=user]:justify-end"
                  data-role={message.role}
                >
                  {message.role === "assistant" && (
                    <div
                      className="mt-1 flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-primary/15 bg-accent text-primary shadow-xs"
                      title={message.agentName}
                    >
                      {message.mode === "agent" || message.agentAvatar ? (
                        <img
                          src={messageAgentAvatar.src}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <Bot className="size-4" />
                      )}
                    </div>
                  )}
                  <div
                    className="max-w-[78%] rounded-md border px-3.5 py-2.5 text-sm leading-6 shadow-xs data-[role=assistant]:border-border/80 data-[role=assistant]:bg-card data-[role=user]:border-primary data-[role=user]:bg-primary data-[role=user]:text-primary-foreground"
                    data-role={message.role}
                  >
                    {message.role === "assistant" && !hasAgentBlocks && thinking && (
                      <div className="mb-2 overflow-hidden rounded-md border border-border/70 bg-muted/35">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                          onClick={() => toggleThinking(message.id)}
                        >
                          {isThinkingCollapsed ? (
                            <ChevronRight className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )}
                          <Brain className="size-3.5" />
                          <span>Thinking</span>
                          {message.status !== "done" && (
                            <Loader2 className="ml-auto size-3 animate-spin" />
                          )}
                        </button>
                        {!isThinkingCollapsed && (
                          <div className="max-h-48 overflow-auto border-t border-border/60 px-2.5 py-2 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
                            {thinking}
                          </div>
                        )}
                      </div>
                    )}

                    {message.role === "assistant" && !hasAgentBlocks && agentEventGroups.length > 0 && (
                      <div className="mb-2 overflow-hidden rounded-md border border-border/70 bg-muted/35">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                          onClick={() => toggleAgentEvents(message.id)}
                        >
                          {isAgentEventsCollapsed ? (
                            <ChevronRight className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )}
                          <Wrench className="size-3.5" />
                          <span>Agent 执行</span>
                          <span className="rounded-sm bg-background px-1.5 py-0.5 text-[11px]">
                            {agentEventGroups.length} 段
                          </span>
                          {agentErrorCount > 0 && (
                            <span className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">
                              {agentErrorCount} 个错误
                            </span>
                          )}
                          {(message.status === "loading" || message.status === "streaming") && (
                            <Loader2 className="ml-auto size-3 animate-spin" />
                          )}
                        </button>
                        {!isAgentEventsCollapsed && (
                          <div className="max-h-72 space-y-1.5 overflow-auto border-t border-border/60 px-2.5 py-2">
                            {hiddenAgentEventGroupCount > 0 && (
                              <div className="rounded-sm border border-dashed border-border/70 bg-background/60 px-2 py-1 text-xs text-muted-foreground">
                                已折叠较早的 {hiddenAgentEventGroupCount} 段执行过程，当前显示最近阶段。
                              </div>
                            )}
                            {visibleAgentEventGroups.map((group) => {
                              const latestEvent = group.events[group.events.length - 1];
                              const statusLabel =
                                group.status === "running"
                                  ? "执行中"
                                  : group.status === "done"
                                    ? "完成"
                                    : group.status === "error"
                                      ? "异常"
                                      : "信息";

                              return (
                                <details
                                  key={`${message.id}-${group.id}`}
                                  className="group rounded-sm border border-border/60 bg-background"
                                  open={group.status === "running" || group.status === "error"}
                                >
                                  <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                                    <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
                                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                                      {group.title}
                                    </span>
                                    <span
                                      className={[
                                        "rounded-sm px-1.5 py-0.5 text-[11px]",
                                        group.status === "error"
                                          ? "bg-destructive/10 text-destructive"
                                          : group.status === "running"
                                            ? "bg-primary/10 text-primary"
                                            : "bg-muted text-muted-foreground",
                                      ].join(" ")}
                                    >
                                      {statusLabel}
                                    </span>
                                    <span className="text-[11px]">
                                      {group.events.length} 条
                                    </span>
                                  </summary>
                                  <div className="space-y-1 border-t border-border/50 px-2 py-1.5 text-xs leading-5 text-muted-foreground">
                                    {group.events.slice(-8).map((event, index) => (
                                      <div
                                        key={`${message.id}-${group.id}-${event.type}-${index}`}
                                        className="whitespace-pre-wrap break-words rounded-sm bg-muted/45 px-2 py-1"
                                      >
                                        {describeAgentGroupEvent(event)}
                                      </div>
                                    ))}
                                    {group.events.length > 8 && (
                                      <div className="rounded-sm bg-muted/35 px-2 py-1 text-[11px]">
                                        已省略本段较早的 {group.events.length - 8} 条更新。
                                      </div>
                                    )}
                                  </div>
                                  {latestEvent?.type === "tool_end" && latestEvent.isError && (
                                    <div className="border-t border-border/50 px-2 py-1 text-[11px] text-destructive">
                                      工具执行失败，请展开查看最后几条输出。
                                    </div>
                                  )}
                                </details>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {hasAgentBlocks ? (
                      <div className="space-y-2">
                        {agentBlocks.map((block) => {
                          if (block.type === "thinking") {
                            const isCollapsed = Boolean(block.isCollapsed);

                            return (
                              <div
                                key={block.id}
                                className="overflow-hidden rounded-md border border-border/70 bg-muted/35"
                              >
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                                  onClick={() => toggleAgentThinkingBlock(message.id, block.id)}
                                >
                                  {isCollapsed ? (
                                    <ChevronRight className="size-3.5" />
                                  ) : (
                                    <ChevronDown className="size-3.5" />
                                  )}
                                  <Brain className="size-3.5" />
                                  <span>Thinking</span>
                                  {message.status !== "done" && agentBlocks.at(-1)?.id === block.id && (
                                    <Loader2 className="ml-auto size-3 animate-spin" />
                                  )}
                                </button>
                                <div
                                  className={[
                                    "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                                    isCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
                                  ].join(" ")}
                                >
                                  <div className="min-h-0 overflow-hidden">
                                    <div
                                      className="max-h-48 overflow-auto border-t border-border/60 px-2.5 py-2 text-xs leading-5 whitespace-pre-wrap text-muted-foreground"
                                      data-agent-thinking-content="true"
                                    >
                                      {block.content.trim() || "正在思考..."}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          if (block.type === "tool") {
                            const latestEvent = block.events[block.events.length - 1];
                            const isCollapsed = Boolean(block.isCollapsed);
                            const statusLabel =
                              block.status === "running"
                                ? "执行中"
                                : block.status === "done"
                                  ? "完成"
                                  : "异常";

                            return (
                              <div
                                key={block.id}
                                className="overflow-hidden rounded-md border border-border/70 bg-muted/35"
                              >
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => toggleAgentBlock(message.id, block.id)}
                                >
                                  <ChevronRight
                                    className={[
                                      "size-3 transition-transform",
                                      isCollapsed ? "" : "rotate-90",
                                    ].join(" ")}
                                  />
                                  <Wrench className="size-3.5" />
                                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                                    {block.toolName}
                                  </span>
                                  <span
                                    className={[
                                      "rounded-sm px-1.5 py-0.5 text-[11px]",
                                      block.status === "error"
                                        ? "bg-destructive/10 text-destructive"
                                        : block.status === "running"
                                          ? "bg-primary/10 text-primary"
                                          : "bg-background text-muted-foreground",
                                    ].join(" ")}
                                  >
                                    {statusLabel}
                                  </span>
                                  <span className="text-[11px]">
                                    {block.events.length} 条
                                  </span>
                                </button>
                                <div
                                  className={[
                                    "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                                    isCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
                                  ].join(" ")}
                                >
                                  <div className="min-h-0 overflow-hidden">
                                    <div className="space-y-1 border-t border-border/50 px-2.5 py-2 text-xs leading-5 text-muted-foreground">
                                      {block.events.slice(-8).map((event, index) => (
                                        <div
                                          key={`${block.id}-${event.type}-${index}`}
                                          className="whitespace-pre-wrap break-words rounded-sm bg-background/70 px-2 py-1"
                                        >
                                          {describeAgentGroupEvent(event)}
                                        </div>
                                      ))}
                                      {block.events.length > 8 && (
                                        <div className="rounded-sm bg-background/60 px-2 py-1 text-[11px]">
                                          已省略本段较早的 {block.events.length - 8} 条更新。
                                        </div>
                                      )}
                                    </div>
                                    {latestEvent?.type === "tool_end" && latestEvent.isError && (
                                      <div className="border-t border-border/50 px-2.5 py-1 text-[11px] text-destructive">
                                        工具执行失败，请展开查看最后几条输出。
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {isCollapsed && latestEvent?.type === "tool_end" && latestEvent.isError && (
                                  <div className="border-t border-border/50 px-2.5 py-1 text-[11px] text-destructive">
                                    工具执行失败
                                  </div>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div key={block.id} className="agent-response-block">
                              <MarkdownContent content={block.content} />
                            </div>
                          );
                        })}
                      </div>
                    ) : isAssistantLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        <span>
                          {message.mode === "collab"
                            ? "Agent 正在协作"
                            : message.mode === "agent" ? "Agent 正在处理" : "AI 正在思考"}
                        </span>
                      </div>
                      ) : (
                        message.role === "assistant" ? (
                          <MarkdownContent content={message.text} />
                        ) : (
                          <div className="space-y-2">
                            {message.referencedFiles && message.referencedFiles.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {message.referencedFiles.map((file) => (
                                  <span
                                    key={file.path}
                                    className="inline-flex max-w-full items-center gap-1 rounded-sm bg-primary-foreground/15 px-1.5 py-0.5 text-xs"
                                  >
                                    <Link className="size-3" />
                                    <span className="truncate">{file.path}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="whitespace-pre-wrap">
                              {message.text}
                            </div>
                          </div>
                        )
                      )}
                  </div>
                  {message.role === "user" && (
                    <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-xs">
                      <User className="size-4" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border/80 bg-card/80 px-6 py-4 backdrop-blur">
        {(chatError || settingsError || skillsError || sessionsError) && (
          <div className="mx-auto mb-3 max-w-5xl rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {chatError || settingsError || skillsError || sessionsError}
          </div>
        )}
        {pendingAgentQuestion && (
          <form
            action="#"
            className="mx-auto mb-3 max-w-5xl rounded-md border border-primary/25 bg-primary/10 p-3 shadow-xs"
            onSubmit={(event) => void answerAgentQuestion(event)}
          >
            <div className="mb-2 flex items-start gap-2">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-background text-primary">
                <MessageSquare className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">
                  {pendingAgentQuestion.input?.label || "Agent 需要你的回答"}
                </div>
                {pendingAgentQuestion.context && (
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    {pendingAgentQuestion.context}
                  </div>
                )}
                <div className="mt-1 whitespace-pre-wrap text-sm leading-6">
                  {pendingAgentQuestion.question}
                </div>
              </div>
            </div>
            {pendingAgentQuestion.input?.type === "select" &&
            (pendingAgentQuestion.input.options?.length ?? 0) > 0 ? (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  {(pendingAgentQuestion.input.options ?? []).map((option) => {
                    const isSelected = agentQuestionAnswer === option.value;
                    const isOther = option.value === "other";

                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={[
                          "rounded-md border bg-background px-3 py-2 text-left text-sm shadow-xs transition-colors hover:border-primary/45 hover:bg-primary/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                          isSelected ? "border-primary bg-primary/10 text-primary" : "border-border",
                        ].join(" ")}
                        disabled={isAnsweringAgentQuestion}
                        onClick={() => {
                          setAgentQuestionAnswer(option.value);
                          if (!isOther) {
                            void submitAgentQuestionAnswer(option.value);
                          }
                        }}
                      >
                        <span className="block font-medium">{option.label}</span>
                        {option.description && (
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                            {option.description}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {agentQuestionAnswer === "other" && (
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={customAgentQuestionAnswer}
                      onChange={(event) => setCustomAgentQuestionAnswer(event.currentTarget.value)}
                      placeholder="请输入自定义答案"
                      rows={2}
                      className="min-h-14 flex-1 resize-none bg-background shadow-xs"
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                    />
                    <Button
                      type="submit"
                      disabled={isAnsweringAgentQuestion || !customAgentQuestionAnswer.trim()}
                    >
                      {isAnsweringAgentQuestion ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      <span>回复</span>
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <Textarea
                  value={agentQuestionAnswer}
                  onChange={(event) => setAgentQuestionAnswer(event.currentTarget.value)}
                  placeholder="直接回答这个问题，Agent 会继续执行"
                  rows={2}
                  className="min-h-14 flex-1 resize-none bg-background shadow-xs"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <Button
                  type="submit"
                  disabled={isAnsweringAgentQuestion || !agentQuestionAnswer.trim()}
                >
                  {isAnsweringAgentQuestion ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  <span>回复</span>
                </Button>
              </div>
            )}
          </form>
        )}
        <ChatComposer
          files={files}
          resetKey={composerResetKey}
          isSending={isSending}
          activeAgentTaskId={activeAgentTaskId}
          isSettingsLoading={isSettingsLoading}
          chatMode={chatMode}
          modelSource={modelSource}
          agentProfiles={agentProfiles}
          providers={providers}
          selectedProviderId={selectedProviderId}
          selectedModel={selectedModel}
          selectedAgent={selectedAgent}
          reviewerAgent={reviewerAgent}
          allowedAgentTools={allowedAgentTools}
          onChatModeChange={setChatMode}
          onModelSourceChange={setModelSource}
          onSelectedAgentChange={setSelectedAgentId}
          onReviewerAgentChange={setSelectedReviewerAgentId}
          onProviderChange={(providerId) => {
            const provider = providers.find((item) => item.id === providerId);
            setSelectedProviderId(providerId);
            setSelectedModelId(provider?.models.find((model) => model.isEnabled)?.id ?? "");
          }}
          onModelChange={setSelectedModelId}
          onToggleAllowedAgentTool={toggleAllowedAgentTool}
          onSubmit={(input) => void sendMessage(input)}
        />
      </div>
    </section>
  );

  const settingsPanel = (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex min-h-14 items-center justify-between border-b border-border/80 bg-card/80 px-5 py-3 backdrop-blur">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">设置</h2>
          <p className="truncate text-xs text-muted-foreground">
            配置模型 Provider、可用模型，以及工作区中可复用的 Agent。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setWorkspaceView("chat")}
        >
          <MessageSquare className="size-4" />
          <span>返回应用</span>
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          <div className="mb-7 space-y-2">
            <h3 className="text-2xl font-semibold">应用设置</h3>
            <p className="max-w-2xl text-sm text-muted-foreground">
              设置会影响所有工作区中的模型选择、Agent 配置和运行方式。
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            className="rounded-md border border-border/80 bg-card p-4 text-left shadow-xs transition-colors hover:border-primary/30 hover:bg-accent/35 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            onClick={() => setIsLlmSettingsOpen(true)}
          >
            <span className="mb-4 flex size-10 items-center justify-center rounded-md border border-primary/15 bg-accent text-primary">
              <Settings className="size-5" />
            </span>
            <span className="block text-base font-semibold">LLM 设置</span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              管理 Provider、API Key、Base URL 和启用模型。
            </span>
          </button>

          <button
            type="button"
            className="rounded-md border border-border/80 bg-card p-4 text-left shadow-xs transition-colors hover:border-primary/30 hover:bg-accent/35 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            onClick={() => setIsAgentSettingsOpen(true)}
          >
            <span className="mb-4 flex size-10 items-center justify-center rounded-md border border-primary/15 bg-accent text-primary">
              <Bot className="size-5" />
            </span>
            <span className="block text-base font-semibold">Agent 设置</span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              创建和维护 Agent，并绑定已配置的模型。
            </span>
          </button>
          </div>

          {(settingsError || skillsError) && (
            <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {settingsError || skillsError}
            </div>
          )}
        </div>
      </ScrollArea>
    </section>
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
      <aside className="hidden w-[288px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="border-b border-sidebar-border px-4 py-4">
          <h1 className="truncate text-sm font-semibold">Novel Claw</h1>
        </div>

        <div className="space-y-1 border-b border-sidebar-border p-3">
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-full justify-start px-2"
            onClick={startNewSession}
          >
            <Plus className="size-4" />
            <span>新对话</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-full justify-start px-2"
            title="搜索"
          >
            <Search className="size-4" />
            <span>搜索</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-full justify-start px-2"
            title="工作区 Skills"
            onClick={() => setIsSkillsDialogOpen(true)}
          >
            <Plug className="size-4" />
            <span>插件</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-full justify-start px-2"
            title="刷新 LLM 与 Agent 配置"
            onClick={() => void loadLlmOptions()}
          >
            <RefreshCw className="size-4" />
            <span>刷新配置</span>
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-3 py-3">
            <section className="space-y-3">
              <div className="flex items-center justify-between px-1 text-sm font-medium text-muted-foreground">
                <span>项目</span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="刷新项目"
                    disabled={isProjectsLoading}
                    className="size-6"
                    onClick={() => void loadProjects()}
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                </div>
              </div>
              <div className="space-y-5">
                {projectsError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                    {projectsError}
                  </div>
                )}
                {isProjectsLoading ? (
                  <div className="rounded-md px-2 py-8 text-center text-sm text-muted-foreground">
                    正在读取项目
                  </div>
                ) : sidebarWorkspaces.length ? (
                  sidebarWorkspaces.map((item) => (
                    <div key={item.id} className="space-y-1.5">
                      <button
                        type="button"
                        className="group/project flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none data-[active=true]:text-sidebar-foreground"
                        data-active={item.id === workspace.id}
                        onClick={() => onOpenWorkspace(item)}
                        title={item.path}
                      >
                        <Folder className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-base font-medium">
                          {item.name}
                        </span>
                      </button>
                      {item.id === workspace.id && (
                        <div className="space-y-1">
                          {messages.length > 0 && !currentSessionId && (
                            <div className="mx-1 flex h-9 items-center rounded-md bg-sidebar-accent px-8 text-sm">
                              <span className="min-w-0 flex-1 truncate font-semibold">
                                {currentSessionTitle}
                              </span>
                              <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                                保存中
                              </span>
                            </div>
                          )}
                          {isSessionsLoading ? (
                            <div className="px-8 py-3 text-sm text-muted-foreground">
                              正在读取聊天记录
                            </div>
                          ) : chatSessions.length ? (
                            <>
                              {visibleSidebarSessions.map((session) => (
                                <div
                                  key={session.id}
                                  className="group/session relative flex h-9 items-center rounded-md transition-colors hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent"
                                  data-active={session.id === currentSessionId}
                                >
                                  <button
                                    type="button"
                                    className="min-w-0 flex-1 py-1 pl-8 pr-2 text-left focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
                                    onClick={() => void loadSessionById(session.id)}
                                    title={session.title}
                                  >
                                    <div className="truncate text-sm font-semibold leading-5 text-sidebar-foreground">
                                      {session.title}
                                    </div>
                                  </button>
                                  <span className="mr-2 shrink-0 text-xs tabular-nums text-muted-foreground">
                                    {formatSessionTime(session.updatedAt)}
                                  </span>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    title="永久删除聊天"
                                    className="mr-1 size-7 opacity-0 hover:text-destructive group-hover/session:opacity-100 group-data-[active=true]/session:opacity-80"
                                    onClick={() => void removeSession(session.id)}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              ))}
                              {chatSessions.length > 5 && (
                                <button
                                  type="button"
                                  className="h-8 px-8 text-left text-sm font-medium text-muted-foreground hover:text-sidebar-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
                                  onClick={() => setShowAllSessions((current) => !current)}
                                >
                                  {showAllSessions ? "收起显示" : "展开显示"}
                                </button>
                              )}
                            </>
                          ) : (
                            <div className="px-8 py-3 text-sm text-muted-foreground">
                              暂无聊天记录
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-md px-2 py-8 text-center text-sm text-muted-foreground">
                    暂无项目
                  </div>
                )}
              </div>
            </section>
          </div>
        </ScrollArea>

        <div className="border-t border-sidebar-border p-3">
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-full justify-start px-2"
            title="设置"
            onClick={() => setWorkspaceView("settings")}
          >
            <Settings className="size-4" />
            <span>设置</span>
          </Button>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-background">
        {workspaceView !== "settings" && (
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-card/80 px-4 py-3 backdrop-blur lg:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md border border-primary/15 bg-accent text-primary">
              {workspaceView === "file" ? (
                <FileText className="size-4" />
              ) : workspaceView === "split" ? (
                <Columns3 className="size-4" />
              ) : (
                <MessageSquare className="size-4" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold">
                {workspaceView === "file"
                  ? "文件工作台"
                  : workspaceView === "split"
                    ? "拆分工作台"
                    : "AI 工作台"}
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {currentSessionTitle !== DEFAULT_SESSION_TITLE
                  ? `${currentSessionTitle} · `
                  : ""}
                {modelSource === "agent" && selectedAgent
                  ? `当前 Agent：${selectedAgent.name} / ${effectiveProvider?.name ?? "未选择"} / ${effectiveModel?.modelName ?? "未选择"}`
                  : `当前模型：${effectiveProvider?.name ?? "未选择"} / ${effectiveModel?.modelName ?? "未选择"}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <div className="flex h-9 rounded-md border border-input bg-muted/60 p-0.5 shadow-xs">
              <Button
                type="button"
                size="sm"
                variant={workspaceView === "chat" ? "secondary" : "ghost"}
                className="h-7 px-2"
                onClick={() => setWorkspaceView("chat")}
              >
                <MessageSquare className="size-3.5" />
                <span>聊天</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={workspaceView === "file" ? "secondary" : "ghost"}
                className="h-7 px-2"
                onClick={() => setWorkspaceView("file")}
              >
                <FileText className="size-3.5" />
                <span>文件</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={workspaceView === "split" ? "secondary" : "ghost"}
                className="h-7 px-2"
                onClick={() => setWorkspaceView("split")}
              >
                <Columns3 className="size-3.5" />
                <span>拆分</span>
              </Button>
            </div>

            <Button
              type="button"
              size="icon"
              variant={isContextPanelOpen ? "secondary" : "ghost"}
              title={isContextPanelOpen ? "收起右侧上下文" : "展开右侧上下文"}
              onClick={() => setIsContextPanelOpen((current) => !current)}
            >
              {isContextPanelOpen ? (
                <PanelRightClose className="size-4" />
              ) : (
                <PanelRightOpen className="size-4" />
              )}
            </Button>

            {workspaceView !== "file" && activeAgentTaskId && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void agentRuntime.abortTask(activeAgentTaskId)}
              >
                停止
              </Button>
            )}
          </div>
        </header>
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
          <aside className="hidden w-[360px] shrink-0 flex-col border-l border-border/80 bg-sidebar text-sidebar-foreground xl:flex">
            <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Folder className="size-4" />
                <span>上下文</span>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="刷新文件"
                  onClick={() => void loadFiles()}
                >
                  <RefreshCw className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="新建文件"
                  onClick={prepareNewFile}
                >
                  <Plus className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="收起右侧上下文"
                  onClick={() => setIsContextPanelOpen(false)}
                >
                  <PanelRightClose className="size-4" />
                </Button>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-4 p-3">
                <section className="space-y-2">
                  <div className="flex items-center justify-between px-1 text-xs font-medium text-muted-foreground">
                    <span>文件</span>
                    <span>{selectableFiles.length} 个</span>
                  </div>
                  <div className="space-y-0.5">
                    {isFilesLoading ? (
                      <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                        正在读取文件
                      </div>
                    ) : selectableFiles.length ? (
                      fileTree.map((node) => renderFileTreeNode(node, 0))
                    ) : (
                      <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                        暂无可编辑文件
                      </div>
                    )}
                  </div>
                </section>

                <section className="space-y-2">
                  <div className="px-1 text-xs font-medium text-muted-foreground">
                    文件预览
                  </div>
                  <div className="overflow-hidden rounded-md border border-sidebar-border bg-card text-card-foreground">
                    <div className="border-b border-border/70 px-3 py-2 text-xs">
                      <div className="truncate font-medium">
                        {activeFile?.path ?? "未选择文件"}
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {activeFile
                          ? `${fileContent.length.toLocaleString()} 字符`
                          : "从文件树选择文件后在这里预览。"}
                      </div>
                    </div>
                    <ScrollArea className="h-72">
                      <div className="p-3">
                        {activeFile ? (
                          isMarkdownFile ? (
                            fileContent.trim() ? (
                              <div className="text-sm leading-6">
                                <MarkdownContent content={fileContent} />
                              </div>
                            ) : (
                              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                                暂无可预览内容
                              </div>
                            )
                          ) : (
                            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-muted-foreground">
                              {fileContent || "暂无内容"}
                            </pre>
                          )
                        ) : (
                          <div className="flex h-48 items-center justify-center text-center text-sm text-muted-foreground">
                            选择左侧文件树中的文件进行预览。
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                    {activeFile && (
                      <div className="flex justify-end border-t border-border/70 px-3 py-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setWorkspaceView("file")}
                        >
                          <FileText className="size-3.5" />
                          <span>编辑</span>
                        </Button>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </ScrollArea>

            {chatMode === "collab" && (
              <CollaborationStatusPanel
                writerAgent={selectedAgent}
                reviewerAgent={reviewerAgent}
                phase={collaborationPhase}
              />
            )}
          </aside>
          )}
        </div>
      </section>
    </main>
  );
};
