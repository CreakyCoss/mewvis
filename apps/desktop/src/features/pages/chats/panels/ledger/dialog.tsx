import type { ReactNode } from "react";
import { ChevronRightIcon, XIcon } from "lucide-react";
import type { LedgerAuxiliaryEntry, LedgerMessage, LedgerResult, LedgerRuntimeLink } from "@/api/conversation-ledger";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

type LedgerDialogProps = {
  ledger: LedgerResult | null;
  link: LedgerRuntimeLink | null;
  onClose: () => void;
};

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

const roleLabel: Record<string, string> = {
  system: "系统",
  user: "用户",
  assistant: "助手",
  tool: "工具",
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

const formatDateTime = (timestamp?: number | null) => {
  if (!timestamp) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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

const formatUnknown = (value: unknown) => {
  if (typeof value === "string") {
    return value.trim();
  }

  try {
    return JSON.stringify(value, null, 2) ?? String(value ?? "");
  } catch {
    return String(value ?? "");
  }
};

const formatId = (id: string) => (id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id);

const relatedMessages = (ledger: LedgerResult | null, link: LedgerRuntimeLink) => {
  const ids = new Set(
    [
      link.systemMessageRecordId,
      link.userMessageRecordId,
      ...link.assistantMessageRecordIds,
      ...link.messageRecordIds,
    ].filter((id): id is string => Boolean(id)),
  );

  return (ledger?.messages ?? []).filter((message) => ids.has(message.messageRecordId));
};

const relatedEntries = (entries: LedgerAuxiliaryEntry[] | undefined, recordIds: string[]) => {
  const entriesById = new Map((entries ?? []).map((entry) => [entry.recordId, entry]));
  return recordIds
    .map((recordId) => entriesById.get(recordId) ?? null)
    .filter((entry): entry is LedgerAuxiliaryEntry => entry !== null);
};

const messagesByRole = (messages: LedgerMessage[], role: string) => messages.filter((message) => message.role === role);

const thinkingBlocks = (messages: LedgerMessage[]) =>
  messages.flatMap((message, index) => {
    const content = message.metadata?.thinking;
    return typeof content === "string" && content.trim()
      ? [
          {
            id: `${message.messageRecordId}:thinking:${index}`,
            title: `${roleLabel[message.role] ?? message.role}思考`,
            content: content.trim(),
          },
        ]
      : [];
  });

const toolBlocks = (messages: LedgerMessage[]) =>
  messages.flatMap((message, messageIndex) => {
    const messageBlocks =
      message.role === "tool" && message.content.trim()
        ? [
            {
              id: `${message.messageRecordId}:tool`,
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
              id: `${message.messageRecordId}:${key}:${messageIndex}`,
              title: key,
              content,
            },
          ]
        : [];
    });

    return [...messageBlocks, ...metadataBlocks];
  });

