import type {
  StoryDocument,
  StoryDocumentIdentity,
  StoryProjectStructure,
} from "@story/project/types";
import {
  isJsonObject,
  storyDocumentData,
  storyDocumentKey,
} from "../../story-document";
import { createDocumentValue } from "../modules/structure";

export type Chapter = {
  key: string;
  id: string;
  number: number;
  title: string;
  volumeId: string;
  plan?: StoryDocument;
  record?: StoryDocument;
  content?: StoryDocument;
};
export type Passage = {
  chapterKey: string;
  start: number;
  end: number;
  text: string;
};
export type WritingRequest = {
  chapterKey: string;
  chapterLabel: string;
  source: string;
  selection: Passage | null;
  action: string;
  plan?: unknown;
  document?: { ref: StoryDocumentIdentity; label: string; value: unknown };
};
export const wordCount = (text: string) =>
  Array.from(text.replace(/\s/g, "")).length;
export const manuscriptText = (document?: StoryDocument) => {
  const content = document && storyDocumentData(document)?.content;
  return typeof content === "string" ? content : "";
};
const idOf = (document?: StoryDocument) => document?.ref.identity.id ?? "";
const dataNumber = (document?: StoryDocument) =>
  Number(document && storyDocumentData(document)?.number) || 0;
export const chapterLabel = (chapter: Chapter) =>
  `第${chapter.number || "?"}章 · ${chapter.title || "未命名"}`;
export const documentRoles = (structure?: StoryProjectStructure | null) => ({
  plan: structure?.roles.chapterPlan ?? "story-chapter-plan",
  record: structure?.roles.chapterResult ?? "story-chapter",
  content: structure?.roles.chapterContent ?? "story-chapter-content",
  volume: structure?.roles.volume ?? "story-volume",
});

// The manuscript shares its ID with the result; the plan has an independent ID.
export function buildChapters(
  documents: StoryDocument[],
  structure?: StoryProjectStructure | null,
): Chapter[] {
  const roles = documentRoles(structure);
  const plans = documents.filter((d) => d.ref.kind === roles.plan);
  const contents = documents.filter((d) => d.ref.kind === roles.content);
  const usedPlans = new Set<StoryDocument>();
  const usedContents = new Set<StoryDocument>();
  const chapters: Chapter[] = documents
    .filter((d) => d.ref.kind === roles.record)
    .map((record) => {
      const data = storyDocumentData(record)!;
      const plan = plans.find((p) =>
        data.planId
          ? idOf(p) === data.planId
          : dataNumber(p) === dataNumber(record),
      );
      const content = contents.find((c) => idOf(c) === idOf(record));
      if (plan) usedPlans.add(plan);
      if (content) usedContents.add(content);
      return {
        key: storyDocumentKey(plan ?? record),
        id: idOf(record),
        number: dataNumber(record),
        title: String(
          data.title || (plan && storyDocumentData(plan)?.title) || "未命名",
        ),
        volumeId: String((plan && storyDocumentData(plan)?.volumeId) || ""),
        plan,
        record,
        content,
      };
    });
  for (const plan of plans.filter((p) => !usedPlans.has(p))) {
    const data = storyDocumentData(plan)!;
    const content = contents.find(
      (c) => !usedContents.has(c) && idOf(c) === idOf(plan),
    );
    if (content) usedContents.add(content);
    chapters.push({
      key: storyDocumentKey(plan),
      id: idOf(plan),
      number: dataNumber(plan),
      title: String(data.title || "未命名"),
      volumeId: String(data.volumeId || ""),
      plan,
      content,
    });
  }
  for (const content of contents.filter((c) => !usedContents.has(c))) {
    chapters.push({
      key: storyDocumentKey(content),
      id: idOf(content),
      number: 0,
      title: content.displayName,
      volumeId: "",
      content,
    });
  }
  return chapters.sort(
    (a, b) => a.number - b.number || a.key.localeCompare(b.key),
  );
}

