import type {
  ExtensionLedgerSnapshot,
  ExtensionSessionSnapshot,
} from "./contracts.js";
import type { ExtensionHostAdapter, ExtensionHostContext } from "./dispatch.js";
import { HostServiceError as ServiceError } from "./error.js";
import type { JsonObject } from "../shared.js";
const object = (value: unknown): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid session record");
  return value as JsonObject;
};

export interface SessionServices {
  readSession(target: ExtensionHostContext["target"]): Promise<unknown>;
  summarizeText?(text: string, context: ExtensionHostContext): Promise<string>;
}
const records = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? value.map((entry) => object(entry)) : [];
const ids = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string")
    : [];
const time = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const status = (value: unknown): "running" | "done" | "error" | null =>
  value === "running" || value === "done" || value === "error" ? value : null;

export function projectSession(value: unknown): ExtensionSessionSnapshot {
  const ledger = object(value);
  const messages = records(ledger.messages).filter(
    (item) =>
      (item.role === "user" || item.role === "assistant") &&
      (!item.metadata || object(item.metadata).scope !== "agent_private"),
  );
  const visible = new Set(messages.map((item) => item.messageRecordId));
  const runs = records(ledger.runtimeLinks).filter((item) =>
    ids(item.messageRecordIds).some((id) => visible.has(id)),
  );
  return {
    messages: messages.slice(-1000).map((item) => ({
      id: String(item.messageRecordId ?? ""),
      role: item.role as "user" | "assistant",
      text: String(item.content ?? "").slice(0, 8000),
      timestamp: time(item.timestamp) ?? 0,
    })),
    runs: runs.slice(-1000).map((item) => ({
      id: String(item.linkId ?? ""),
      status: status(item.status),
      startedAt: time(item.startedAt),
      endedAt: time(item.endedAt),
    })),
    truncated:
      messages.length > 1000 ||
      runs.length > 1000 ||
      messages.some((item) => String(item.content ?? "").length > 8000),
  };
}

/** Explicit diagnostic capability. No native paths or arbitrary metadata are returned. */
export function projectLedger(value: unknown): ExtensionLedgerSnapshot {
  const ledger = object(value);
  let truncated = false,
    budget = 500_000;
  const text = (value: unknown) => {
    const raw = typeof value === "string" ? value : "";
    const result = raw.slice(0, Math.min(24000, budget));
    budget -= result.length;
    truncated ||= result.length !== raw.length;
    return result;
  };
  const take = (value: unknown) => {
    const entries = records(value);
    truncated ||= entries.length > 500;
    return entries.slice(-500);
  };
  const messages = take(ledger.messages).map((item) => {
    const metadata = item.metadata ? object(item.metadata) : {};
    const tools = Object.fromEntries(
      [
        "toolCall",
        "toolCalls",
        "tool_call",
        "tool_calls",
        "toolResult",
        "toolResults",
        "tool_result",
        "tool_results",
      ]
        .filter((key) => metadata[key] !== undefined)
        .map((key) => [key, metadata[key]]),
    );
    return {
      id: String(item.messageRecordId ?? ""),
      role: String(item.role ?? "other"),
      text: text(item.content),
      timestamp: time(item.timestamp) ?? 0,
      ...(typeof metadata.thinking === "string"
        ? { thinking: text(metadata.thinking) }
        : {}),
      ...(Object.keys(tools).length
        ? { tools: text(JSON.stringify(tools, null, 2)) }
        : {}),
    };
  });
  const entries = (value: unknown) =>
    take(value).map((item) => ({
      id: String(item.recordId ?? ""),
      text: text(item.content),
      timestamp: time(item.timestamp) ?? 0,
    }));
  const runs = take(ledger.runtimeLinks).map((item) => ({
    id: String(item.linkId ?? ""),
    status: status(item.status),
    startedAt: time(item.startedAt),
    endedAt: time(item.endedAt),
    messageIds: [
      ...new Set(
        [
          item.systemMessageRecordId,
          item.userMessageRecordId,
          ...ids(item.assistantMessageRecordIds),
          ...ids(item.messageRecordIds),
        ].filter((id): id is string => typeof id === "string"),
      ),
    ],
    instructionIds: ids(item.runtimeInstructionRecordIds),
    contextIds: ids(item.requestContextRecordIds),
  }));
  const instructions = entries(ledger.runtimeInstructions),
    contexts = entries(ledger.requestContexts);
  const summary =
    text(
      ledger.displaySummary
        ? object(ledger.displaySummary).summary
        : ledger.summary,
    ) || null;
  return { messages, runs, instructions, contexts, summary, truncated };
}

/** Adapts existing session reads and stateless completion; it has no write or compact port. */
export function createSessionHostAdapter(
  services: SessionServices,
): ExtensionHostAdapter {
  return {
    "session.read": async (_input, { target }) =>
      projectSession(await services.readSession(target)),
    "session.ledger.read": async (_input, { target }) =>
      projectLedger(await services.readSession(target)),
    ...(services.summarizeText
      ? ({
          "session.summarize": async (input, context) => {
            const snapshot = projectLedger(
              await services.readSession(context.target),
            );
            context.signal.throwIfAborted();
            const scope = input.scope;
            const run =
              scope.kind === "run"
                ? snapshot.runs.find((item) => item.id === scope.runId)
                : undefined;
            if (scope.kind === "run" && !run)
              throw new ServiceError(
                404,
                "HOST_UNAVAILABLE",
                "运行记录不存在或已超出读取范围",
              );
            const messages = snapshot.messages.filter(
              (message) =>
                message.role !== "system" &&
                (!run || run.messageIds.includes(message.id)),
            );
            const source = messages
              .map((message) => `${message.role}: ${message.text}`)
              .join("\n\n");
            if (!source.trim())
              throw new ServiceError(
                400,
                "HOST_UNAVAILABLE",
                "没有可生成摘要的消息",
              );
            const limit = 48000;
            // Only this immutable snapshot is sent to completion. Nothing is appended or saved.
            const result = await services.summarizeText!(
              source.slice(-limit),
              context,
            );
            context.signal.throwIfAborted();
            if (!result.trim())
              throw new ServiceError(502, "HOST_FAILED", "模型未返回摘要内容");
            return {
              text: result,
              generatedAt: Date.now(),
              truncated: snapshot.truncated || source.length > limit,
            };
          },
        } satisfies ExtensionHostAdapter)
      : {}),
  };
}
