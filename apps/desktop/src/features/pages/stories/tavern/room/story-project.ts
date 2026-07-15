import type { StoryDocument } from "../../../../../../core/story-project/types";
import { storyProjectApi } from "../../project-client";
import { storyDocumentData } from "../../story-document";
import type { StoryWorkspace } from "../../storage";
import type { TavernRoomConfig } from "../manage/model";
import type { TavernCharacter, TavernCharacterMemory, TavernStoryData } from "./model";

type JsonObject = Record<string, unknown>;

export type TavernChapterOption = {
  description?: string;
  id: string;
  label: string;
  meta?: string;
};

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const stringValue = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const numberValue = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const trimPathEnd = (value: string) => value.trim().replace(/[\\/]+$/, "");

const safePathSegment = (value: string, fallback: string) =>
  value.trim().replace(/[\\/]/g, "-").replace(/\.\./g, "").replace(/^\.+/, "").trim() || fallback;

const documentValues = (documents: StoryDocument[]) =>
  documents.flatMap((document) => {
    const value = storyDocumentData(document);
    return value ? [value] : [];
  });

const characterMemory = (value: unknown): TavernCharacterMemory | undefined => {
  if (!isObject(value)) return undefined;
  return {
    required: stringValue(value.required),
    public: stringValue(value.public),
    known: stringValue(value.known),
    privateSelf: stringValue(value.privateSelf),
    directorSecret: stringValue(value.directorSecret),
  };
};

const tavernCharacter = (value: JsonObject): TavernCharacter | null => {
  const id = stringValue(value.id);
  const name = stringValue(value.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    avatar: stringValue(value.avatar) || "blank-avatar",
    description: stringValue(value.description),
    speakingStyle: stringValue(value.speakingStyle),
    writingStyle: stringValue(value.writingStyle) || undefined,
    replyStylePrompt: stringValue(value.replyStylePrompt) || undefined,
    goals: stringValue(value.goals) || undefined,
    relationshipSummary: stringValue(value.relationshipSummary) || undefined,
    publicRelationshipSummary: stringValue(value.publicRelationshipSummary) || undefined,
    memory: characterMemory(value.memory),
  };
};

export const tavernChapterWorkspacePath = (workspace: StoryWorkspace, chapterId: string) =>
  [
    trimPathEnd(workspace.path),
    ".tavern",
    safePathSegment(workspace.id, "story"),
    safePathSegment(chapterId, "chapter"),
  ].join("/");

export const loadTavernChapterOptions = async (workspacePath: string): Promise<TavernChapterOption[]> => {
  const project = await storyProjectApi.open(workspacePath);
  return documentValues(await project.listDocuments({ role: "chapterPlan" }))
    .flatMap((chapter) => {
      const id = stringValue(chapter.id);
      if (!id) return [];
      const number = numberValue(chapter.number);
      const title = stringValue(chapter.title) || id;
      return [
        {
          order: number ?? Number.MAX_SAFE_INTEGER,
          option: {
            id,
            label: number === null ? title : `第 ${number} 章 · ${title}`,
            meta: number === null ? undefined : `第 ${number} 章`,
            description: stringValue(chapter.coreEvent) || stringValue(chapter.targetEmotion),
          } satisfies TavernChapterOption,
        },
      ];
    })
    .sort((left, right) => left.order - right.order || left.option.label.localeCompare(right.option.label))
    .map(({ option }) => option);
};

export const loadTavernStoryData = async ({
  chapterId,
  roomConfig,
  workspacePath,
}: {
  chapterId: string;
  roomConfig: TavernRoomConfig;
  workspacePath: string;
}): Promise<TavernStoryData> => {
  const project = await storyProjectApi.open(workspacePath);
  const context = await project.readContext({ scope: "chapter", targetId: chapterId });
  if (context.target?.id !== chapterId) {
    throw new Error(`章节上下文目标不一致：${chapterId}`);
  }
  const characters = documentValues(await project.listDocuments({ role: "character" })).flatMap((value) => {
    const character = tavernCharacter(value);
    return character ? [character] : [];
  });
  return {
    chapterId,
    context,
    characters,
    roomConfig,
  };
};
