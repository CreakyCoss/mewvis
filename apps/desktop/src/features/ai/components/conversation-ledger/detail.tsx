import { ChevronRight, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MarkdownContent } from "@/features/ai/components/markdown";
import type { LedgerAuxiliaryEntry, LedgerMessage, LedgerResult, LedgerRuntimeLink } from "./types";
import {
  formatLedgerId,
  formatLedgerDateTime,
  formatLedgerDuration,
  formatLedgerRole,
  ledgerJson,
  ledgerStatusClasses,
  ledgerStatusLabels,
  previewLedgerText,
} from "./utils";

type LedgerDetailProps = {
  selectedLink: LedgerRuntimeLink | null;
  ledger: LedgerResult | null;
  onClose: () => void;
};

const durationFor = (link: LedgerRuntimeLink) => {
  if (!link.startedAt || !link.endedAt) {
    return "";
  }
  return formatLedgerDuration(Math.max(0, link.endedAt - link.startedAt));
};

const relatedMessagesFor = (ledger: LedgerResult | null, recordIds: string[]) => {
  const idSet = new Set(recordIds);
  return (ledger?.messages ?? []).filter((message) => idSet.has(message.messageRecordId));
};

const relatedEntriesFor = (entries: LedgerAuxiliaryEntry[] | undefined, recordIds: string[]) => {
  const entryById = new Map((entries ?? []).map((entry) => [entry.recordId, entry]));
  return recordIds
    .map((recordId) => entryById.get(recordId) ?? null)
    .filter((entry): entry is LedgerAuxiliaryEntry => entry !== null);
};

const messageByRole = (messages: LedgerMessage[], role: string) => messages.filter((message) => message.role === role);

const metadataText = (metadata: Record<string, unknown> | null | undefined, key: string) => {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
};

