import type {
  KnowledgeChunk,
  KnowledgeTextDocument,
} from "@mewvis/knowledge-sdk";
import { hash } from "../util.js";

const cjk =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;
const stop = new Set(Array.from("的了是在和与请问我你他她它这那有吗呢么什"));
/** Shared index/query normalization. CJK unigrams and bigrams preserve short names and natural questions. */
export function tokens(text: string, query = false): string[] {
  const expanded = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(cjk, (run) => {
      const chars = Array.from(run),
        words: string[] = [];
      for (let i = 0; i < chars.length; i++) {
        if (!query || !stop.has(chars[i]!)) words.push(chars[i]!);
        if (
          i + 1 < chars.length &&
          (!query || (!stop.has(chars[i]!) && !stop.has(chars[i + 1]!)))
        )
          words.push(chars[i]! + chars[i + 1]!);
      }
      return ` ${words.join(" ")} `;
    });
  const result = expanded.match(/[\p{L}\p{N}_]+/gu) ?? [];
  return query ? [...new Set(result)].slice(0, 64) : result;
}
export const matchQuery = (query: string) =>
  tokens(query, true)
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(" OR ");

export interface Chunking {
  maxCharacters: number;
  overlapCharacters: number;
}
export function splitDocument(
  document: KnowledgeTextDocument,
  baseId: string,
  documentId: string,
  chunking: Chunking,
): { revision: string; chunks: KnowledgeChunk[] } {
  const revision = hash(document),
    chunkRevision = hash({ revision, chunking, pipeline: 2 }).slice(0, 24);
  const chars = Array.from(document.text),
    chunks: KnowledgeChunk[] = [];
  const lineOffsets = [0];
  chars.forEach((char, i) => {
    if (char === "\n") lineOffsets.push(i + 1);
  });
  const lineAt = (offset: number) => {
    let left = 0,
      right = lineOffsets.length;
    while (left < right) {
      const mid = (left + right) >>> 1;
      if (lineOffsets[mid]! <= offset) left = mid + 1;
      else right = mid;
    }
    return left;
  };
  for (let start = 0; start < chars.length;) {
    const pageStart =
      document.locations?.find(
        (range) => range.start > start && range.location.page !== undefined,
      )?.start ?? chars.length;
    const pageEnd =
      document.locations?.find(
        (range) =>
          range.start <= start &&
          start < range.end &&
          range.location.page !== undefined,
      )?.end ?? pageStart;
    const boundaryEnd = Math.min(pageStart, pageEnd);
    let end = Math.min(
      chars.length,
      start + chunking.maxCharacters,
      boundaryEnd,
    );
    if (end < chars.length) {
      const minimum = start + Math.floor(chunking.maxCharacters * 0.6);
      for (const boundary of ["\n\r。！？；.!?;", " \t"]) {
        let found = false;
        for (let i = end; i > minimum; i--)
          if (boundary.includes(chars[i - 1]!)) {
            end = i;
            found = true;
            break;
          }
        if (found) break;
      }
    }
    let left = start,
      right = end;
    while (left < right && /\s/u.test(chars[left]!)) left++;
    while (right > left && /\s/u.test(chars[right - 1]!)) right--;
    if (right > left) {
      const mapping = document.locations?.find(
        (range) => range.start <= left && left < range.end,
      );
      const location = {
        ...(mapping?.location ?? {}),
        characters: { start: left, end: right },
        lines: mapping?.location.lines ?? {
          start: lineAt(left),
          end: lineAt(right - 1),
        },
      };
      chunks.push({
        id: `${documentId}:${chunkRevision}:${String(chunks.length).padStart(8, "0")}`,
        knowledgeBaseId: baseId,
        documentId,
        documentRevision: revision,
        ordinal: chunks.length,
        title: document.title,
        text: chars.slice(left, right).join(""),
        ...(document.source ? { source: document.source } : {}),
        ...(document.metadata ? { metadata: document.metadata } : {}),
        location,
      });
    }
    if (end === chars.length) break;
    start =
      end === boundaryEnd
        ? end
        : Math.max(start + 1, end - chunking.overlapCharacters);
  }
  return { revision, chunks };
}
