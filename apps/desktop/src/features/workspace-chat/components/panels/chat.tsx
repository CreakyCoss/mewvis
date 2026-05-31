import { useRef, useState, type Dispatch, type FormEvent, type RefObject, type SetStateAction } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  Link,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import type { AgentRuntimeAgentDefinition, AgentToolName } from "@/agent-runtime/contracts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { AgentProfile } from "@/features/agent-settings/types";
import type { LlmProvider, ProviderModel } from "@/features/llm-settings/types";
import { isDefaultWorkspace } from "@/features/workspaces/default-workspace";
import type { Workspace } from "@/features/workspaces/types";
import type {
  ChatMode,
  ComposerSubmitInput,
  ContextWindowPreset,
  ModelSource,
  PendingAgentQuestion,
} from "../../page-types";
import type { ChatMessage, WorkspaceFileEntry } from "../../types";
import {
  describeAgentGroupEvent,
  groupAgentEvents,
  isTimelineEvent,
} from "../../utils/agent-blocks";
import { Composer } from "../composer";
import { MarkdownContent } from "../markdown-content";

type ChatPanelProps = {
  chatScrollAreaRef: RefObject<HTMLDivElement | null>;
  workspace: Workspace;
  workspaces: Workspace[];
  messages: ChatMessage[];
  expandedThinkingIds: Set<string>;
  expandedAgentEventIds: Set<string>;
  modelSource: ModelSource;
  selectedAgent: AgentProfile | null;
  chatError: string;
  settingsError: string;
  skillsError: string;
  sessionsError: string;
  pendingAgentQuestion: PendingAgentQuestion | null;
  agentQuestionAnswer: string;
  customAgentQuestionAnswer: string;
  isAnsweringAgentQuestion: boolean;
  files: WorkspaceFileEntry[];
  composerResetKey: number;
  isSending: boolean;
  activeAgentTaskId: string;
  isSettingsLoading: boolean;
  chatMode: ChatMode;
  contextWindowPreset: ContextWindowPreset;
  availableRuntimeAgents: readonly AgentRuntimeAgentDefinition[];
  selectedRuntimeAgent: AgentRuntimeAgentDefinition | null;
  runtimeAgentId: string;
  agentProfiles: AgentProfile[];
  providers: LlmProvider[];
  selectedProviderId: string;
  selectedModel: ProviderModel | null;
  reviewerAgent: AgentProfile | null;
  allowedAgentTools: AgentToolName[];
  toggleThinking: (messageId: string) => void;
  toggleAgentEvents: (messageId: string) => void;
  toggleAgentThinkingBlock: (messageId: string, blockId: string) => void;
  toggleAgentBlock: (messageId: string, blockId: string) => void;
  onEditHistoryMessage: (messageId: string, nextText: string) => void;
  onDeleteHistoryMessage: (messageId: string) => void;
  onMoveHistoryMessage: (messageId: string, direction: "up" | "down") => void;
  onOpenWorkspace: (workspace: Workspace) => void;
  onCreateWorkspace: () => void;
  answerAgentQuestion: (event: FormEvent<HTMLFormElement>) => void;
  setAgentQuestionAnswer: Dispatch<SetStateAction<string>>;
  setCustomAgentQuestionAnswer: Dispatch<SetStateAction<string>>;
  submitAgentQuestionAnswer: (answerValue: string) => Promise<void>;
  setChatMode: Dispatch<SetStateAction<ChatMode>>;
  setContextWindowPreset: Dispatch<SetStateAction<ContextWindowPreset>>;
  setModelSource: Dispatch<SetStateAction<ModelSource>>;
  setSelectedRuntimeAgentId: Dispatch<SetStateAction<string>>;
  setSelectedAgentId: Dispatch<SetStateAction<string>>;
  setSelectedReviewerAgentId: Dispatch<SetStateAction<string>>;
  setSelectedProviderId: Dispatch<SetStateAction<string>>;
  setSelectedModelId: Dispatch<SetStateAction<string>>;
  toggleAllowedAgentTool: (toolId: AgentToolName, enabled: boolean) => void;
  sendMessage: (input: ComposerSubmitInput) => Promise<void>;
  onAbortTask: () => void;
};