const formatUnknown = (value: unknown) => {
  if (typeof value === "string") {
    return value.trim();
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const toolMetadataKeys = [
  "toolCall",
  "toolCalls",
  "tool_call",
  "tool_calls",
  "toolResult",
  "toolResults",
  "tool_result",
  "tool_results",
  "functionCall",
  "functionCalls",
  "function_call",
  "function_calls",
];

const thinkingBlocksFor = (messages: LedgerMessage[]) =>
  messages
    .map((message, index) => ({
      id: `${message.messageRecordId}-thinking-${index}`,
      title: `${formatLedgerRole(message.role)}思考`,
      content: metadataText(message.metadata, "thinking"),
    }))
    .filter((item) => item.content);

const toolBlocksFor = (messages: LedgerMessage[]) =>
  messages.flatMap((message, messageIndex) => {
    const blocks =
      message.role === "tool" && message.content.trim()
        ? [
            {
              id: `${message.messageRecordId}-tool-content`,
              title: "工具消息",
              content: message.content.trim(),
            },
          ]
        : [];

    const metadataBlocks = toolMetadataKeys.flatMap((key) => {
      if (!message.metadata || !(key in message.metadata)) {
        return [];
      }
      const content = formatUnknown(message.metadata[key]);
      return content
        ? [
            {
              id: `${message.messageRecordId}-${key}-${messageIndex}`,
              title: key,
              content,
            },
          ]
        : [];
    });

    return [...blocks, ...metadataBlocks];
  });

const DetailRows = ({ rows }: { rows: Array<[string, string | number | null | undefined]> }) => (
  <div className="grid grid-cols-4 gap-2 max-lg:grid-cols-2 max-sm:grid-cols-1">
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

const CollapsibleSection = ({
  children,
  count,
  defaultOpen = true,
  title,
}: {
  children: ReactNode;
  count?: number;
  defaultOpen?: boolean;
  title: string;
}) => (
  <details
    className="group min-w-0 overflow-hidden rounded-md border border-border/60 bg-background/70"
    open={defaultOpen}
  >
    <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-xs transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
      <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
      {count !== undefined && (
        <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{count}</span>
      )}
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
    </summary>
    <div className="min-w-0 space-y-2 border-t border-border/50 p-3">{children}</div>
  </details>
);

const MessageCard = ({ message }: { message: LedgerMessage }) => (
  <div className="min-w-0 rounded-md bg-muted/25 p-3">
    <div className="mb-2 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
      <span className="shrink-0 rounded-sm bg-background/80 px-1.5 py-0.5 font-medium">
        {formatLedgerRole(message.role)}
      </span>
      <span className="shrink-0">{formatLedgerDateTime(message.timestamp)}</span>
    </div>
    {message.content ? (
      <MarkdownContent content={message.content} className="max-h-72 overflow-auto text-xs leading-6 text-foreground" />
    ) : (
      <div className="text-xs text-muted-foreground">（空）</div>
    )}
  </div>
);

const TextBlockSection = ({
  title,
  emptyText,
  blocks,
  defaultOpen,
  markdown = false,
}: {
  title: string;
  emptyText: string;
  blocks: Array<{
    content: string;
    id: string;
    title: string;
  }>;
  defaultOpen?: boolean;
  markdown?: boolean;
}) => (
  <CollapsibleSection title={title} count={blocks.length} defaultOpen={defaultOpen ?? blocks.length > 0}>
    {blocks.length ? (
      <div className="min-w-0 space-y-2">
        {blocks.map((block) => (
          <div key={block.id} className="min-w-0 rounded-md bg-muted/25 p-3">
            <div className="mb-2 text-[11px] font-medium text-muted-foreground">{block.title}</div>
            {markdown ? (
              <MarkdownContent content={block.content} className="text-xs leading-6 text-foreground" />
            ) : (
              <pre className="max-h-80 min-w-0 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-foreground">
                {block.content}
              </pre>
            )}
          </div>
        ))}
      </div>
    ) : (
      <div className="rounded-md bg-muted/25 px-3 py-6 text-center text-xs text-muted-foreground">{emptyText}</div>
    )}
  </CollapsibleSection>
);

const AuxiliaryEntrySection = ({
  title,
  emptyText,
  entries,
  defaultOpen,
}: {
  title: string;
  emptyText: string;
  entries: LedgerAuxiliaryEntry[];
  defaultOpen?: boolean;
}) => (
  <CollapsibleSection title={title} count={entries.length} defaultOpen={defaultOpen ?? entries.length > 0}>
    {entries.length ? (
      <div className="min-w-0 space-y-2">
        {entries.map((entry, index) => (
          <div key={entry.recordId} className="min-w-0 rounded-md bg-muted/25 p-3">
            <div className="mb-2 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
              <span className="shrink-0 rounded-sm bg-background/80 px-1.5 py-0.5 font-medium">#{index + 1}</span>
              <span className="shrink-0">{formatLedgerDateTime(entry.timestamp)}</span>
              <span className="min-w-0 truncate font-mono">{formatLedgerId(entry.recordId)}</span>
            </div>
            <pre className="max-h-96 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/50 px-3 py-2.5 font-mono text-[11px] leading-5 text-foreground">
              {entry.content || "（空）"}
            </pre>
          </div>
        ))}
      </div>
    ) : (
      <div className="rounded-md bg-muted/25 px-3 py-6 text-center text-xs text-muted-foreground">{emptyText}</div>
    )}
  </CollapsibleSection>
);

const MessageSection = ({
  title,
  emptyText,
  messages,
  defaultOpen = true,
}: {
  title: string;
  emptyText: string;
  messages: LedgerMessage[];
  defaultOpen?: boolean;
}) => (
  <CollapsibleSection title={title} count={messages.length} defaultOpen={defaultOpen}>
    {messages.length ? (
      <div className="min-w-0 space-y-2">
        {messages.map((message) => (
          <MessageCard key={message.messageRecordId} message={message} />
        ))}
      </div>
    ) : (
      <div className="rounded-md bg-muted/25 px-3 py-6 text-center text-xs text-muted-foreground">{emptyText}</div>
    )}
  </CollapsibleSection>
);

const DebugIdList = ({ title, ids }: { title: string; ids: string[] }) => (
  <div className="min-w-0 rounded-md bg-muted/25 px-3 py-2">
    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
      <span>{title}</span>
      <span>{ids.length}</span>
    </div>
    <pre className="min-w-0 whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-muted-foreground">
      {ids.length ? ids.map(formatLedgerId).join("\n") : "（空）"}
    </pre>
  </div>
);

export const LedgerDetail = ({ selectedLink, ledger, onClose }: LedgerDetailProps) => {
  if (!selectedLink) {
    return null;
  }

  const status = selectedLink.status ?? "done";
  const relatedMessages = relatedMessagesFor(ledger, selectedLink.messageRecordIds);
  const runtimeInstructionEntries = relatedEntriesFor(
    ledger?.runtimeInstructions,
    selectedLink.runtimeInstructionRecordIds,
  );
  const requestContextEntries = relatedEntriesFor(ledger?.requestContexts, selectedLink.requestContextRecordIds);
  const userMessages = messageByRole(relatedMessages, "user");
  const assistantMessages = messageByRole(relatedMessages, "assistant");
  const systemMessages = messageByRole(relatedMessages, "system");
  const toolMessages = messageByRole(relatedMessages, "tool");
  const otherMessages = relatedMessages.filter(
    (message) =>
      message.role !== "user" && message.role !== "assistant" && message.role !== "system" && message.role !== "tool",
  );
  const thinkingBlocks = thinkingBlocksFor(assistantMessages);
  const toolBlocks = toolBlocksFor(relatedMessages);
  const duration = durationFor(selectedLink);
  const titlePreview = previewLedgerText(userMessages[0]?.content, 96);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="flex h-[min(780px,86vh)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0 sm:max-w-4xl lg:max-w-5xl"
        showCloseButton={false}
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className={["size-2 shrink-0 rounded-full", ledgerStatusClasses[status]].join(" ")} />
            <DialogTitle className="min-w-0 flex-1 truncate text-base">链路详情</DialogTitle>
            <span className="shrink-0 rounded-sm bg-muted/70 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {ledgerStatusLabels[status]}
            </span>
            <Button type="button" size="icon-sm" variant="ghost" title="关闭详情" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
          <DialogDescription className="truncate">{titlePreview || "本次运行没有记录用户消息"}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 space-y-4 px-5 pt-4 pb-10">
            <DetailRows
              rows={[
                ["开始时间", formatLedgerDateTime(selectedLink.startedAt)],
                ["结束时间", formatLedgerDateTime(selectedLink.endedAt)],
                ["耗时", duration],
                ["关联消息", relatedMessages.length],
                ["助手回复", assistantMessages.length],
                ["思考", thinkingBlocks.length],
                ["工具记录", toolBlocks.length || toolMessages.length],
                ["状态", ledgerStatusLabels[status]],
              ]}
            />

            <AuxiliaryEntrySection
              title="运行指令（实际提示词）"
              emptyText="当前链路没有记录运行指令。"
              entries={runtimeInstructionEntries}
            />
            <AuxiliaryEntrySection
              title="请求上下文（包装后）"
              emptyText="当前链路没有记录请求上下文。"
              entries={requestContextEntries}
            />
            <TextBlockSection
              title="思考内容"
              emptyText="当前链路没有记录思考内容。"
              blocks={thinkingBlocks}
              markdown
            />
            <TextBlockSection title="工具调用" emptyText="当前链路数据没有记录工具调用明细。" blocks={toolBlocks} />
            {systemMessages.length > 0 && (
              <MessageSection
                title="系统消息"
                emptyText="没有记录系统消息"
                messages={systemMessages}
                defaultOpen={false}
              />
            )}
            <MessageSection title="用户消息" emptyText="没有记录用户消息" messages={userMessages} />
            <MessageSection
              title="助手回复"
              emptyText={status === "running" ? "回复生成中" : "没有记录助手回复"}
              messages={assistantMessages}
            />

            {otherMessages.length > 0 && (
              <CollapsibleSection title="其他消息" count={otherMessages.length} defaultOpen={false}>
                {otherMessages.map((message) => (
                  <MessageCard key={message.messageRecordId} message={message} />
                ))}
              </CollapsibleSection>
            )}

            <CollapsibleSection title="调试信息" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                <DebugIdList title="消息记录" ids={selectedLink.messageRecordIds} />
                <DebugIdList title="助手消息" ids={selectedLink.assistantMessageRecordIds} />
                <DebugIdList title="请求上下文" ids={selectedLink.requestContextRecordIds} />
                <DebugIdList title="运行指令" ids={selectedLink.runtimeInstructionRecordIds} />
              </div>
              <pre className="min-w-0 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/25 px-3 py-2 font-mono text-[11px] leading-5 text-muted-foreground">
                {ledgerJson(selectedLink)}
              </pre>
            </CollapsibleSection>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
