import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIcon, ArrowLeftIcon, ChevronRightIcon, EyeIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  readLedger,
  summarizeLedger,
  type LedgerMessage,
  type LedgerResult,
  type LedgerRuntimeLink,
} from "@/api/conversation-ledger";
import { resolveRuntimeModelInput, useLlmSettingsStore } from "@/features/pages/settings/llm/store";

const summaryInstruction = [
  "请生成当前会话的前端展示摘要。",
  "摘要仅用于界面查看，不参与后续上下文构建。",
  "优先保留用户目标、关键决策、当前进展、未完成事项和重要运行状态。",
].join("\n");

const statusLabel = {
  running: "执行中",
  done: "已完成",
  error: "失败",
} satisfies Record<NonNullable<LedgerRuntimeLink["status"]>, string>;

const statusClass = {
  running: "bg-primary",
  done: "bg-emerald-500",
  error: "bg-destructive",
} satisfies Record<NonNullable<LedgerRuntimeLink["status"]>, string>;

const formatTime = (timestamp?: number | null) => {
  if (!timestamp) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
};

const formatDuration = (link: LedgerRuntimeLink) => {
  if (!link.startedAt || !link.endedAt) {
    return "";
  }

  const milliseconds = Math.max(0, link.endedAt - link.startedAt);
  return milliseconds < 1000 ? `${milliseconds}ms` : `${(milliseconds / 1000).toFixed(1)}s`;
};

const preview = (content: string | undefined, limit: number) => {
  const text = content?.replace(/\s+/g, " ").trim() ?? "";
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
};

const findMessage = (messageById: Map<string, LedgerMessage>, ids: Array<string | null | undefined>, role: string) =>
  ids.map((id) => (id ? messageById.get(id) : null)).find((message) => message?.role === role) ?? null;

const linkMessages = (ledger: LedgerResult, link: LedgerRuntimeLink) => {
  const messageIds = new Set(
    [
      link.userMessageRecordId,
      ...link.assistantMessageRecordIds,
      ...link.messageRecordIds,
      ...link.requestContextRecordIds,
      ...link.runtimeInstructionRecordIds,
    ].filter((id): id is string => Boolean(id)),
  );

  return ledger.messages.filter((message) => messageIds.has(message.messageRecordId));
};

type ChatLedgerProps = {
  workspacePath: string;
  chatId: string;
};

