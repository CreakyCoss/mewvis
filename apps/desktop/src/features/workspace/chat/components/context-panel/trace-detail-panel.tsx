import { ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ChatTraceTurn } from "../../types";
import {
  formatTraceDuration,
  formatTraceTime,
  getTraceStepDisplayStatus,
  traceJson,
  traceModeLabels,
  traceStatusClasses,
  traceStatusLabels,
  traceStepStatusClasses,
  traceStepStatusLabels,
} from "./trace-utils";

type TraceDetailPanelProps = {
  selectedTraceTurn: ChatTraceTurn | null;
  isActive: boolean;
  onClose: () => void;
};

export const TraceDetailPanel = ({
  selectedTraceTurn,
  isActive,
  onClose,
}: TraceDetailPanelProps) => {
  if (!selectedTraceTurn || !isActive) {
    return null;
  }

  return (
    <aside className="fixed bottom-0 left-[clamp(216px,22vw,288px)] right-[clamp(280px,28vw,420px)] top-12 z-30 flex min-w-0 flex-col overflow-hidden border-x border-border/60 bg-background text-foreground shadow-[-18px_0_34px_-30px_rgb(15_23_42_/_0.45)] max-[719px]:left-0">
      <div className="border-b border-border/60 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={[
              "size-2 shrink-0 rounded-full",
              traceStatusClasses[selectedTraceTurn.status],
            ].join(" ")}
          />
          <h2 className="min-w-0 flex-1 truncate text-base font-medium">
            {traceModeLabels[selectedTraceTurn.mode]}链路
          </h2>
          <span className="shrink-0 rounded-sm bg-muted/70 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {traceStatusLabels[selectedTraceTurn.status]}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="关闭详情"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {selectedTraceTurn.userText}
        </p>
        <div className="mt-2 flex min-w-0 flex-wrap gap-1.5 text-[11px] text-muted-foreground">
          <span className="rounded-sm bg-muted/45 px-1.5 py-1 font-mono">
            {formatTraceTime(selectedTraceTurn.createdAt)}
          </span>
          {selectedTraceTurn.providerName && (
            <span className="max-w-full truncate rounded-sm bg-muted/45 px-1.5 py-1">
              {selectedTraceTurn.providerName}
            </span>
          )}
          {selectedTraceTurn.modelName && (
            <span className="max-w-full truncate rounded-sm bg-muted/45 px-1.5 py-1">
              {selectedTraceTurn.modelName}
            </span>
          )}
          {selectedTraceTurn.agentSessionId && (
            <span className="max-w-full truncate rounded-sm bg-muted/45 px-1.5 py-1 font-mono">
              {selectedTraceTurn.agentSessionId}
            </span>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="min-w-0 space-y-2 overflow-hidden px-5 py-4">
          {selectedTraceTurn.steps.map((step) => {
            const duration = formatTraceDuration(step.durationMs);
            const displayStatus = getTraceStepDisplayStatus(
              selectedTraceTurn.status,
              step.status,
            );
            const hasPayloads = Boolean(step.payloads?.length);
            const hasMetadata = Object.keys(step.metadata ?? {}).length > 0;
            const shouldOpenContent = Boolean(step.content);
            const hasDetails = Boolean(
              step.content ||
                hasPayloads ||
                hasMetadata,
            );

            return (
              <details
                key={step.id}
                className="group min-w-0 overflow-hidden rounded-md border border-border/60 bg-background/70 open:bg-muted/20"
              >
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-xs transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      displayStatus
                        ? traceStepStatusClasses[displayStatus]
                        : "bg-muted-foreground/45",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{step.label}</span>
                  {displayStatus && (
                    <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {traceStepStatusLabels[displayStatus]}
                    </span>
                  )}
                  {duration && (
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {duration}
                    </span>
                  )}
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>

                {hasDetails && (
                  <div className="min-w-0 space-y-2 border-t border-border/50 p-3">
                    {step.content && (
                      <details
                        open={shouldOpenContent}
                        className="group/content min-w-0 overflow-hidden rounded-md bg-muted/35"
                      >
                        <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
                          <ChevronRight className="size-3.5 shrink-0 transition-transform group-open/content:rotate-90" />
                          <span className="min-w-0 flex-1 truncate">内容</span>
                        </summary>
                        <pre className="min-w-0 whitespace-pre-wrap break-words px-3 pb-3 font-mono text-xs leading-5 text-foreground">
                          {step.content}
                        </pre>
                      </details>
                    )}
                    {step.payloads?.map((payload) => (
                      <details
                        key={`${step.id}-${payload.label}`}
                        className="group/payload min-w-0 overflow-hidden rounded-md bg-muted/35"
                      >
                        <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
                          <ChevronRight className="size-3.5 shrink-0 transition-transform group-open/payload:rotate-90" />
                          <span className="min-w-0 flex-1 truncate">
                            {payload.sourceLabel ? `${payload.sourceLabel} · ` : ""}
                            {payload.label}
                          </span>
                        </summary>
                        <pre className="min-w-0 whitespace-pre-wrap break-words px-3 pb-3 font-mono text-xs leading-5 text-foreground">
                          {payload.content}
                        </pre>
                      </details>
                    ))}
                    {hasMetadata && (
                      <details className="group/metadata min-w-0 overflow-hidden rounded-md bg-muted/25">
                        <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
                          <ChevronRight className="size-3.5 shrink-0 transition-transform group-open/metadata:rotate-90" />
                          <span className="min-w-0 flex-1 truncate">metadata</span>
                        </summary>
                        <pre className="min-w-0 whitespace-pre-wrap break-words px-3 pb-3 font-mono text-xs leading-5 text-muted-foreground">
                          {traceJson(step.metadata)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </details>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
};
