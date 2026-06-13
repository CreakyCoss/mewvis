import { Activity, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatTraceTurn } from "../../types";
import {
  formatTraceTime,
  traceModeLabels,
  traceStatusClasses,
  traceStatusLabels,
} from "./trace-utils";

type TraceListPanelProps = {
  chatTrace: ChatTraceTurn[];
  orderedTrace: ChatTraceTurn[];
  selectedTraceTurn: ChatTraceTurn | null;
  onSelectTraceTurn: (turnId: string) => void;
  onClearSelection: () => void;
  onClearChatTrace: () => void;
};

export const TraceListPanel = ({
  chatTrace,
  orderedTrace,
  selectedTraceTurn,
  onSelectTraceTurn,
  onClearSelection,
  onClearChatTrace,
}: TraceListPanelProps) => (
  <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
    <div className="min-w-0 overflow-hidden p-3">
      <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Activity className="size-4" />
          <span className="shrink-0">链路日志</span>
          <span className="rounded-md bg-muted/70 px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {chatTrace.length}
          </span>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          title="清空日志"
          disabled={chatTrace.length === 0}
          onClick={() => {
            onClearSelection();
            onClearChatTrace();
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {orderedTrace.length === 0 ? (
        <div className="px-2 py-8 text-center text-sm text-muted-foreground">
          暂无链路日志
        </div>
      ) : (
        <div className="min-w-0 space-y-1 overflow-hidden">
          {orderedTrace.map((turn, turnIndex) => {
            const isSelected = turn.id === selectedTraceTurn?.id;

            return (
              <button
                key={turn.id}
                type="button"
                className="flex min-h-14 w-full min-w-0 items-center gap-2 rounded-md border border-transparent px-2 text-left transition-colors hover:bg-muted/45 data-[selected=true]:border-primary/20 data-[selected=true]:bg-primary/5"
                data-selected={isSelected}
                onClick={() => onSelectTraceTurn(turn.id)}
              >
                <span
                  className={[
                    "size-2 shrink-0 rounded-full",
                    traceStatusClasses[turn.status],
                  ].join(" ")}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-xs font-medium">
                      {traceModeLabels[turn.mode]} #{orderedTrace.length - turnIndex}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {traceStatusLabels[turn.status]}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {formatTraceTime(turn.createdAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                    {turn.userText}
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
