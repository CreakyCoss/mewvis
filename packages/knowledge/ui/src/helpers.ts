import {
  KnowledgeError,
  type KnowledgeDocument,
  type KnowledgeSearchHit,
  type KnowledgeTextDocument,
  type KnowledgePage,
  type KnowledgePageInput,
} from "@mewvis/knowledge-sdk";

export const activeStates = new Set(["queued", "running", "cancelling"]);
export const jobLabels: Record<string, string> = {
  queued: "排队中",
  running: "执行中",
  cancelling: "取消中",
  succeeded: "已完成",
  partially_succeeded: "部分成功",
  failed: "失败",
  cancelled: "已取消",
};
export const kindLabels: Record<string, string> = {
  import: "导入文档",
  "delete-documents": "删除文档",
  "delete-base": "删除知识库",
  reindex: "重建索引",
};
export const baseLabels: Record<string, string> = {
  empty: "待导入",
  indexing: "处理中",
  ready: "可检索",
  degraded: "需注意",
  unavailable: "不可用",
};
export const modeLabels: Record<string, string> = {
  auto: "自动选择",
  keyword: "关键词检索",
  vector: "向量检索",
  hybrid: "混合检索",
};
export function errorText(error: unknown): string {
  if (error instanceof KnowledgeError)
    return (
      (
        {
          INVALID_ARGUMENT: "内容或参数不符合要求，请检查后再试。",
          UNAUTHENTICATED: "请先连接知识库服务。",
          PERMISSION_DENIED: "没有执行此操作的权限。",
          NOT_FOUND: "资料已不存在，请刷新列表。",
          CONFLICT:
            "资料已存在，或操作与当前状态冲突。请检查重复处理方式和正在运行的任务。",
          NOT_SUPPORTED: "当前服务暂不支持此操作。",
          NOT_READY: "资料尚未准备好，请查看索引状态。",
          RATE_LIMITED: "请求过于频繁，请稍后重试。",
          UNAVAILABLE: "服务暂时不可用，请检查连接。",
          TIMEOUT: "请求超时，结果尚未确认。请先查看任务，避免重复提交。",
          ABORTED: "请求已停止，已提交的任务可能仍在执行。",
          INVALID_RESPONSE: "服务返回了无效结果，请重试或检查服务版本。",
          TRANSPORT_ERROR:
            "连接中断，操作结果可能尚未确认。请检查服务和任务状态。",
          INTERNAL_ERROR: "操作未完成，请查看服务状态后重试。",
        } as Record<string, string>
      )[error.code] ?? "操作未完成。"
    );
  return error instanceof Error ? error.message : "操作未完成，请重试。";
}
export function formatTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? `今天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`
    : date.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}
export function locationText(
  hit: Pick<KnowledgeSearchHit, "location">,
): string {
  const location = hit.location;
  if (!location) return "来源片段";
  const parts = [
    location.page ? `第 ${location.page} 页` : "",
    location.section?.join(" / ") ?? "",
    location.lines ? `第 ${location.lines.start}–${location.lines.end} 行` : "",
  ].filter(Boolean);
  return parts.join(" · ") || "来源片段";
}
/** Highlight only a matching source snapshot; never apply offsets from an old document revision. */
export function evidenceRange(
  document: KnowledgeDocument,
  hit?: KnowledgeSearchHit,
): { start: number; end: number } | undefined {
  if (
    !hit ||
    hit.knowledgeBaseId !== document.knowledgeBaseId ||
    hit.documentId !== document.id ||
    (hit.documentRevision !== undefined &&
      hit.documentRevision !== document.revision)
  )
    return;
  const range = hit.location?.characters;
  if (!range) return;
  const characters = Array.from(document.text);
  if (
    range.start < 0 ||
    range.end > characters.length ||
    range.end <= range.start ||
    characters.slice(range.start, range.end).join("") !== hit.text
  )
    return;
  return range;
}

export async function digestText(text: string): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw new Error(
      "当前环境不支持内容校验，请使用 HTTPS 或本机地址打开页面。",
    );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function parseTextFile(
  file: File,
  signal: AbortSignal,
): Promise<KnowledgeTextDocument> {
  if (!/\.(txt|md|markdown)$/i.test(file.name))
    throw new Error("当前支持 TXT 和 Markdown 文件，其他格式请先转换为文本。");
  if (file.size > 8 * 1024 * 1024)
    throw new Error("单个文件最多 8 MiB，请拆分后导入。");
  signal.throwIfAborted();
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
  } catch {
    throw new Error("文件不是有效的 UTF-8 文本，请转换编码后重试。");
  }
  signal.throwIfAborted();
  if (!text.trim()) throw new Error("文件没有可导入的正文。");
  const sha256 = await digestText(text);
  signal.throwIfAborted();
  return {
    title: file.name.split(/[\\/]/).at(-1) || "未命名文档",
    text,
    externalId: `text-sha256:${sha256}`,
    source: {
      uri: `urn:sha256:${sha256}`,
      mediaType: /\.(md|markdown)$/i.test(file.name)
        ? "text/markdown"
        : "text/plain",
    },
  };
}

/** Loads only explicitly requested pages; clients retain opaque cursors rather than synthesizing offsets. */
export type PageLoader<T> = (
  input: KnowledgePageInput,
  signal: AbortSignal,
) => Promise<KnowledgePage<T>>;
