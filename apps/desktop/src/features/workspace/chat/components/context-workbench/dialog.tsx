import { useState } from "react";
import { Archive, Check, Copy, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MewvisOffice } from "./office";
import type { AgentSessionStatus } from "../../types";

type ContextWorkbenchDialogProps = {
  open: boolean;
  currentSessionId: string | null;
  currentSessionTitle: string;
  agentRuntimeSessionId: string | null;
  activeAgentTaskId: string;
  agentSessionStatus: AgentSessionStatus | null;
  agentSessionError: string;
  isAgentSessionLoading: boolean;
  isContextCompressing: boolean;
  onOpenChange: (open: boolean) => void;
  onRefreshAgentSession: () => void;
  onCleanupAgentSessions: () => void;
  onCompressConversationContext: () => void;
};

const getCompactReference = (value: string) => {
  const normalized = value.trim().replace(/[\\/]+$/, "");
  const lastPart = normalized.split(/[\\/]/).filter(Boolean).at(-1) ?? normalized;
  if (lastPart.length <= 18) {
    return lastPart || "......";
  }

  return `${lastPart.slice(0, 10)}…${lastPart.slice(-6)}`;
};

type CompactPathItemProps = {
  label: string;
  value: string;
  emptyText: string;
  displayValue?: string;
  detailValue?: string;
  copyLabel?: string;
};

const CompactPathItem = ({
  label,
  value,
  emptyText,
  displayValue,
  detailValue,
  copyLabel,
}: CompactPathItemProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const hasValue = Boolean(value);
  const compactValue = hasValue ? (displayValue ?? getCompactReference(value)) : emptyText;
  const secondaryValue = hasValue && detailValue ? detailValue : "";

  const handleCopy = async () => {
    if (!hasValue) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 1200);
    } catch {
      setIsCopied(false);
    }
  };

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 rounded-xl px-2 py-1 text-left transition-colors hover:bg-background/70 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          title={hasValue ? value : emptyText}
          onClick={() => {
            if (hasValue) {
              setIsExpanded((expanded) => !expanded);
            }
          }}
        >
          <span className="block text-xs text-muted-foreground">{label}</span>
          <span
            className={[
              "mt-0.5 block truncate text-sm font-medium",
              displayValue ? "" : "font-mono",
            ].join(" ")}
          >
            {compactValue}
          </span>
          {secondaryValue && (
            <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground/75">
              {secondaryValue}
            </span>
          )}
        </button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="size-8 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
          disabled={!hasValue}
          title={hasValue ? `复制${copyLabel ?? label}` : emptyText}
          aria-label={hasValue ? `复制${copyLabel ?? label}` : emptyText}
          onClick={() => void handleCopy()}
        >
          {isCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
      {isExpanded && hasValue && (
        <div className="mt-2 rounded-xl bg-background/70 px-3 py-2 font-mono text-xs leading-5 break-all text-muted-foreground">
          {value}
        </div>
      )}
    </div>
  );
};