export const ChatLedger = ({ workspacePath, chatId }: ChatLedgerProps) => {
  const loadLlmSettings = useLlmSettingsStore((store) => store.loadSettings);
  const [ledger, setLedger] = useState<LedgerResult | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [error, setError] = useState("");
  const sessionRootDir = `chats/${chatId}/session`;
  const links = useMemo(
    () => [...(ledger?.runtimeLinks ?? [])].sort((left, right) => (right.startedAt ?? 0) - (left.startedAt ?? 0)),
    [ledger?.runtimeLinks],
  );
  const selectedLink = links.find((link) => link.linkId === selectedLinkId) ?? null;
  const messageById = useMemo(
    () => new Map((ledger?.messages ?? []).map((message) => [message.messageRecordId, message])),
    [ledger?.messages],
  );

  const loadLedger = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const result = await readLedger({ workspacePath, sessionRootDir });
      setLedger(result);
      setSelectedLinkId((current) =>
        current && result?.runtimeLinks?.some((link) => link.linkId === current) ? current : "",
      );
    } catch (caught) {
      setLedger(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }, [sessionRootDir, workspacePath]);

  useEffect(() => {
    setLedger(null);
    setSelectedLinkId("");
    setError("");
    void loadLedger();
  }, [loadLedger]);

  const refreshSummary = async () => {
    setIsSummaryLoading(true);
    setError("");

    try {
      await loadLlmSettings();
      const settings = useLlmSettingsStore.getState();
      const runtimeModel = resolveRuntimeModelInput(settings.runtimeModels[0]?.id);
      if (!runtimeModel) {
        throw new Error(settings.error || "请先在设置中配置可用的 LLM 模型。");
      }

      const result = await summarizeLedger({
        workspacePath,
        sessionRootDir,
        runtimeModel,
        summaryInstruction,
      });
      setLedger(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSummaryLoading(false);
    }
  };

  if (selectedLink && ledger) {
    const messages = linkMessages(ledger, selectedLink);
    const status = selectedLink.status ?? "done";

    return (
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex min-w-0 items-center gap-2 border-b border-border/70 px-3 py-3">
          <Button type="button" size="icon" variant="ghost" title="返回链路列表" onClick={() => setSelectedLinkId("")}>
            <ArrowLeftIcon className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">运行详情</div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span className={`size-2 rounded-full ${statusClass[status]}`} />
              <span>{statusLabel[status]}</span>
              {formatDuration(selectedLink) ? <span>{formatDuration(selectedLink)}</span> : null}
            </div>
          </div>
        </header>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 p-3">
            {messages.length > 0 ? (
              messages.map((message) => (
                <section
                  key={message.messageRecordId}
                  className="rounded-xl border border-border/70 bg-background/70 p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="font-medium uppercase">{message.role}</span>
                    <span>{formatTime(message.timestamp)}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-words text-xs leading-6">{message.content}</div>
                </section>
              ))
            ) : (
              <div className="app-empty-state rounded-xl px-4 py-8 text-center text-sm text-muted-foreground">
                当前链路没有可展示的消息
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex min-w-0 items-center justify-between gap-2 px-3 py-3">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <ActivityIcon className="size-4 shrink-0" />
            <span>运行链路</span>
            <span className="rounded-md bg-muted/70 px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
              {links.length}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              title="查看摘要"
              disabled={!ledger}
              onClick={() => setIsSummaryOpen(true)}
            >
              <EyeIcon className="size-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" title="刷新链路" onClick={() => void loadLedger()}>
              <RefreshCwIcon className={`size-4 ${isLoading ? "animate-spin motion-reduce:animate-none" : ""}`} />
            </Button>
          </div>
        </header>

        {error ? (
          <div className="mx-3 mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
            {error}
          </div>
        ) : null}

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-1 px-2 pb-3">
            {isLoading && links.length === 0 ? (
              <div className="app-empty-state rounded-xl px-4 py-8 text-center text-sm text-muted-foreground">
                正在读取链路
              </div>
            ) : links.length > 0 ? (
              links.map((link, index) => {
                const status = link.status ?? "done";
                const userMessage = findMessage(
                  messageById,
                  [link.userMessageRecordId, ...link.messageRecordIds],
                  "user",
                );
                const assistantMessage = findMessage(
                  messageById,
                  link.assistantMessageRecordIds.length ? link.assistantMessageRecordIds : link.messageRecordIds,
                  "assistant",
                );
                const title = preview(userMessage?.content, 54) || `第 ${links.length - index} 次运行`;
                const description =
                  preview(assistantMessage?.content, 68) || (status === "running" ? "回复生成中" : "未记录回复内容");

                return (
                  <button
                    key={link.linkId}
                    type="button"
                    className="flex min-h-16 w-full min-w-0 items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-border/70 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none"
                    onClick={() => setSelectedLinkId(link.linkId)}
                  >
                    <span className={`size-2 shrink-0 rounded-full ${statusClass[status]}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
                        <span className="shrink-0 text-muted-foreground">{statusLabel[status]}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">{description}</span>
                      <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {formatTime(link.startedAt) ? <span>{formatTime(link.startedAt)}</span> : null}
                        {formatDuration(link) ? <span>{formatDuration(link)}</span> : null}
                      </span>
                    </span>
                    <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                );
              })
            ) : (
              <div className="app-empty-state rounded-xl px-4 py-8 text-center text-sm text-muted-foreground">
                暂无运行链路
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <Dialog open={isSummaryOpen} onOpenChange={setIsSummaryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>会话摘要</DialogTitle>
            <DialogDescription>摘要仅用于查看，不参与后续聊天上下文。</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="whitespace-pre-wrap break-words rounded-xl bg-muted/40 p-4 text-sm leading-7">
              {ledger?.displaySummary?.summary || ledger?.summary || "尚未生成摘要"}
            </div>
          </ScrollArea>
          <div className="flex justify-end">
            <Button type="button" disabled={isSummaryLoading} onClick={() => void refreshSummary()}>
              <RefreshCwIcon
                className={`size-4 ${isSummaryLoading ? "animate-spin motion-reduce:animate-none" : ""}`}
              />
              重新生成
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
