import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Link,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessage } from "../../types";
import {
  groupAgentEvents,
  isTimelineEvent,
} from "../../utils/agent-blocks";
import { AgentBlockList } from "./agent-block-list";
import { AgentEventTimeline } from "./agent-event-timeline";
import { SmoothMarkdownContent, SmoothPlainText } from "./smooth-stream-content";
import { useChatPanelStore } from "./store";

const getMessageTextForAction = (message: ChatMessage) => {
  const blockText = message.agentBlocks
    ?.flatMap((block) => block.type === "text" ? [block.content] : [])
    .join("\n\n")
    .trim();

  return message.text.trim() || blockText || "";
};

export const MessageList = () => {
  const {
    messages,
    expandedThinkingIds,
    expandedAgentEventIds,
    modelSource,
    selectedAgent,
    activeAgentTaskId,
    showThinkingProcess,
    showToolCallProcess,
    toggleThinking,
    toggleAgentEvents,
    toggleAgentThinkingBlock,
    toggleAgentBlock,
    onEditHistoryMessage,
    onDeleteHistoryMessage,
    onMoveHistoryMessage,
  } = useChatPanelStore();
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [activeHistoryActionsMessageId, setActiveHistoryActionsMessageId] = useState<string | null>(null);
  const [expandedHistoryActionsMessageId, setExpandedHistoryActionsMessageId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [confirmingDeleteMessageId, setConfirmingDeleteMessageId] = useState<string | null>(null);
  const historyActionsCloseTimerRef = useRef<number | null>(null);

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

  useEffect(() => () => {
    if (historyActionsCloseTimerRef.current !== null) {
      window.clearTimeout(historyActionsCloseTimerRef.current);
      historyActionsCloseTimerRef.current = null;
    }
  }, []);

  return (
    <>
      {messages.map((message, messageIndex) => {
        const thinking = message.thinking?.trim();
        const isThinkingCollapsed =
          Boolean(thinking) &&
          message.status === "done" &&
          !expandedThinkingIds.has(message.id);
        const agentEvents = message.agentEvents?.filter(isTimelineEvent) ?? [];
        const agentEventGroups = groupAgentEvents(agentEvents);
        const isAgentEventsCollapsed =
          message.status === "done" && !expandedAgentEventIds.has(message.id);
        const isAssistantLoading =
          message.role === "assistant" &&
          (message.status === "loading" || message.status === "streaming") &&
          !message.text.trim();
        const isMessageStreaming =
          message.status === "loading" || message.status === "streaming";
        const messageAgentAvatar = resolveAgentAvatar(
          message.agentAvatar ?? (modelSource === "agent" ? selectedAgent?.avatar : null),
        );
        const agentBlocks = message.agentBlocks ?? [];
        const isAgentBackedMessage =
          message.mode === "agent" ||
          agentBlocks.length > 0 ||
          Boolean(message.agentEvents);
        const hasAgentBlocks =
          message.role === "assistant" &&
          isAgentBackedMessage &&
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
        const messageAuthorLabel = message.agentName ?? (isAgentBackedMessage ? "Agent" : "助手");
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
                {isAgentBackedMessage || message.agentAvatar ? (
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

                {!isEditingHistoryMessage && showThinkingProcess && message.role === "assistant" && !hasAgentBlocks && thinking && (
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
                        <SmoothPlainText
                          content={thinking}
                          isStreaming={isMessageStreaming}
                        />
                      </div>
                    )}
                  </div>
                )}

                {!isEditingHistoryMessage && showToolCallProcess && message.role === "assistant" && !hasAgentBlocks && agentEventGroups.length > 0 && (
                  <AgentEventTimeline
                    messageId={message.id}
                    messageStatus={message.status}
                    agentEventGroups={agentEventGroups}
                    isCollapsed={isAgentEventsCollapsed}
                    onToggle={() => toggleAgentEvents(message.id)}
                  />
                )}

                {!isEditingHistoryMessage && (
                  hasAgentBlocks ? (
                    <AgentBlockList
                      messageId={message.id}
                      messageStatus={message.status}
                      agentBlocks={agentBlocks}
                      showThinkingProcess={showThinkingProcess}
                      showToolCallProcess={showToolCallProcess}
                      onToggleThinkingBlock={toggleAgentThinkingBlock}
                      onToggleBlock={toggleAgentBlock}
                    />
                  ) : isAssistantLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      <span>
                        {message.mode === "collab"
                          ? "Agent 正在协作"
                          : isAgentBackedMessage ? "Agent 正在处理" : "AI 正在思考"}
                      </span>
                    </div>
                  ) : message.role === "assistant" ? (
                    <SmoothMarkdownContent
                      content={message.text}
                      isStreaming={isMessageStreaming}
                    />
                  ) : (
                    <div className="space-y-2">
                      {message.referencedFiles && message.referencedFiles.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {message.referencedFiles.map((file) => (
                            <span
                              key={file.path}
                              className="inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-sm bg-primary-foreground/15 px-1.5 py-0.5 text-xs"
                            >
                              <Link className="size-3 shrink-0" />
                              <span className="min-w-0 flex-1 truncate">{file.path}</span>
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
              {messageToolbar}
            </div>
          </div>
        );
      })}
    </>
  );
};
