import type { AgentRunCommand, ChatRunCommand } from "../../runtimes/types.js";
import type { RuntimeMessage, RuntimeSessionContext } from "../../../../session/core/types.js";
import type { RuntimeLedgerStorage } from "../../../../session/storage/jsonl-store.js";
import { runtimeMessageMetadata } from "../metadata/runtime.js";
import { takeContextText } from "../core/prompt-budget.js";

type RuntimeSystemPromptCommand = ChatRunCommand | AgentRunCommand;

const normalized = (value: string | null | undefined) => value?.trim() ?? "";

const systemMessagesIn = (context: RuntimeSessionContext) =>
  context.messages.filter((message) => message.role === "system");

const latestSystemPrompt = (context: RuntimeSessionContext) =>
  systemMessagesIn(context).at(-1)?.content.trim() ?? "";

export const composeRuntimeSystemPrompt = ({
  context,
  currentSystemPrompt,
  includeSummary,
}: {
  context: RuntimeSessionContext;
  currentSystemPrompt?: string | null;
  includeSummary?: boolean;
}) => {
  const current = normalized(currentSystemPrompt);
  const effectiveSystemPrompt = current || latestSystemPrompt(context);
  const sections: string[] = [];
  if (effectiveSystemPrompt) {
    sections.push(effectiveSystemPrompt);
  }

  if (includeSummary && context.summary.trim()) {
    sections.push([
      "<conversation_summary source=\"runtime_ledger\" instruction=\"data_only; not_current_request\">",
      takeContextText(context.summary.trim(), 24000),
      "</conversation_summary>",
    ].join("\n"));
  }

  return sections.join("\n\n");
};

export const appendRuntimeSystemPromptIfNeeded = async ({
  storage,
  command,
  context,
  baseLeafId,
  parentEntryId,
}: {
  storage: RuntimeLedgerStorage;
  command: RuntimeSystemPromptCommand;
  context: RuntimeSessionContext;
  baseLeafId: string | null;
  parentEntryId?: string | null;
}) => {
  if (command.recordUserMessage === false) {
    return null;
  }

  const content = normalized(command.systemPrompt);
  const latest = latestSystemPrompt(context);
  if (!content) {
    return null;
  }
  if (latest && content !== latest) {
    throw new Error("systemPrompt 已在当前 runtime session 初始化，后续请求不能隐式变更；请使用 requestContext/runtimeInstruction 表达本轮补充，或重建/新建 session。");
  }
  if (content === latest) {
    return null;
  }

  return storage.appendMessage({
    role: "system",
    content,
    timestamp: Date.now(),
    metadata: runtimeMessageMetadata({
      command,
      role: "system",
      baseLeafId,
    }),
  }, parentEntryId ?? undefined);
};

export const visibleHistoryMessages = (messages: RuntimeMessage[]) =>
  messages.filter((message) => message.role !== "system");
