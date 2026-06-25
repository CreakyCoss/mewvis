import {
  createStoryImportDraft,
  type StoryImportDraft,
  type StoryImportSourceKind,
} from "./import-draft";
import { createStoryImportDraftInputFromJsonValue } from "./import-json-drafts";
import { parseJsonObject } from "./import-bridge-utils";

const createDraftFromPlainText = (
  raw: string,
  sourceKind: StoryImportSourceKind = "plainText",
): StoryImportDraft => {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines[0] ?? "导入故事";
  const title = firstLine.replace(/^#+\s*/, "").slice(0, 80) || "导入故事";
  const content = raw.trim();

  return createStoryImportDraft({
    sourceKind,
    label: title,
    description: "由纯文本转换。",
    story: {
      title,
      outline: content,
      goal: "",
      userPersonaName: "我",
    },
    scenes: content
      ? [{
          id: "scene-main",
          title: "文本稿起点",
          scene: content,
          goal: "",
          plot: "",
          direction: "",
          transition: "",
          memory: "",
          characterIds: [],
          lorebookEntries: [],
        }]
      : [],
  });
};

export const createStoryImportDraftFromJsonValue = (
  value: unknown,
): StoryImportDraft => createStoryImportDraft(
  createStoryImportDraftInputFromJsonValue(value),
);

export const createStoryImportDraftFromText = (
  raw: string,
  {
    sourceKind,
  }: {
    sourceKind?: StoryImportSourceKind;
  } = {},
): StoryImportDraft => {
  const content = raw.trim();
  if (!content) {
    throw new Error("导入内容不能为空。");
  }

  if (sourceKind !== "plainText") {
    try {
      return createStoryImportDraftFromJsonValue(parseJsonObject(content));
    } catch (error) {
      if (sourceKind === "json") {
        throw error;
      }
    }
  }

  return createDraftFromPlainText(content, sourceKind ?? "plainText");
};