const DetailRows = ({ rows }: { rows: Array<[string, string | number | null | undefined]> }) => (
  <div className="grid grid-cols-4 gap-2 max-lg:grid-cols-2 max-sm:grid-cols-1">
    {rows.map(([label, value]) => (
      <div key={label} className="min-w-0 rounded-lg border border-border/60 bg-surface-raised/70 px-3 py-2.5">
        <div className="text-xs text-muted-foreground">{label}</div>
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
  <details className="app-panel group min-w-0 overflow-hidden rounded-xl" open={defaultOpen}>
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3.5 text-xs transition-colors hover:bg-muted/35 focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none">
      <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
      {count !== undefined ? (
        <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{count}</span>
      ) : null}
      <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none group-open:rotate-90" />
    </summary>
    <div className="min-w-0 space-y-2 border-t border-border/50 bg-surface/30 p-3">{children}</div>
  </details>
);

const EmptyContent = ({ children }: { children: string }) => (
  <div className="app-empty-state rounded-lg px-3 py-6 text-center text-xs text-muted-foreground">{children}</div>
);

const MessageCard = ({ message }: { message: LedgerMessage }) => (
  <div className="min-w-0 rounded-lg border border-border/55 bg-surface-raised/60 p-3">
    <div className="mb-2 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <span className="shrink-0 rounded-sm bg-background/80 px-1.5 py-0.5 font-medium">
        {roleLabel[message.role] ?? message.role}
      </span>
      <span className="shrink-0">{formatDateTime(message.timestamp)}</span>
      <span className="min-w-0 truncate font-mono" title={message.messageRecordId}>
        {formatId(message.messageRecordId)}
      </span>
    </div>
    {message.content ? (
      <div className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-foreground [overflow-wrap:anywhere]">
        {message.content}
      </div>
    ) : (
      <div className="text-xs text-muted-foreground">（空）</div>
    )}
  </div>
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
    {messages.length > 0 ? (
      messages.map((message) => <MessageCard key={message.messageRecordId} message={message} />)
    ) : (
      <EmptyContent>{emptyText}</EmptyContent>
    )}
  </CollapsibleSection>
);

const AuxiliarySection = ({
  title,
  emptyText,
  entries,
}: {
  title: string;
  emptyText: string;
  entries: LedgerAuxiliaryEntry[];
}) => (
  <CollapsibleSection title={title} count={entries.length} defaultOpen={entries.length > 0}>
    {entries.length > 0 ? (
      entries.map((entry, index) => (
        <div key={entry.recordId} className="min-w-0 rounded-lg border border-border/55 bg-surface-raised/60 p-3">
          <div className="mb-2 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0 rounded-sm bg-background/80 px-1.5 py-0.5 font-medium">#{index + 1}</span>
            <span className="shrink-0">{formatDateTime(entry.timestamp)}</span>
            <span className="min-w-0 truncate font-mono" title={entry.recordId}>
              {formatId(entry.recordId)}
            </span>
          </div>
          <pre className="max-h-96 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/45 bg-background/50 px-3 py-2.5 font-mono text-xs leading-5 text-foreground">
            {entry.content || "（空）"}
          </pre>
        </div>
      ))
    ) : (
      <EmptyContent>{emptyText}</EmptyContent>
    )}
  </CollapsibleSection>
);

const BlockSection = ({
  title,
  emptyText,
  blocks,
}: {
  title: string;
  emptyText: string;
  blocks: Array<{ id: string; title: string; content: string }>;
}) => (
  <CollapsibleSection title={title} count={blocks.length} defaultOpen={blocks.length > 0}>
    {blocks.length > 0 ? (
      blocks.map((block) => (
        <div key={block.id} className="min-w-0 rounded-lg border border-border/55 bg-surface-raised/60 p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">{block.title}</div>
          <pre className="max-h-80 min-w-0 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground">
            {block.content}
          </pre>
        </div>
      ))
    ) : (
      <EmptyContent>{emptyText}</EmptyContent>
    )}
  </CollapsibleSection>
);

const DebugIds = ({ title, ids }: { title: string; ids: string[] }) => (
  <div className="min-w-0 rounded-lg border border-border/55 bg-surface-raised/60 px-3 py-2">
    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{title}</span>
      <span>{ids.length}</span>
    </div>
    <pre className="min-w-0 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-muted-foreground">
      {ids.length > 0 ? ids.map(formatId).join("\n") : "（空）"}
    </pre>
  </div>
);

export const LedgerDialog = ({ ledger, link, onClose }: LedgerDialogProps) => {
  if (!link) {
    return null;
  }

  const status = link.status ?? "done";
  const messages = relatedMessages(ledger, link);
  const systemMessages = messagesByRole(messages, "system");
  const userMessages = messagesByRole(messages, "user");
  const assistantMessages = messagesByRole(messages, "assistant");
  const otherMessages = messages.filter((message) => !["system", "user", "assistant", "tool"].includes(message.role));
  const thoughts = thinkingBlocks(assistantMessages);
  const tools = toolBlocks(messages);
  const runtimeInstructions = relatedEntries(ledger?.runtimeInstructions, link.runtimeInstructionRecordIds);
  const requestContexts = relatedEntries(ledger?.requestContexts, link.requestContextRecordIds);

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
        className="!flex h-[min(780px,86vh)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl lg:max-w-5xl"
        showCloseButton={false}
      >
        <DialogHeader className="shrink-0 border-b border-border/60 bg-surface-raised/85 px-5 py-4 text-left">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`size-2 shrink-0 rounded-full ${statusClass[status]}`} />
            <DialogTitle className="min-w-0 flex-1 truncate text-base">链路详情</DialogTitle>
            <span className="shrink-0 rounded-md bg-muted/70 px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {statusLabel[status]}
            </span>
            <Button type="button" size="icon-sm" variant="ghost" title="关闭详情" onClick={onClose}>
              <XIcon className="size-4" />
            </Button>
          </div>
          <DialogDescription className="truncate">
            {preview(userMessages[0]?.content, 96) || "本次运行没有记录用户消息"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="app-canvas min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 space-y-4 px-5 pt-4 pb-10">
            <DetailRows
              rows={[
                ["开始时间", formatDateTime(link.startedAt)],
                ["结束时间", formatDateTime(link.endedAt)],
                ["耗时", formatDuration(link)],
                ["关联消息", messages.length],
                ["助手回复", assistantMessages.length],
                ["思考", thoughts.length],
                ["工具记录", tools.length],
                ["状态", statusLabel[status]],
              ]}
            />

            <AuxiliarySection
              title="运行指令（实际提示词）"
              emptyText="当前链路没有记录运行指令。"
              entries={runtimeInstructions}
            />
            <AuxiliarySection
              title="请求上下文（包装后）"
              emptyText="当前链路没有记录请求上下文。"
              entries={requestContexts}
            />
            <BlockSection title="思考内容" emptyText="当前链路没有记录思考内容。" blocks={thoughts} />
            <BlockSection title="工具调用" emptyText="当前链路没有记录工具调用明细。" blocks={tools} />

            {systemMessages.length > 0 ? (
              <MessageSection
                title="系统消息"
                emptyText="没有记录系统消息"
                messages={systemMessages}
                defaultOpen={false}
              />
            ) : null}
            <MessageSection title="用户消息" emptyText="没有记录用户消息" messages={userMessages} />
            <MessageSection
              title="助手回复"
              emptyText={status === "running" ? "回复生成中" : "没有记录助手回复"}
              messages={assistantMessages}
            />
            {otherMessages.length > 0 ? (
              <MessageSection title="其他消息" emptyText="没有其他消息" messages={otherMessages} defaultOpen={false} />
            ) : null}

            <CollapsibleSection title="调试信息" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                <DebugIds title="消息记录" ids={link.messageRecordIds} />
                <DebugIds title="助手消息" ids={link.assistantMessageRecordIds} />
                <DebugIds title="请求上下文" ids={link.requestContextRecordIds} />
                <DebugIds title="运行指令" ids={link.runtimeInstructionRecordIds} />
              </div>
              <pre className="max-h-72 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/55 bg-surface-raised/60 px-3 py-2 font-mono text-xs leading-5 text-muted-foreground">
                {JSON.stringify(link, null, 2)}
              </pre>
            </CollapsibleSection>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
