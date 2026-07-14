import type { StoryProjectApi } from "../../../../../../protocols/story-project";
import type { StoryCompiledProject } from "../../../../../../protocols/story-project/types";
import { loadStoryProject } from "../../story-project/documents/repository";
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

const roleKind = (projectApi: StoryProjectApi, role: string) => {
  const kind = projectApi.describe().documentRoles[role];
  if (!kind) {
    throw new Error(`当前故事 Profile 没有提供 ${role} 文档角色。`);
  }
  return kind;
};

const documentsByKind = (projectApi: StoryProjectApi, project: StoryCompiledProject, kind: string) =>
  projectApi
    .projectFiles(project)
    .filter((entry) => projectApi.kindForPath(entry.path) === kind)
    .flatMap((entry) => (isObject(entry.value) ? [entry.value] : []));

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
  const { projectApi, project } = await loadStoryProject(workspacePath);
  const chapterKind = roleKind(projectApi, "chapterPlan");
  return documentsByKind(projectApi, project, chapterKind)
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
  const { projectApi, project } = await loadStoryProject(workspacePath);
  const context = projectApi.readContext(project, { scope: "chapter", targetId: chapterId });
  if (context.target?.id !== chapterId) {
    throw new Error(`章节上下文目标不一致：${chapterId}`);
  }
  const characterKind = roleKind(projectApi, "character");
  const characters = documentsByKind(projectApi, project, characterKind).flatMap((value) => {
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
