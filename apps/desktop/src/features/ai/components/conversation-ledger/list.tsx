import { Activity, ChevronRight, Eye, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LedgerSummaryDialog } from "./summary-dialog";
import type { LedgerResult, LedgerRuntimeLink } from "./types";
import {
  formatLedgerDuration,
  formatLedgerTime,
  ledgerStatusClasses,
  ledgerStatusLabels,
  previewLedgerText,
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

const linkDuration = (link: LedgerRuntimeLink) =>
  link.startedAt && link.endedAt ? formatLedgerDuration(Math.max(0, link.endedAt - link.startedAt)) : "";

const findLinkMessage = (
  messageById: Map<string, NonNullable<LedgerResult["messages"]>[number]>,
  ids: string[],
  role: string,
) => ids.map((id) => messageById.get(id) ?? null).find((message) => message?.role === role) ?? null;

const linkDisplay = ({
  link,
  linkIndex,
  messageById,
  totalLinks,
}: {
  link: LedgerRuntimeLink;
  linkIndex: number;
  messageById: Map<string, NonNullable<LedgerResult["messages"]>[number]>;
  totalLinks: number;
}) => {
  const orderedMessageIds = [link.userMessageRecordId, ...link.messageRecordIds].filter((id): id is string =>
    Boolean(id),
  );
  const userMessage = findLinkMessage(messageById, orderedMessageIds, "user");
  const assistantMessage = findLinkMessage(
    messageById,
    link.assistantMessageRecordIds.length ? link.assistantMessageRecordIds : link.messageRecordIds,
    "assistant",
  );
  const userPreview = previewLedgerText(userMessage?.content, 64);
  const assistantPreview = previewLedgerText(assistantMessage?.content, 72);
  const duration = linkDuration(link);

  return {
    title: userPreview || `第 ${totalLinks - linkIndex} 次运行`,
    subtitle: assistantPreview
      ? `回复：${assistantPreview}`
      : link.status === "running"
        ? "回复生成中"
        : "未记录回复内容",
    metaItems: [
      link.startedAt ? formatLedgerTime(link.startedAt) : "",
      duration,
      link.messageRecordIds.length ? `${link.messageRecordIds.length} 条消息` : "",
    ].filter(Boolean),
  };
};

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
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const messageById = useMemo(
    () => new Map((ledger?.messages ?? []).map((message) => [message.messageRecordId, message])),
    [ledger?.messages],
  );

  return (
    <>
      <LedgerSummaryDialog
        ledger={ledger}
        open={isSummaryOpen}
        isRefreshing={isSummaryRefreshing}
        onOpenChange={setIsSummaryOpen}
        onRefreshSummary={onRefreshSummary}
      />
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
                title="查看摘要"
                disabled={!ledger}
                onClick={() => setIsSummaryOpen(true)}
              >
                <Eye className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="刷新链路"
                disabled={isLoading}
                onClick={onRefresh}
              >
                <RefreshCw className={["size-4", isLoading ? "animate-spin" : ""].join(" ")} />
              </Button>
            </div>
          </div>

          {error && (
            <div className="mb-3 rounded-md bg-sidebar-primary/10 px-3 py-2 text-xs leading-5 text-sidebar-primary">
              {error}
            </div>
          )}

          {isLoading && links.length === 0 ? (
            <div className="px-2 py-8 text-center text-sm text-muted-foreground">正在读取链路...</div>
          ) : links.length === 0 ? (
            <div className="px-2 py-8 text-center text-sm text-muted-foreground">暂无运行链路</div>
          ) : (
            <div className="min-w-0 space-y-1 overflow-hidden">
              {links.map((link, linkIndex) => {
                const status = link.status ?? "done";
                const isSelected = link.linkId === selectedLink?.linkId;
                const display = linkDisplay({
                  link,
                  linkIndex,
                  messageById,
                  totalLinks: links.length,
                });

                return (
                  <button
                    key={link.linkId}
                    type="button"
                    className="flex min-h-16 w-full min-w-0 items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left transition-colors hover:bg-muted/45 data-[selected=true]:border-primary/20 data-[selected=true]:bg-primary/5"
                    data-selected={isSelected}
                    title="查看链路详情"
                    aria-label="查看链路详情"
                    onClick={() => onSelectLink(link.linkId)}
                  >
                    <span className={["size-2 shrink-0 rounded-full", ledgerStatusClasses[status]].join(" ")} />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5 text-xs">
                        <span className="min-w-0 flex-1 truncate font-medium">{display.title}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{ledgerStatusLabels[status]}</span>
                      </span>
                      <span className="mt-1 block truncate text-[11px] leading-4 text-muted-foreground">
                        {display.subtitle}
                      </span>
                      {display.metaItems.length > 0 && (
                        <span className="mt-1 flex min-w-0 flex-wrap gap-1">
                          {display.metaItems.map((item) => (
                            <span
                              key={item}
                              className="rounded-sm bg-muted/50 px-1.5 py-0.5 text-[10px] leading-4 text-muted-foreground"
                            >
                              {item}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
};