export const ContextWorkbenchDialog = ({
  open,
  currentSessionId,
  currentSessionTitle,
  agentRuntimeSessionId,
  activeAgentTaskId,
  agentSessionStatus,
  agentSessionError,
  isAgentSessionLoading,
  isContextCompressing,
  onOpenChange,
  onRefreshAgentSession,
  onCleanupAgentSessions,
  onCompressConversationContext,
}: ContextWorkbenchDialogProps) => {
  const [isChatIdCopied, setIsChatIdCopied] = useState(false);
  const chatName = currentSessionTitle.trim() || "未命名聊天";
  const contextSessionValue = currentSessionId ?? "";
  const chatIdReference = currentSessionId ? getCompactReference(currentSessionId) : "未生成 chatId";
  const isCoreWorking = Boolean(activeAgentTaskId) || isAgentSessionLoading || isContextCompressing;
  const chatStateLabel = activeAgentTaskId
    ? "处理中"
    : agentRuntimeSessionId
      ? agentSessionStatus?.exists
        ? "已同步"
        : "待写入"
      : currentSessionId
        ? "待重建"
        : "未保存";
  const chatStateClassName = activeAgentTaskId
    ? "bg-primary/10 text-primary"
    : agentSessionStatus?.exists
      ? "bg-muted/70 text-foreground"
      : "bg-muted/50 text-muted-foreground";
  const copyChatId = async () => {
    if (!currentSessionId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(currentSessionId);
      setIsChatIdCopied(true);
      window.setTimeout(() => setIsChatIdCopied(false), 1200);
    } catch {
      setIsChatIdCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        overlayClassName="pointer-events-none !top-12 !right-0 !bottom-0 !left-0 bg-transparent supports-backdrop-filter:backdrop-blur-0 min-[720px]:!left-[clamp(216px,22vw,288px)]"
        className="!top-12 !right-0 !bottom-0 !left-0 h-auto w-auto max-w-none !translate-x-0 !translate-y-0 overflow-hidden rounded-none bg-background p-0 ring-0 shadow-[-10px_0_32px_-28px_rgb(15_23_42_/_0.45)] sm:w-auto sm:max-w-none min-[720px]:!left-[clamp(216px,22vw,288px)]"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(280px,32vw)] xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="flex min-h-0 overflow-hidden bg-background">
            <MewvisOffice isWorking={isCoreWorking} />
          </section>

          <aside className="min-h-0 min-w-0 bg-background p-5 shadow-[-10px_0_32px_-30px_rgb(15_23_42_/_0.28)]">
            <ScrollArea className="h-full">
              <div className="space-y-4 pr-1">
                <section className="min-w-0 overflow-hidden rounded-[28px] bg-card p-4 shadow-xs">
                  <DialogHeader className="min-w-0 space-y-3 pr-12">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="w-0 min-w-0 flex-1 overflow-hidden">
                        <DialogTitle className="block max-w-full truncate text-2xl font-semibold tracking-normal" title={chatName}>
                          {chatName}
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                          当前聊天的中枢面板。
                        </DialogDescription>
                        <button
                          type="button"
                          className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full bg-muted/45 px-3 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/65 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
                          title={currentSessionId ?? "未生成 chatId"}
                          disabled={!currentSessionId}
                          onClick={() => void copyChatId()}
                        >
                          <span className="shrink-0 font-medium">chatId</span>
                          <span className="min-w-0 truncate font-mono">{chatIdReference}</span>
                          {currentSessionId && (
                            isChatIdCopied ? (
                              <Check className="size-3.5 shrink-0" />
                            ) : (
                              <Copy className="size-3.5 shrink-0" />
                            )
                          )}
                        </button>
                      </div>
                      <span className={["mt-0.5 shrink-0 rounded-full px-3 py-1 text-xs font-medium", chatStateClassName].join(" ")}>
                        {chatStateLabel}
                      </span>
                    </div>
                  </DialogHeader>

                  <div className="mt-5 grid gap-2">
                    <CompactPathItem
                      label="当前聊天"
                      value={contextSessionValue}
                      emptyText="未生成 chatId"
                      displayValue={currentSessionId ? chatIdReference : ""}
                      detailValue={currentSessionId ? chatName : ""}
                      copyLabel="chatId"
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-muted/25 p-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-9 justify-center rounded-xl px-2 text-xs hover:bg-background/70"
                      disabled={isContextCompressing}
                      title="压缩上下文"
                      onClick={onCompressConversationContext}
                    >
                      <Archive className="size-3.5" />
                      <span>压缩</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-9 justify-center rounded-xl px-2 text-xs hover:bg-background/70"
                      disabled={isAgentSessionLoading}
                      title="刷新状态"
                      onClick={onRefreshAgentSession}
                    >
                      <RefreshCw
                        className={[
                          "size-3.5",
                          isAgentSessionLoading ? "animate-spin" : "",
                        ].join(" ")}
                      />
                      <span>刷新</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-9 justify-center rounded-xl px-2 text-xs hover:bg-background/70"
                      disabled={isAgentSessionLoading}
                      title="清理失效上下文"
                      onClick={onCleanupAgentSessions}
                    >
                      <Trash2 className="size-3.5" />
                      <span>清理失效</span>
                    </Button>
                  </div>
                </section>

                {agentSessionError && (
                  <section className="rounded-[24px] bg-card p-4 shadow-xs">
                    <div className="text-sm font-medium">运行状态</div>
                    <div className="mt-3 rounded-2xl bg-sidebar-primary/10 p-3 text-sm text-sidebar-primary">
                      {agentSessionError}
                    </div>
                  </section>
                )}

              </div>
            </ScrollArea>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
};
