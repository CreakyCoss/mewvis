import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import {
  KnowledgeError,
  type KnowledgeTextDocument,
} from "@mewvis/knowledge-sdk";

export const parserFormats = [
  { extensions: ["pdf"], implemented: true },
  { extensions: ["txt", "md", "markdown"], implemented: true },
  { extensions: ["docx", "doc", "xlsx", "pptx"], implemented: false },
] as const;
export async function parseOriginal(
  fileName: string,
  bytes: Uint8Array,
  signal: AbortSignal,
): Promise<KnowledgeTextDocument> {
  signal.throwIfAborted();
  if (bytes.byteLength > 32 * 1024 * 1024)
    throw new KnowledgeError({
      code: "INVALID_ARGUMENT",
      message: "单个原件最多 32 MiB。",
    });
  const extension = fileName.split(".").at(-1)?.toLowerCase();
  const externalId = `original-sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (["txt", "md", "markdown"].includes(extension ?? "")) {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new KnowledgeError({
        code: "INVALID_ARGUMENT",
        message: "文本文件需要使用 UTF-8 编码。",
      });
    }
    if (!text.trim() || Array.from(text).length > 2_000_000)
      throw new KnowledgeError({
        code: "INVALID_ARGUMENT",
        message: "正文为空或超过 200 万字，请检查资料。",
      });
    return { title: fileName, text, externalId };
  }
  if (extension !== "pdf")
    throw new KnowledgeError({
      code: "NOT_SUPPORTED",
      message: "当前支持 PDF、TXT 和 Markdown；DOCX 等格式已预留，尚未实现。",
    });
  if (
    !new TextDecoder("latin1").decode(bytes.subarray(0, 1024)).includes("%PDF-")
  )
    throw new KnowledgeError({
      code: "INVALID_ARGUMENT",
      message: "文件不是有效的 PDF。",
    });
  return new Promise((resolve, reject) => {
    const data = Uint8Array.from(bytes);
    const worker = new Worker(new URL("./pdf-worker.js", import.meta.url), {
      workerData: { bytes: data, fileName, externalId },
      transferList: [data.buffer],
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    let settled = false;
    const finish = (error?: unknown, document?: KnowledgeTextDocument) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      void worker.terminate();
      if (error) reject(error);
      else resolve(document!);
    };
    const abort = () =>
      finish(
        new KnowledgeError({ code: "ABORTED", message: "PDF 解析已取消。" }),
      );
    const timer = setTimeout(
      () =>
        finish(
          new KnowledgeError({
            code: "TIMEOUT",
            message: "PDF 解析超过 30 秒，请拆分文件后重试。",
          }),
        ),
      30000,
    );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    worker.once(
      "message",
      (message: {
        document?: KnowledgeTextDocument;
        error?: { code: "INVALID_ARGUMENT" | "NOT_SUPPORTED"; message: string };
      }) => {
        if (message.error) finish(new KnowledgeError(message.error));
        else if (message.document) finish(undefined, message.document);
        else
          finish(
            new KnowledgeError({
              code: "INVALID_RESPONSE",
              message: "PDF 解析结果无效。",
            }),
          );
      },
    );
    worker.once("error", () =>
      finish(
        new KnowledgeError({
          code: "INVALID_ARGUMENT",
          message: "PDF 解析失败，文件可能损坏或超出处理限制。",
        }),
      ),
    );
    worker.once("exit", () => {
      if (!settled)
        finish(
          new KnowledgeError({
            code: "INVALID_ARGUMENT",
            message: "PDF 解析未完成。",
          }),
        );
    });
  });
}