type DocumentWrite = Pick<StoryDocument, "ref" | "value">;
const draftDocument = (
  structure: StoryProjectStructure,
  kind: string,
  id: string,
): DocumentWrite => {
  const schema = structure.schemas.documents[kind];
  if (!schema || schema.identityFields.some((f) => f !== "id"))
    throw new Error("当前故事类型不支持直接创建章节，请从资料中创建。");
  const value = createDocumentValue(
    schema.fields,
    structure.schemas.objectDefinitions,
  );
  if (!isJsonObject(value)) throw new Error("无法读取章节结构。");
  return { ref: { kind, identity: { id } }, value: { ...value, id } };
};
export function manuscriptWrites(
  structure: StoryProjectStructure,
  chapter: Chapter,
  text: string,
): DocumentWrite[] {
  const roles = documentRoles(structure);
  const content =
    chapter.content ?? draftDocument(structure, roles.content, chapter.id);
  const record =
    chapter.record ?? draftDocument(structure, roles.record, chapter.id);
  if (!isJsonObject(content.value) || !isJsonObject(record.value))
    throw new Error("章节格式无法编辑。");
  return [
    { ref: content.ref, value: { ...content.value, content: text } },
    {
      ref: record.ref,
      value: {
        ...record.value,
        number: chapter.number,
        title: chapter.title,
        planId: String(record.value.planId || idOf(chapter.plan)),
        wordCount: wordCount(text),
      },
    },
  ];
}
export function newChapterWrites(
  structure: StoryProjectStructure,
  documents: StoryDocument[],
  id: string,
  title: string,
): DocumentWrite[] {
  const chapterTitle = title.trim();
  if (!chapterTitle) throw new Error("请输入章节标题。");
  const roles = documentRoles(structure);
  const number =
    Math.max(0, ...buildChapters(documents, structure).map((c) => c.number)) +
    1;
  const volumes = documents
    .filter((d) => d.ref.kind === roles.volume)
    .sort((a, b) => dataNumber(a) - dataNumber(b));
  const volume =
    volumes.at(-1) ?? draftDocument(structure, roles.volume, `volume-${id}`);
  if (!isJsonObject(volume.value)) throw new Error("无法读取分卷。");
  const draftPlan = draftDocument(structure, roles.plan, id);
  if (!isJsonObject(draftPlan.value)) throw new Error("无法创建细纲。");
  const plan = {
    ...draftPlan,
    value: {
      ...draftPlan.value,
      number,
      title: chapterTitle,
      volumeId: volume.ref.identity.id,
    },
  };
  const chapter: Chapter = {
    key: storyDocumentKey(plan),
    id,
    number,
    title: chapterTitle,
    volumeId: volume.ref.identity.id,
    plan: { ...plan, displayName: "", updatedAt: null },
  };
  return [
    {
      ref: volume.ref,
      value: {
        ...volume.value,
        number: Number(volume.value.number) || 1,
        title: String(volume.value.title || "第一卷"),
        startChapter: Number(volume.value.startChapter) || number,
        endChapter: Math.max(Number(volume.value.endChapter) || number, number),
        chapterIds: [
          ...(Array.isArray(volume.value.chapterIds)
            ? volume.value.chapterIds
            : []),
          id,
        ],
      },
    },
    plan,
    ...manuscriptWrites(structure, chapter, ""),
  ];
}

export function renameChapterWrites(
  chapter: Chapter,
  title: string,
): DocumentWrite[] {
  const chapterTitle = title.trim();
  if (!chapterTitle) throw new Error("请输入章节标题。");
  const writes: DocumentWrite[] = [];
  for (const document of [chapter.plan, chapter.record]) {
    if (!document) continue;
    if (!isJsonObject(document.value)) throw new Error("章节格式无法编辑。");
    writes.push({
      ref: document.ref,
      value: { ...document.value, title: chapterTitle },
    });
  }
  if (!writes.length) throw new Error("找不到可编辑的章节信息。");
  return writes;
}

export const selectionValid = (text: string, passage: Passage) =>
  Number.isInteger(passage.start) &&
  Number.isInteger(passage.end) &&
  passage.start >= 0 &&
  passage.end > passage.start &&
  text.slice(passage.start, passage.end) === passage.text;
export function applySuggestion(
  chapterKey: string,
  text: string,
  request: WritingRequest,
  suggestion: string,
): string {
  if (chapterKey !== request.chapterKey)
    throw new Error(`请回到${request.chapterLabel}后采用。`);
  if (request.selection) {
    if (
      request.selection.chapterKey !== chapterKey ||
      !selectionValid(text, request.selection)
    )
      throw new Error("原文已变化，请重新选中并生成建议。");
    return (
      text.slice(0, request.selection.start) +
      suggestion +
      text.slice(request.selection.end)
    );
  }
  if (text !== request.source)
    throw new Error("正文已变化，请根据当前正文重新生成建议。");
  return text + (text.trim() ? "\n\n" : "") + suggestion;
}

const contextMarker = "\n\n<mewvis-writing-context>\n";
export const encodeWritingRequest = (text: string, request: WritingRequest) =>
  text + contextMarker + JSON.stringify(request) + "\n</mewvis-writing-context>";
export const conversationTitle = (title: string) =>
  title.split(/<mewvis-writing/)[0].trim() || "未命名会话";
export function decodeWritingRequest(text: string): {
  text: string;
  request?: WritingRequest;
} {
  const start = text.lastIndexOf(contextMarker);
  if (start < 0 || !text.endsWith("\n</mewvis-writing-context>")) return { text };
  try {
    const request = JSON.parse(
      text.slice(
        start + contextMarker.length,
        -"\n</mewvis-writing-context>".length,
      ),
    );
    if (
      typeof request.chapterKey !== "string" ||
      typeof request.chapterLabel !== "string" ||
      typeof request.source !== "string" ||
      (request.selection !== null &&
        (!request.selection ||
          !selectionValid(request.source, request.selection)))
    )
      return { text };
    return { text: text.slice(0, start), request };
  } catch {
    return { text };
  }
}
export function parseSuggestion(text: string) {
  const match = /```story-suggestion\r?\n([\s\S]*?)\r?\n```/.exec(text);
  return match
    ? {
        explanation: (
          text.slice(0, match.index) + text.slice(match.index + match[0].length)
        ).trim(),
        suggestion: match[1],
      }
    : { explanation: text, suggestion: null };
}
export const sameDocument = (
  a: StoryDocumentIdentity,
  b: StoryDocumentIdentity,
) => storyDocumentKey({ ref: a }) === storyDocumentKey({ ref: b });