export const ChatPanel = ({
  chatScrollAreaRef,
  workspace,
  workspaces,
  messages,
  expandedThinkingIds,
  expandedAgentEventIds,
  modelSource,
  selectedAgent,
  chatError,
  settingsError,
  skillsError,
  sessionsError,
  pendingAgentQuestion,
  agentQuestionAnswer,
  customAgentQuestionAnswer,
  isAnsweringAgentQuestion,
  files,
  composerResetKey,
  isSending,
  activeAgentTaskId,
  isSettingsLoading,
  chatMode,
  contextWindowPreset,
  availableRuntimeAgents,
  selectedRuntimeAgent,
  runtimeAgentId,
  agentProfiles,
  providers,
  selectedProviderId,
  selectedModel,
  reviewerAgent,
  allowedAgentTools,
  toggleThinking,
  toggleAgentEvents,
  toggleAgentThinkingBlock,
  toggleAgentBlock,
  onEditHistoryMessage,
  onDeleteHistoryMessage,
  onMoveHistoryMessage,
  onOpenWorkspace,
  onCreateWorkspace,
  answerAgentQuestion,
  setAgentQuestionAnswer,
  setCustomAgentQuestionAnswer,
  submitAgentQuestionAnswer,
  setChatMode,
  setContextWindowPreset,
  setModelSource,
  setSelectedRuntimeAgentId,
  setSelectedAgentId,
  setSelectedReviewerAgentId,
  setSelectedProviderId,
  setSelectedModelId,
  toggleAllowedAgentTool,
  sendMessage,
  onAbortTask,
}: ChatPanelProps) => {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [activeHistoryActionsMessageId, setActiveHistoryActionsMessageId] = useState<string | null>(null);
  const [expandedHistoryActionsMessageId, setExpandedHistoryActionsMessageId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [confirmingDeleteMessageId, setConfirmingDeleteMessageId] = useState<string | null>(null);
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const historyActionsCloseTimerRef = useRef<number | null>(null);

  const getMessageTextForAction = (message: ChatMessage) => {
    const blockText = message.agentBlocks
      ?.flatMap((block) => block.type === "text" ? [block.content] : [])
      .join("\n\n")
      .trim();

    return message.text.trim() || blockText || "";
  };

  const beginHistoryEdit = (message: ChatMessage) => {
    setConfirmingDeleteMessageId(null);
    setEditingMessageId(message.id);
    setEditingMessageText(message.text || getMessageTextForAction(message));
  };

  const cancelHistoryEdit = () => {
    setEditingMessageId(null);
    setEditingMessageText("");
  };

  const saveHistoryEdit = () => {
    if (!editingMessageId) {
      return;
    }

    onEditHistoryMessage(editingMessageId, editingMessageText);
    cancelHistoryEdit();
  };

  const copyMessageText = (message: ChatMessage) => {
    const text = getMessageTextForAction(message);
    if (!text || !navigator.clipboard) {
      return;
    }

    void navigator.clipboard.writeText(text).then(() => {
      setCopiedMessageId(message.id);
      window.setTimeout(() => {
        setCopiedMessageId((current) => current === message.id ? null : current);
      }, 1200);
    }).catch(() => undefined);
  };

  const clearHistoryActionsCloseTimer = () => {
    if (historyActionsCloseTimerRef.current !== null) {
      window.clearTimeout(historyActionsCloseTimerRef.current);
      historyActionsCloseTimerRef.current = null;
    }
  };

  const openHistoryActions = (messageId: string) => {
    clearHistoryActionsCloseTimer();
    setActiveHistoryActionsMessageId(messageId);
    setExpandedHistoryActionsMessageId(messageId);
    setConfirmingDeleteMessageId((current) =>
      expandedHistoryActionsMessageId === messageId ? current : null,
    );
  };

  const closeHistoryActions = (messageId: string) => {
    clearHistoryActionsCloseTimer();
    setExpandedHistoryActionsMessageId((current) => current === messageId ? null : current);
    setActiveHistoryActionsMessageId((current) => current === messageId ? null : current);
    setConfirmingDeleteMessageId((current) => current === messageId ? null : current);
  };

  const scheduleHistoryActionsClose = (messageId: string) => {
    clearHistoryActionsCloseTimer();
    historyActionsCloseTimerRef.current = window.setTimeout(() => {
      closeHistoryActions(messageId);
    }, 140);
  };

  const defaultWorkspace = workspaces.find(isDefaultWorkspace) ?? null;
  const projectWorkspaces = workspaces.filter((item) => !isDefaultWorkspace(item));
  const isDefaultWorkspaceSelected = isDefaultWorkspace(workspace);
  const workspaceSwitcherLabel = isDefaultWorkspaceSelected ? "不使用项目" : workspace.name;
  const normalizedWorkspaceSearch = workspaceSearch.trim().toLowerCase();
  const visibleProjectWorkspaces = normalizedWorkspaceSearch
    ? projectWorkspaces.filter((item) =>
      item.name.toLowerCase().includes(normalizedWorkspaceSearch) ||
      item.path.toLowerCase().includes(normalizedWorkspaceSearch),
    )
    : projectWorkspaces;
  const isEmptyConversation = messages.length === 0 && !pendingAgentQuestion;
  const workspaceSwitcher = (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) {
          setWorkspaceSearch("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-9 max-w-full rounded-lg px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          title={workspace.path}
        >
          {isDefaultWorkspaceSelected ? (
            <span className="relative flex size-4 shrink-0 items-center justify-center">
              <Folder className="size-4" />
              <X className="absolute -right-1 -bottom-1 size-2.5 stroke-[3]" />
            </span>
          ) : (
            <Folder className="size-4 shrink-0" />
          )}
          <span className="min-w-0 truncate">{workspaceSwitcherLabel}</span>
          <ChevronDown className="size-3.5 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-80 rounded-2xl border-border/70 bg-popover p-2 shadow-xl"
      >
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground/80" />
          <input
            type="search"
            value={workspaceSearch}
            onChange={(event) => setWorkspaceSearch(event.currentTarget.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="搜索项目"
            className="h-9 w-full rounded-lg border-0 bg-transparent pr-2 pl-8 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:bg-muted/45 focus:ring-0 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          {visibleProjectWorkspaces.length > 0 ? visibleProjectWorkspaces.map((item) => (
            <DropdownMenuItem
              key={item.id}
              className="h-10 gap-3 rounded-lg px-2.5 text-sm font-medium"
              title={item.path}
              onSelect={() => {
                if (item.id !== workspace.id) {
                  onOpenWorkspace(item);
                }
              }}
            >
              <Folder className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.id === workspace.id && (
                <Check className="size-4 shrink-0 text-foreground" />
              )}
            </DropdownMenuItem>
          )) : (
            <div className="px-2.5 py-4 text-sm text-muted-foreground">
              没有匹配的项目
            </div>
          )}
        </div>
        <DropdownMenuSeparator className="mx-2 my-2" />
        <DropdownMenuItem
          className="h-10 gap-3 rounded-lg px-2.5 text-sm font-semibold"
          onSelect={onCreateWorkspace}
        >
          <span className="relative flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            <Folder className="size-4" />
            <Plus className="absolute -right-1 -bottom-1 size-2.5 stroke-[3]" />
          </span>
          <span className="min-w-0 flex-1 truncate">新建工作区</span>
        </DropdownMenuItem>
        {defaultWorkspace && (
          <DropdownMenuItem
            className="h-10 gap-3 rounded-lg px-2.5 text-sm font-semibold"
            title={defaultWorkspace.path}
            onSelect={() => {
              if (defaultWorkspace.id !== workspace.id) {
                onOpenWorkspace(defaultWorkspace);
              }
            }}
          >
            <span className="relative flex size-4 shrink-0 items-center justify-center text-muted-foreground">
              <Folder className="size-4" />
              <X className="absolute -right-1 -bottom-1 size-2.5 stroke-[3]" />
            </span>
            <span className="min-w-0 flex-1 truncate">不使用项目</span>
            {defaultWorkspace.id === workspace.id && (
              <Check className="size-4 shrink-0 text-foreground" />
            )}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const emptyContextBar = (
    <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 px-1 text-sm text-muted-foreground">
      {workspaceSwitcher}
    </div>
  );
  const statusBanner = (chatError || settingsError || skillsError || sessionsError) ? (
    <div className="mx-auto mb-3 max-w-5xl rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {chatError || settingsError || skillsError || sessionsError}
    </div>
  ) : null;
  const composerElement = (
    <Composer
      files={files}
      resetKey={composerResetKey}
      isSending={isSending}
      activeAgentTaskId={activeAgentTaskId}
      isSettingsLoading={isSettingsLoading}
      chatMode={chatMode}
      contextWindowPreset={contextWindowPreset}
      modelSource={modelSource}
      runtimeAgents={availableRuntimeAgents}
      selectedRuntimeAgent={selectedRuntimeAgent}
      selectedRuntimeAgentId={runtimeAgentId}
      agentProfiles={agentProfiles}
      providers={providers}
      selectedProviderId={selectedProviderId}
      selectedModel={selectedModel}
      selectedAgent={selectedAgent}
      reviewerAgent={reviewerAgent}
      allowedAgentTools={allowedAgentTools}
      onChatModeChange={setChatMode}
      onContextWindowPresetChange={setContextWindowPreset}
      onModelSourceChange={setModelSource}
      onRuntimeAgentChange={setSelectedRuntimeAgentId}
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
      onAbortTask={onAbortTask}
    />
  );

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
      <ScrollArea ref={chatScrollAreaRef} className="h-full min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 lg:px-6 lg:py-6 xl:px-7 xl:py-7">
          {isEmptyConversation ? (
            <div className="flex min-h-[calc(100vh-9rem)] flex-col items-center justify-center px-2 py-10">
              <div className="w-full space-y-7">
                <div className="text-center">
                  <h3
                    className="mx-auto flex w-full max-w-[38rem] min-w-0 items-baseline justify-center overflow-hidden text-center text-2xl font-semibold leading-tight tracking-normal whitespace-nowrap text-foreground sm:text-3xl xl:text-4xl"
                    title={`我们应该在 ${workspace.name} 中构建什么？`}
                  >
                    <span className="shrink-0">我们应该在&nbsp;</span>
                    <span className="min-w-0 truncate" title={workspace.name}>
                      {workspace.name}
                    </span>
                    <span className="shrink-0">&nbsp;中构建什么？</span>
                  </h3>
                </div>
                {statusBanner}
                <div className="space-y-3">
                  {composerElement}
                  {emptyContextBar}
                </div>
              </div>
            </div>
          ) : (
            messages.map((message, messageIndex) => {
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
              const isEditingHistoryMessage = editingMessageId === message.id;
              const canChangeHistory =
                !activeAgentTaskId &&
                message.status !== "loading" &&
                message.status !== "streaming";
              const isHistoryActionsVisible = activeHistoryActionsMessageId === message.id;
              const areHistoryActionsExpanded = expandedHistoryActionsMessageId === message.id;
              const isConfirmingDelete = confirmingDeleteMessageId === message.id;
              const historyActionButtonClass =
                "size-7 rounded-md bg-transparent text-muted-foreground hover:bg-muted/45 hover:text-foreground";
              const historyMenuItemClass =
                "flex size-8 items-center justify-center rounded-lg p-0 text-muted-foreground focus:bg-muted/70 focus:text-foreground";
              const messageAuthorLabel = message.agentName ?? (message.mode === "agent" ? "Agent" : "助手");
              const messageTimeLabel = new Date(message.createdAt).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              });
              const messageActionText = getMessageTextForAction(message);
              const canCopyMessage = messageActionText.length > 0;
              const advancedHistoryActions = canChangeHistory ? (
                <DropdownMenuContent
                  align={message.role === "user" ? "end" : "start"}
                  side="top"
                  sideOffset={6}
                  collisionPadding={12}
                  className="flex w-auto min-w-0 items-center gap-1 rounded-xl border-border/70 bg-popover/95 p-1.5 shadow-xl ring-1 ring-foreground/5 backdrop-blur"
                  onMouseEnter={() => openHistoryActions(message.id)}
                  onMouseLeave={() => scheduleHistoryActionsClose(message.id)}
                  onCloseAutoFocus={(event) => event.preventDefault()}
                >
                  {isConfirmingDelete ? (
                    <>
                      <span className="px-1.5 text-xs font-medium whitespace-nowrap text-destructive">
                        删除？
                      </span>
                      <DropdownMenuItem
                        className={historyMenuItemClass}
                        title="取消删除"
                        aria-label="取消删除"
                        onSelect={(event) => {
                          event.preventDefault();
                          setConfirmingDeleteMessageId(null);
                          openHistoryActions(message.id);
                        }}
                      >
                        <X className="size-3.5" />
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={[
                          historyMenuItemClass,
                          "text-destructive focus:bg-destructive/10 focus:text-destructive",
                        ].join(" ")}
                        variant="destructive"
                        title="确认删除"
                        aria-label="确认删除"
                        onSelect={() => {
                          onDeleteHistoryMessage(message.id);
                          closeHistoryActions(message.id);
                        }}
                      >
                        <Check className="size-3.5" />
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem
                        className={historyMenuItemClass}
                        title="编辑"
                        aria-label="编辑消息"
                        onSelect={() => {
                          beginHistoryEdit(message);
                          closeHistoryActions(message.id);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={historyMenuItemClass}
                        title="上移"
                        aria-label="上移消息"
                        disabled={messageIndex === 0}
                        onSelect={() => {
                          onMoveHistoryMessage(message.id, "up");
                          closeHistoryActions(message.id);
                        }}
                      >
                        <ArrowUp className="size-3.5" />
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={historyMenuItemClass}
                        title="下移"
                        aria-label="下移消息"
                        disabled={messageIndex === messages.length - 1}
                        onSelect={() => {
                          onMoveHistoryMessage(message.id, "down");
                          closeHistoryActions(message.id);
                        }}
                      >
                        <ArrowDown className="size-3.5" />
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={[
                          historyMenuItemClass,
                          "text-destructive focus:bg-destructive/10 focus:text-destructive",
                        ].join(" ")}
                        variant="destructive"
                        title="删除"
                        aria-label="删除消息"
                        onSelect={(event) => {
                          event.preventDefault();
                          setConfirmingDeleteMessageId(message.id);
                          openHistoryActions(message.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              ) : null;
              const messageToolbar = canChangeHistory ? (
                <div
                  className={[
                    "relative flex h-7 items-center gap-0.5 rounded-md bg-transparent px-0.5 text-[11px] text-muted-foreground transition-opacity duration-150",
                    message.role === "user" ? "self-end" : "self-start",
                    isHistoryActionsVisible ? "opacity-100" : "pointer-events-none opacity-0",
                  ].join(" ")}
                  onMouseEnter={() => setActiveHistoryActionsMessageId(message.id)}
                  onFocusCapture={() => setActiveHistoryActionsMessageId(message.id)}
                >
                  {message.role === "user" && (
                    <span className="px-1.5 tabular-nums text-muted-foreground/85">{messageTimeLabel}</span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={historyActionButtonClass}
                    title="复制"
                    aria-label="复制消息"
                    disabled={!canCopyMessage}
                    onClick={() => copyMessageText(message)}
                  >
                    {copiedMessageId === message.id ? (
                      <Check className="size-3.5" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    <span className="sr-only">复制</span>
                  </Button>
                  <DropdownMenu
                    modal={false}
                    open={areHistoryActionsExpanded}
                    onOpenChange={(isOpen) => {
                      if (isOpen) {
                        openHistoryActions(message.id);
                        return;
                      }

                      closeHistoryActions(message.id);
                    }}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={historyActionButtonClass}
                        title="更多操作"
                        aria-label="更多消息操作"
                        aria-expanded={areHistoryActionsExpanded}
                        aria-haspopup="menu"
                        onMouseEnter={() => openHistoryActions(message.id)}
                      >
                        <MoreHorizontal className="size-3.5" />
                        <span className="sr-only">更多操作</span>
                      </Button>
                    </DropdownMenuTrigger>
                    {advancedHistoryActions}
                  </DropdownMenu>
                </div>
              ) : null;

              return (
                <div
                  key={message.id}
                  className="flex gap-3 data-[role=user]:justify-end data-[role=user]:pr-2 xl:data-[role=user]:pr-6"
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
                    className="flex max-w-[88%] flex-col gap-1 lg:max-w-[82%] xl:max-w-[78%] data-[role=assistant]:items-start data-[role=user]:items-end"
                    data-role={message.role}
                    onMouseLeave={(event) => {
                      if (expandedHistoryActionsMessageId === message.id) {
                        scheduleHistoryActionsClose(message.id);
                        return;
                      }
                      if (activeHistoryActionsMessageId === message.id) {
                        setActiveHistoryActionsMessageId(null);
                      }
                      const activeElement = document.activeElement;
                      if (activeElement instanceof HTMLElement && event.currentTarget.contains(activeElement)) {
                        activeElement.blur();
                      }
                    }}
                  >
                    {message.role === "assistant" && (
                      <div
                        className="relative flex h-6 w-fit items-center rounded-sm text-[11px] leading-none text-muted-foreground"
                        onMouseEnter={() => setActiveHistoryActionsMessageId(message.id)}
                        onFocusCapture={() => setActiveHistoryActionsMessageId(message.id)}
                      >
                        <div className="flex min-w-0 items-center gap-1.5 rounded-sm px-1">
                          <span className="truncate font-medium">{messageAuthorLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span className="shrink-0 tabular-nums">{messageTimeLabel}</span>
                        </div>
                      </div>
                    )}
                    <div
                      className="relative rounded-md px-3.5 py-2.5 text-sm leading-6 shadow-xs data-[role=assistant]:bg-card data-[role=user]:bg-primary data-[role=user]:text-primary-foreground"
                      data-role={message.role}
                      onMouseEnter={() => setActiveHistoryActionsMessageId(message.id)}
                      onFocusCapture={() => setActiveHistoryActionsMessageId(message.id)}
                    >
                    {isEditingHistoryMessage && (
                      <div className="space-y-2">
                        <Textarea
                          value={editingMessageText}
                          onChange={(event) => setEditingMessageText(event.currentTarget.value)}
                          rows={4}
                          className={[
                            "max-h-72 min-h-28 resize-y border bg-background text-sm leading-6 text-foreground shadow-xs",
                            message.role === "user"
                              ? "border-primary-foreground/30 bg-primary-foreground"
                              : "",
                          ].filter(Boolean).join(" ")}
                          autoFocus
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelHistoryEdit();
                            }
                            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                              event.preventDefault();
                              saveHistoryEdit();
                            }
                          }}
                        />
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={message.role === "user"
                              ? "h-8 text-primary-foreground hover:bg-primary-foreground/15"
                              : "h-8"}
                            onClick={cancelHistoryEdit}
                          >
                            <X className="size-3.5" />
                            <span>取消</span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-8"
                            disabled={!editingMessageText.trim()}
                            onClick={saveHistoryEdit}
                          >
                            <Check className="size-3.5" />
                            <span>保存</span>
                          </Button>
                        </div>
                      </div>
                    )}
                    {!isEditingHistoryMessage && message.role === "assistant" && !hasAgentBlocks && thinking && (
                      <div className="mb-2 overflow-hidden rounded-md bg-muted/35 shadow-xs">
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
                          <div className="max-h-48 overflow-auto bg-background/45 px-2.5 py-2 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
                            {thinking}
                          </div>
                        )}
                      </div>
                    )}

                    {!isEditingHistoryMessage && message.role === "assistant" && !hasAgentBlocks && agentEventGroups.length > 0 && (
                      <div className="mb-2 overflow-hidden rounded-md bg-muted/35 shadow-xs">
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
                          <div className="max-h-72 space-y-1.5 overflow-auto bg-background/45 px-2.5 py-2">
                            {hiddenAgentEventGroupCount > 0 && (
                              <div className="rounded-sm bg-background/70 px-2 py-1 text-xs text-muted-foreground">
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
                                  className="group rounded-sm bg-background shadow-xs"
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
                                  <div className="space-y-1 bg-muted/25 px-2 py-1.5 text-xs leading-5 text-muted-foreground">
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
                                    <div className="bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
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

                    {!isEditingHistoryMessage && (hasAgentBlocks ? (
                      <div className="space-y-2">
                        {agentBlocks.map((block) => {
                          if (block.type === "thinking") {
                            const isCollapsed = Boolean(block.isCollapsed);

                            return (
                              <div
                                key={block.id}
                                className="overflow-hidden rounded-md bg-muted/35 shadow-xs"
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
                                      className="max-h-48 overflow-auto bg-background/45 px-2.5 py-2 text-xs leading-5 whitespace-pre-wrap text-muted-foreground"
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
                                className="overflow-hidden rounded-md bg-muted/35 shadow-xs"
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
                                    <div className="space-y-1 bg-background/45 px-2.5 py-2 text-xs leading-5 text-muted-foreground">
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
                                      <div className="bg-destructive/10 px-2.5 py-1 text-[11px] text-destructive">
                                        工具执行失败，请展开查看最后几条输出。
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {isCollapsed && latestEvent?.type === "tool_end" && latestEvent.isError && (
                                  <div className="bg-destructive/10 px-2.5 py-1 text-[11px] text-destructive">
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
                      ))}
                    </div>
                    {messageToolbar}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {!isEmptyConversation && (
        <div className="bg-background/90 px-4 py-3 shadow-[0_-10px_28px_-30px_rgb(15_23_42_/_0.32)] backdrop-blur lg:px-6 xl:px-7 xl:py-4">
          {statusBanner}
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
          {composerElement}
        </div>
      )}
    </section>
  );
};
