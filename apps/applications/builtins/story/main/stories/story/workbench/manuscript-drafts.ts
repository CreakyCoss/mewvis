import type { Chapter } from "./model";
import { buildChapters, manuscriptText, manuscriptWrites } from "./model";
import type {
  StoryDocument,
  StoryProjectStructure,
} from "@story/project/types";

type Draft = {
  chapter: Chapter;
  text: string;
  saved: string;
  error: boolean;
  savingText?: string;
};
type Writer = (
  build: (
    documents: StoryDocument[],
    structure: StoryProjectStructure,
  ) => Pick<StoryDocument, "ref" | "value">[],
) => Promise<StoryDocument[] | null>;
export function createManuscriptDrafts(
  write: Writer,
  currentWorkspace: () => string | undefined,
  notify: () => void,
) {
  const drafts = new Map<string, Draft>();
  let saving: Promise<boolean> | null = null;
  const flush = async (): Promise<boolean> => {
    if (saving) {
      if (!(await saving)) return false;
      return flush();
    }
    const path = currentWorkspace();
    const pending = [...drafts.values()].filter((d) => d.text !== d.saved);
    if (!pending.length) return true;
    const operation = (async () => {
      for (const entry of pending) {
        if (currentWorkspace() !== path) return false;
        const text = entry.text;
        const saved = entry.saved;
        entry.savingText = text;
        const result = await write((documents, structure) => {
          const chapter = buildChapters(documents, structure).find(
            (c) => c.key === entry.chapter.key,
          );
          if (!chapter)
            throw new Error("这一章已被删除，未保存的正文仍保留在编辑器中。");
          if (manuscriptText(chapter.content) !== saved)
            throw new Error(
              "这一章在其他操作中被修改，自动保存已暂停。请复制当前草稿后重新打开故事。",
            );
          return manuscriptWrites(structure, chapter, text);
        });
        entry.savingText = undefined;
        if (!result) {
          entry.error = true;
          notify();
          return false;
        }
        entry.saved = text;
        entry.error = false;
        notify();
      }
      return true;
    })();
    saving = operation;
    try {
      return await operation;
    } finally {
      saving = null;
    }
  };
  return {
    sync(chapters: Chapter[]) {
      for (const chapter of chapters) {
        const entry = drafts.get(chapter.key);
        const persisted = manuscriptText(chapter.content);
        if (
          !entry ||
          (!entry.error &&
            entry.savingText === undefined &&
            entry.text === entry.saved &&
            entry.saved !== persisted)
        )
          drafts.set(chapter.key, {
            chapter,
            text: persisted,
            saved: persisted,
            error: false,
          });
        else entry.chapter = chapter;
      }
    },
    textFor(chapter?: Chapter) {
      return chapter
        ? (drafts.get(chapter.key)?.text ?? manuscriptText(chapter.content))
        : "";
    },
    update(chapter: Chapter, text: string) {
      const entry = drafts.get(chapter.key);
      if (!entry) return;
      entry.text = text;
      entry.error = false;
      notify();
    },
    get dirty() {
      return [...drafts.values()].some(
        (d) => d.text !== d.saved || d.savingText !== undefined,
      );
    },
    get error() {
      return [...drafts.values()].some((d) => d.error);
    },
    get pending() {
      return [...drafts.values()].some((d) => d.text !== d.saved && !d.error);
    },
    flush,
  };
}
