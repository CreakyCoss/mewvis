import type { RuntimeModelInput } from "../../contracts/model.js";
import { resolveRuntime } from "../../runtimes/resolver.js";
import type { ChatRunCommand } from "../../runtimes/types.js";
import type { RuntimeLedgerEntry, RuntimeSessionContext } from "../../../../session/core/types.js";

export type DisplaySummaryGenerationResult = {
  summary: string;
  runtimeId: string;
  modelId: string | null;
  sourceCharCount: number;
  chunkCount: number;
  llmCallCount: number;
};

type SummaryBudget = {
  chunkChars: number;
  maxSummaryChars: number;
};

const DEFAULT_CONTEXT_WINDOW = 128000;
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MAX_SUMMARY_CHARS = 6000;
const MAX_RECURSION_DEPTH = 4;

const SUMMARY_SYSTEM_PROMPT = [
  "你是 agent-runtime 的会话展示摘要生成器。",
  "你的输出只用于前端展示，不参与后续模型上下文、重建或压缩。",
  "只基于用户提供的会话账本内容摘要，不编造未出现的信息。",
  "保留关键用户意图、助手结论、重要运行链路、编辑/删除/重建等事件。",
  "如果内容包含私密角色信息，按账本事实客观概括，不把摘要写成某个角色可见的上下文。",
].join("\n");

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const createSummaryBudget = (
  model: RuntimeModelInput | null | undefined,
  maxSummaryChars?: number | null,
): SummaryBudget => {
  const contextWindow = model?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const maxTokens = model?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const reserveTokens = Math.min(
    Math.max(maxTokens + 4096, 8192),
    Math.max(8192, Math.floor(contextWindow * 0.45)),
  );
  const usableTokens = Math.max(4096, contextWindow - reserveTokens);
  const chunkChars = clamp(Math.floor(usableTokens * 2.2), 8000, 160000);

  return {
    chunkChars,
    maxSummaryChars: clamp(
      Math.floor(maxSummaryChars ?? DEFAULT_MAX_SUMMARY_CHARS),
      1000,
      32000,
    ),
  };
};

const compactJson = (value: unknown, maxChars = 1200) => {
  try {
    const text = JSON.stringify(value);
    return text.length > maxChars
      ? `${text.slice(0, maxChars)}...[truncated]`
      : text;
  } catch {
    return "[unserializable]";
  }
};

const trimSummary = (summary: string, maxChars: number) => {
  const normalized = summary.trim();
  return normalized.length <= maxChars
    ? normalized
    : `${normalized.slice(0, maxChars).trimEnd()}\n\n[摘要已按展示长度预算截断]`;
};

const splitText = (text: string, maxChars: number) => {
  if (text.length <= maxChars) {
    return [text];
  }

  const chunks: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    const hardEnd = Math.min(text.length, offset + maxChars);
    let end = hardEnd;
    if (hardEnd < text.length) {
      const newlineIndex = text.lastIndexOf("\n\n", hardEnd);
      if (newlineIndex > offset + Math.floor(maxChars * 0.5)) {
        end = newlineIndex + 2;
      }
    }
    chunks.push(text.slice(offset, end));
    offset = end;
  }
  return chunks;
};

const entryHeader = (entry: RuntimeLedgerEntry) =>
  `[entry id=${entry.id} type=${entry.type} parent=${entry.parentId ?? "null"} timestamp=${entry.timestamp}]`;

const renderEntry = (entry: RuntimeLedgerEntry) => {
  if (entry.type === "leaf") {
    return "";
  }
  if (entry.type === "custom" && entry.customType === "display_summary") {
    return "";
  }
  if (entry.type === "message") {
    return [
      entryHeader(entry),
      `<message role="${entry.message.role}" metadata=${compactJson(entry.message.metadata ?? null)}>`,
      entry.message.content,
      "</message>",
    ].join("\n");
  }
  if (entry.type === "request_context") {
    return [
      entryHeader(entry),
      `<request_context metadata=${compactJson(entry.metadata ?? null)}>`,
      entry.content,
      "</request_context>",
    ].join("\n");
  }
  if (entry.type === "runtime_instruction") {
    return [
      entryHeader(entry),
      `<runtime_instruction metadata=${compactJson(entry.metadata ?? null)}>`,
      entry.content,
      "</runtime_instruction>",
    ].join("\n");
  }
  if (entry.type === "branch_summary") {
    return [
      entryHeader(entry),
      `<branch_summary from="${entry.fromId}">`,
      entry.summary,
      "</branch_summary>",
    ].join("\n");
  }
  if (entry.type === "custom") {
    return [
      entryHeader(entry),
      `<custom customType="${entry.customType}">`,
      compactJson(entry.data ?? null),
      "</custom>",
    ].join("\n");
  }
  return "";
};

const renderSummarySource = (context: RuntimeSessionContext) =>
  context.entries
    .map(renderEntry)
    .filter((section) => section.trim())
    .join("\n\n");

