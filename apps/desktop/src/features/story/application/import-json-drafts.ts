import type { StoryImportDraftInput } from "./import-draft";
import { isRecord } from "./import-bridge-utils";
import {
  createDraftFromCharacterCard,
  looksLikeCharacterCard,
} from "./import-json-character-card";
import {
  createDraftFromScript,
  looksLikeScript,
} from "./import-json-script";
import {
  createDraftFromStandardStory,
  looksLikeStandardStory,
} from "./import-json-standard-story";
import { createDraftFromWorldBook } from "./import-json-worldbook";

export const createStoryImportDraftInputFromJsonValue = (
  value: unknown,
): StoryImportDraftInput => {
  if (!isRecord(value)) {
    throw new Error("导入内容必须是 JSON 对象。");
  }

  if (looksLikeCharacterCard(value)) {
    return createDraftFromCharacterCard(value);
  }

  const worldBookDraft = createDraftFromWorldBook(value, {
    isScript: looksLikeScript(value),
  });
  if (worldBookDraft) {
    return worldBookDraft;
  }

  const standardDraft = looksLikeStandardStory(value)
    ? createDraftFromStandardStory(value)
    : null;
  if (standardDraft) {
    return standardDraft;
  }

  if (looksLikeScript(value)) {
    return createDraftFromScript(value);
  }

  throw new Error("导入 JSON 没有可识别的故事、角色、场景或世界书内容。");
};
