import { parentPort, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type {
  KnowledgeTextDocument,
  KnowledgeTextLocation,
} from "@mewvis/knowledge-sdk";

const input = workerData as {
  bytes: Uint8Array;
  fileName: string;
  externalId: string;
};
const pdfRoot = new URL("../", import.meta.resolve("pdfjs-dist/build/pdf.mjs"));
const task = getDocument({
  data: input.bytes,
  useWasm: false,
  disableFontFace: true,
  useSystemFonts: true,
  cMapUrl: fileURLToPath(new URL("cmaps/", pdfRoot)),
  cMapPacked: true,
  standardFontDataUrl: fileURLToPath(new URL("standard_fonts/", pdfRoot)),
  stopAtErrors: true,
});
try {
  const pdf = await task.promise;
  if (pdf.numPages > 500)
    throw new Error("PDF 最多支持 500 页，请拆分后导入。");
  const pages: string[] = [],
    locations: KnowledgeTextLocation[] = [];
  let offset = 0,
    emptyPages = 0;
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number),
      content = await page.getTextContent();
    let text = "";
    for (const item of content.items)
      if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
    text = text.trim();
    page.cleanup();
    if (!text) emptyPages++;
    const start = offset,
      length = Array.from(text).length;
    offset += length;
    if (offset > 2_000_000)
      throw new Error("PDF 正文超过 200 万字，请拆分后导入。");
    if (length)
      locations.push({ start, end: offset, location: { page: number } });
    pages.push(text);
    if (number < pdf.numPages) offset += 2;
  }
  if (emptyPages === pdf.numPages) {
    parentPort!.postMessage({
      error: {
        code: "NOT_SUPPORTED",
        message: "PDF 没有可提取文字，可能是扫描件；OCR 已预留，尚未实现。",
      },
    });
  } else {
    const document: KnowledgeTextDocument = {
      title: input.fileName,
      externalId: input.externalId,
      text: pages.join("\n\n"),
      locations,
      metadata: {
        parser: "pdfjs",
        parserVersion: 1,
        pageCount: pdf.numPages,
        emptyPages,
      },
    };
    parentPort!.postMessage({ document });
  }
} catch (error) {
  const reason = error as Error;
  parentPort!.postMessage({
    error: {
      code: "INVALID_ARGUMENT",
      message:
        reason.name === "PasswordException"
          ? "PDF 受密码保护，请先解除密码后导入。"
          : reason.message.startsWith("PDF ")
            ? reason.message
            : "PDF 解析失败，文件可能已损坏。",
    },
  });
} finally {
  await task.destroy();
}