const buildSummaryUserPrompt = (input: {
  source: string;
  summaryInstruction?: string | null;
  maxSummaryChars: number;
  mode: "chunk" | "final";
  chunkIndex?: number;
  chunkCount?: number;
}) => {
  const sections = [
    input.mode === "chunk"
      ? `请摘要以下会话账本分块（${input.chunkIndex}/${input.chunkCount}）。`
      : "请生成当前分支的展示摘要。",
    input.summaryInstruction?.trim()
      ? [
        "<summary_instruction>",
        input.summaryInstruction.trim(),
        "</summary_instruction>",
      ].join("\n")
      : "",
    [
      "<output_requirements>",
      `控制在 ${input.maxSummaryChars} 个中文字符以内。`,
      "使用简洁中文；可以用短段落或项目符号。",
      "必须区分用户消息、助手回复、request_context、runtime_instruction、运行/重建/压缩事件。",
      "不要输出 XML 标签，不要添加账本外信息。",
      "</output_requirements>",
    ].join("\n"),
    "<session_ledger_source>",
    input.source,
    "</session_ledger_source>",
  ];

  return sections.filter((section) => section.trim()).join("\n\n");
};

export const generateDisplaySummary = async (input: {
  context: RuntimeSessionContext;
  agentId?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  summaryInstruction?: string | null;
  maxSummaryChars?: number | null;
}): Promise<DisplaySummaryGenerationResult> => {
  const { runtimeId, implementation } = resolveRuntime("chat", input.agentId);
  const budget = createSummaryBudget(input.runtimeModel, input.maxSummaryChars);
  const source = renderSummarySource(input.context);
  if (!source.trim()) {
    return {
      summary: "当前会话没有可摘要内容。",
      runtimeId,
      modelId: input.runtimeModel?.modelId ?? null,
      sourceCharCount: 0,
      chunkCount: 0,
      llmCallCount: 0,
    };
  }

  let llmCallCount = 0;
  const summarizeText = async (
    text: string,
    mode: "chunk" | "final",
    depth = 0,
  ): Promise<{ summary: string; chunkCount: number }> => {
    const chunks = splitText(text, budget.chunkChars);
    if (chunks.length === 1) {
      llmCallCount += 1;
      const command: ChatRunCommand = {
        type: "chat",
        requestId: null,
        agentId: input.agentId ?? null,
        workspacePath: null,
        sessionRootDir: null,
        stream: false,
        runtimeModel: input.runtimeModel ?? null,
        systemPrompt: SUMMARY_SYSTEM_PROMPT,
        userMessage: null,
        requestContext: null,
        runtimeInstruction: null,
        bootstrapInstruction: null,
        messages: [{
          role: "user",
          content: buildSummaryUserPrompt({
            source: chunks[0],
            summaryInstruction: input.summaryInstruction,
            maxSummaryChars: budget.maxSummaryChars,
            mode,
          }),
        }],
      };
      const result = await implementation.chat(command, {
        emit: () => {},
        maxRetries: 0,
      });
      return {
        summary: trimSummary(result.text, budget.maxSummaryChars),
        chunkCount: 1,
      };
    }

    const chunkSummaries: string[] = [];
    for (const [index, chunk] of chunks.entries()) {
      llmCallCount += 1;
      const command: ChatRunCommand = {
        type: "chat",
        requestId: null,
        agentId: input.agentId ?? null,
        workspacePath: null,
        sessionRootDir: null,
        stream: false,
        runtimeModel: input.runtimeModel ?? null,
        systemPrompt: SUMMARY_SYSTEM_PROMPT,
        userMessage: null,
        requestContext: null,
        runtimeInstruction: null,
        bootstrapInstruction: null,
        messages: [{
          role: "user",
          content: buildSummaryUserPrompt({
            source: chunk,
            summaryInstruction: input.summaryInstruction,
            maxSummaryChars: Math.max(1000, Math.floor(budget.maxSummaryChars * 0.75)),
            mode: "chunk",
            chunkIndex: index + 1,
            chunkCount: chunks.length,
          }),
        }],
      };
      const result = await implementation.chat(command, {
        emit: () => {},
        maxRetries: 0,
      });
      chunkSummaries.push(
        `# 分块 ${index + 1}/${chunks.length}\n${trimSummary(result.text, budget.maxSummaryChars)}`,
      );
    }

    const combined = chunkSummaries.join("\n\n");
    if (combined.length > budget.chunkChars && depth < MAX_RECURSION_DEPTH) {
      const recursive = await summarizeText(combined, "final", depth + 1);
      return {
        summary: recursive.summary,
        chunkCount: chunks.length + recursive.chunkCount,
      };
    }
    if (combined.length > budget.chunkChars) {
      return {
        summary: trimSummary(combined, budget.maxSummaryChars),
        chunkCount: chunks.length,
      };
    }

    const final = await summarizeText(combined, "final", depth + 1);
    return {
      summary: final.summary,
      chunkCount: chunks.length,
    };
  };

  const result = await summarizeText(source, "final");
  return {
    summary: result.summary,
    runtimeId,
    modelId: input.runtimeModel?.modelId ?? null,
    sourceCharCount: source.length,
    chunkCount: result.chunkCount,
    llmCallCount,
  };
};
