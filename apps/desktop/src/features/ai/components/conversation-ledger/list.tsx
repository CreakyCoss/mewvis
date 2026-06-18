import { Activity, ChevronRight, Eye, FileText, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  LedgerResult,
  LedgerRuntimeLink,
} from "./types";
import {
  compactLedgerId,
  formatLedgerTime,
  ledgerStatusClasses,
  ledgerStatusLabels,
} from "./utils";

type LedgerListProps = {
  ledger: LedgerResult | null;
  links: LedgerRuntimeLink[];
  selectedLink: LedgerRuntimeLink | null;
  isLoading: boolean;
  error: string;
  isSummaryRefreshing: boolean;
  onSelectLink: (linkId: string) => void;
  onRefresh: () => void;
  onRefreshSummary: () => void;
};

const linkTitle = (link: LedgerRuntimeLink) =>
  [
    link.agentRoleId || link.runtime || "runtime",
    link.runtimeId,
  ].filter(Boolean).join(" / ");

export const LedgerList = ({
  ledger,
  links,
  selectedLink,
  isLoading,
  error,
  isSummaryRefreshing,
  onSelectLink,
  onRefresh,
  onRefreshSummary,
}: LedgerListProps) => {
  const [isSummaryVisible, setIsSummaryVisible] = useState(false);
  const displaySummary = ledger?.displaySummary ?? null;
  const summaryCount = ledger?.displaySummaries?.length ?? 0;

  return (
    <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className="min-w-0 overflow-hidden p-3">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <Activity className="size-4 shrink-0" />
            <span className="shrink-0">运行链路</span>
            <span className="rounded-md bg-muted/70 px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              {links.length}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              title={isSummaryVisible ? "隐藏摘要" : "查看摘要"}
              disabled={!ledger}
              onClick={() => setIsSummaryVisible((visible) => !visible)}
            >
              <Eye className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              title="刷新摘要"
              disabled={!ledger || isSummaryRefreshing}
              onClick={onRefreshSummary}
            >
              <FileText className={[
                "size-4",
                isSummaryRefreshing ? "animate-pulse" : "",
              ].join(" ")}
              />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              title="刷新链路"
              disabled={isLoading}
              onClick={onRefresh}
            >
              <RefreshCw className={[
                "size-4",
                isLoading ? "animate-spin" : "",
              ].join(" ")}
              />
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-md bg-sidebar-primary/10 px-3 py-2 text-xs leading-5 text-sidebar-primary">
            {error}
          </div>
        )}

        {isSummaryVisible && (
          <div className="mb-3 rounded-md border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-foreground">展示摘要</div>
              <span className="shrink-0 rounded-sm bg-muted/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {summaryCount} 条
              </span>
            </div>
            {displaySummary ? (
              <>
                <div className="mt-2 flex min-w-0 flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                  <span className="rounded-sm bg-background/70 px-1.5 py-1 font-mono">
                    {formatLedgerTime(displaySummary.generatedAt)}
                  </span>
                  {displaySummary.modelId && (
                    <span className="max-w-full truncate rounded-sm bg-background/70 px-1.5 py-1">
                      {displaySummary.modelId}
                    </span>
                  )}
                  {displaySummary.messageCount !== null && displaySummary.messageCount !== undefined && (
                    <span className="rounded-sm bg-background/70 px-1.5 py-1">
                      {displaySummary.messageCount} messages
                    </span>
                  )}
                </div>
                <div className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                  {displaySummary.summary}
                </div>
              </>
            ) : (
              <div className="mt-2 rounded-md bg-background/70 px-3 py-6 text-center text-xs text-muted-foreground">
                暂无摘要，可点击刷新摘要生成。
              </div>
            )}
          </div>
        )}

        {isLoading && links.length === 0 ? (
          <div className="px-2 py-8 text-center text-sm text-muted-foreground">
            正在读取链路...
          </div>
        ) : links.length === 0 ? (
          <div className="px-2 py-8 text-center text-sm text-muted-foreground">
            暂无运行链路
          </div>
        ) : (
          <div className="min-w-0 space-y-1 overflow-hidden">
            {links.map((link, linkIndex) => {
              const status = link.status ?? "done";
              const isSelected = link.linkId === selectedLink?.linkId;

              return (
                <button
                  key={link.linkId}
                  type="button"
                  className="flex min-h-16 w-full min-w-0 items-center gap-2 rounded-md border border-transparent px-2 text-left transition-colors hover:bg-muted/45 data-[selected=true]:border-primary/20 data-[selected=true]:bg-primary/5"
                  data-selected={isSelected}
                  onClick={() => onSelectLink(link.linkId)}
                >
                  <span
                    className={[
                      "size-2 shrink-0 rounded-full",
                      ledgerStatusClasses[status],
                    ].join(" ")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-xs font-medium">
                        {linkTitle(link)} #{links.length - linkIndex}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {ledgerStatusLabels[status]}
                      </span>
                      {link.startedAt && (
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {formatLedgerTime(link.startedAt)}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] leading-4 text-muted-foreground">
                      {compactLedgerId(link.userMessageRecordId)} / {compactLedgerId(link.taskId ?? link.runId)}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] leading-4 text-muted-foreground/80">
                      {link.messageRecordIds.length} records · {link.agentSessionId || "无底层 session"}
                    </span>
                  </span>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </ScrollArea>
  );
};
