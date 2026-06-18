import { ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  LedgerResult,
  LedgerRuntimeLink,
} from "./types";
import {
  formatLedgerDuration,
  formatLedgerTime,
  ledgerJson,
  ledgerStatusClasses,
  ledgerStatusLabels,
} from "./utils";

type LedgerDetailProps = {
  selectedLink: LedgerRuntimeLink | null;
  ledger: LedgerResult | null;
  onClose: () => void;
};

const compact = (value?: string | null) => value?.trim() || "未记录";

const formatTimestamp = (value?: number | null) =>
  value ? new Date(value).toLocaleString() : "未记录";

const durationFor = (link: LedgerRuntimeLink) => {
  if (!link.startedAt || !link.endedAt) {
    return "";
  }
  return formatLedgerDuration(Math.max(0, link.endedAt - link.startedAt));
};

const relatedMessagesFor = (
  ledger: LedgerResult | null,
  recordIds: string[],
) => {
  const idSet = new Set(recordIds);
  return (ledger?.messages ?? []).filter((message) =>
    idSet.has(message.messageRecordId)
  );
};

const DetailRows = ({
  rows,
}: {
  rows: Array<[string, string | number | null | undefined]>;
}) => (
  <div className="grid grid-cols-2 gap-2">
    {rows.map(([label, value]) => (
      <div key={label} className="min-w-0 rounded-md bg-muted/30 px-3 py-2">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="mt-0.5 truncate text-xs font-medium" title={String(value ?? "")}>
          {value || "未记录"}
        </div>
      </div>
    ))}
  </div>
);

const IdList = ({
  title,
  ids,
}: {
  title: string;
  ids: string[];
}) => (
  <details className="group min-w-0 overflow-hidden rounded-md border border-border/60 bg-background/70">
    <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-xs transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
      <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
      <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
        {ids.length}
      </span>
    </summary>
    <pre className="min-w-0 whitespace-pre-wrap break-words border-t border-border/50 px-3 py-2 font-mono text-xs leading-5 text-muted-foreground">
      {ids.length ? ids.join("\n") : "（空）"}
    </pre>
  </details>
);

export const LedgerDetail = ({
  selectedLink,
  ledger,
  onClose,
}: LedgerDetailProps) => {
  if (!selectedLink) {
    return null;
  }

  const status = selectedLink.status ?? "done";
  const relatedMessages = relatedMessagesFor(ledger, selectedLink.messageRecordIds);
  const duration = durationFor(selectedLink);

  return (
    <aside className="fixed bottom-0 left-[clamp(216px,22vw,288px)] right-[clamp(280px,28vw,420px)] top-12 z-30 flex min-w-0 flex-col overflow-hidden border-x border-border/60 bg-background text-foreground shadow-[-18px_0_34px_-30px_rgb(15_23_42_/_0.45)] max-[719px]:left-0">
      <div className="border-b border-border/60 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={[
              "size-2 shrink-0 rounded-full",
              ledgerStatusClasses[status],
            ].join(" ")}
          />
          <h2 className="min-w-0 flex-1 truncate text-base font-medium">
            {selectedLink.agentRoleId || selectedLink.runtime || "运行链路"}
          </h2>
          <span className="shrink-0 rounded-sm bg-muted/70 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {ledgerStatusLabels[status]}
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
        <div className="mt-2 flex min-w-0 flex-wrap gap-1.5 text-[11px] text-muted-foreground">
          <span className="rounded-sm bg-muted/45 px-1.5 py-1 font-mono">
            {selectedLink.startedAt
              ? formatLedgerTime(selectedLink.startedAt)
              : "未记录时间"}
          </span>
          {duration && (
            <span className="rounded-sm bg-muted/45 px-1.5 py-1 font-mono">
              {duration}
            </span>
          )}
          {selectedLink.runtimeId && (
            <span className="max-w-full truncate rounded-sm bg-muted/45 px-1.5 py-1">
              {selectedLink.runtimeId}
            </span>
          )}
          {selectedLink.agentSessionId && (
            <span className="max-w-full truncate rounded-sm bg-muted/45 px-1.5 py-1 font-mono">
              {selectedLink.agentSessionId}
            </span>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="min-w-0 space-y-3 overflow-hidden px-5 py-4">
          <DetailRows
            rows={[
              ["linkId", compact(selectedLink.linkId)],
              ["agentRoleId", compact(selectedLink.agentRoleId)],
              ["runId", compact(selectedLink.runId)],
              ["taskId", compact(selectedLink.taskId)],
              ["streamId", compact(selectedLink.streamId)],
              ["turnId", compact(selectedLink.turnId)],
              ["开始", formatTimestamp(selectedLink.startedAt)],
              ["结束", formatTimestamp(selectedLink.endedAt)],
            ]}
          />

          <div className="space-y-2">
            <IdList title="消息记录" ids={selectedLink.messageRecordIds} />
            <IdList title="助手消息" ids={selectedLink.assistantMessageRecordIds} />
            <IdList title="请求上下文" ids={selectedLink.requestContextRecordIds} />
            <IdList title="运行指令" ids={selectedLink.runtimeInstructionRecordIds} />
          </div>

          <details className="group min-w-0 overflow-hidden rounded-md border border-border/60 bg-background/70" open>
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-xs transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
              <span className="min-w-0 flex-1 truncate font-medium">相关消息</span>
              <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {relatedMessages.length}
              </span>
            </summary>
            <div className="min-w-0 space-y-2 border-t border-border/50 p-3">
              {relatedMessages.length ? relatedMessages.map((message) => (
                <div
                  key={message.messageRecordId}
                  className="min-w-0 rounded-md bg-muted/30 p-3"
                >
                  <div className="mb-2 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="shrink-0 rounded-sm bg-background/70 px-1.5 py-0.5 font-medium">
                      {message.role}
                    </span>
                    <span className="min-w-0 truncate font-mono">
                      {message.messageRecordId}
                    </span>
                  </div>
                  <pre className="max-h-72 min-w-0 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground">
                    {message.content || "（空）"}
                  </pre>
                </div>
              )) : (
                <div className="rounded-md bg-muted/25 px-3 py-6 text-center text-xs text-muted-foreground">
                  当前读取结果中没有匹配的消息内容。
                </div>
              )}
            </div>
          </details>

          <details className="group min-w-0 overflow-hidden rounded-md border border-border/60 bg-background/70">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-xs transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
              <span className="min-w-0 flex-1 truncate font-medium">原始结构</span>
            </summary>
            <pre className="min-w-0 whitespace-pre-wrap break-words border-t border-border/50 px-3 py-2 font-mono text-xs leading-5 text-muted-foreground">
              {ledgerJson(selectedLink)}
            </pre>
          </details>
        </div>
      </ScrollArea>
    </aside>
  );
};
