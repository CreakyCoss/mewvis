import type { StoryImportDraftInput } from "./import-draft";
import { firstNonEmpty } from "./import-bridge-utils";
import { normalizeWorldBookEntries } from "./import-normalizers";

export const looksLikeWorldBook = (value: Record<string, unknown>) =>
  "entries" in value || "lorebookEntries" in value || "worldBook" in value || "worldbook" in value;

export const createDraftFromWorldBook = (
  value: Record<string, unknown>,
  { isScript }: { isScript: boolean },
): StoryImportDraftInput | null => {
  if (!looksLikeWorldBook(value)) {
    return null;
  }

  const entries = [
    ...normalizeWorldBookEntries(value.entries),
    ...normalizeWorldBookEntries(value.lorebookEntries),
    ...normalizeWorldBookEntries(value.worldBook),
    ...normalizeWorldBookEntries(value.worldbook),
  ];
  if (entries.length === 0 || isScript) {
    return null;
  }

  return {
    mode: "lorebookPatch",
    sourceKind: "worldBook",
    label: firstNonEmpty(value.name, value.label, value.title, "导入世界书"),
    description: "由世界书 JSON 转换。",
    lorebookEntries: entries,
  };
};
