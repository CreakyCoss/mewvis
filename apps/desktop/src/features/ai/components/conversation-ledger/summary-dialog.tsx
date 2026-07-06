import { RefreshCw, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MarkdownContent } from "@/features/ai/components/markdown";
import type { LedgerResult } from "./types";
import { formatLedgerDateTime } from "./utils";

type LedgerSummaryDialogProps = {
  ledger: LedgerResult | null;
  open: boolean;
  isRefreshing: boolean;
  onOpenChange: (open: boolean) => void;
  onRefreshSummary: () => void;
};

export const LedgerSummaryDialog = ({
  ledger,
  open,
  isRefreshing,
  onOpenChange,
  onRefreshSummary,
}: LedgerSummaryDialogProps) => {
  const autoRefreshRequestedRef = useRef(false);
  const displaySummary = ledger?.displaySummary ?? null;
  const summaryCount = ledger?.displaySummaries?.length ?? 0;

  useEffect(() => {
    if (!open) {
      autoRefreshRequestedRef.current = false;
      return;
    }
    if (!ledger || displaySummary || isRefreshing || autoRefreshRequestedRef.current) {
      return;
    }

    autoRefreshRequestedRef.current = true;
    onRefreshSummary();
  }, [displaySummary, isRefreshing, ledger, onRefreshSummary, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(740px,84vh)] max-w-[calc(100vw-2rem)] overflow-hidden p-0 sm:max-w-3xl lg:max-w-4xl"
        showCloseButton={false}
      >
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <DialogTitle className="min-w-0 flex-1 truncate text-base">会话摘要</DialogTitle>
            <span className="shrink-0 rounded-sm bg-muted/70 px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {summaryCount} 条
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title="刷新摘要"
              disabled={!ledger || isRefreshing}
              onClick={onRefreshSummary}
            >
              <RefreshCw className={["size-4", isRefreshing ? "animate-spin" : ""].join(" ")} />
            </Button>
            <Button type="button" size="icon-sm" variant="ghost" title="关闭摘要" onClick={() => onOpenChange(false)}>
              <X className="size-4" />
            </Button>
          </div>
          <DialogDescription>
            {displaySummary
              ? `生成于 ${formatLedgerDateTime(displaySummary.generatedAt)}`
              : isRefreshing
                ? "正在生成"
                : "暂无摘要"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(min(740px,84vh)-96px)] min-h-0">
          <div className="min-w-0 px-5 pt-4 pb-6">
            {displaySummary ? (
              <div className="min-w-0 space-y-3">
                <div className="flex min-w-0 flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                  {displaySummary.modelId && (
                    <span className="max-w-full truncate rounded-sm bg-muted/60 px-1.5 py-1">
                      {displaySummary.modelId}
                    </span>
                  )}
                  {displaySummary.messageCount !== null && displaySummary.messageCount !== undefined && (
                    <span className="rounded-sm bg-muted/60 px-1.5 py-1">{displaySummary.messageCount} 条消息</span>
                  )}
                  {displaySummary.entryCount !== null && displaySummary.entryCount !== undefined && (
                    <span className="rounded-sm bg-muted/60 px-1.5 py-1">{displaySummary.entryCount} 条记录</span>
                  )}
                </div>
                <MarkdownContent content={displaySummary.summary} className="text-sm leading-7 text-foreground" />
              </div>
            ) : (
              <div className="rounded-md bg-muted/25 px-3 py-10 text-center text-sm text-muted-foreground">
                {isRefreshing ? "正在生成摘要..." : "暂无摘要"}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
