import { storyTypeKindForPath } from "../../definitions/definition.js";
import type { StoryTypeDefinition } from "../../definitions/types.js";
import type { StoryOverview, StoryProjectState } from "../../types.js";
import { projectInfo } from "../engine/project.js";

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const stringValue = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const numberValue = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const projectOverview = (project: StoryProjectState, definition: StoryTypeDefinition): StoryOverview => {
  const documents = project.documents;
  const valuesForRole = (role: string) => {
    const kind = definition.roles[role];
    return kind
      ? documents.flatMap((entry) =>
          storyTypeKindForPath(definition, entry.path) === kind && isObject(entry.value) ? [entry.value] : [],
        )
      : [];
  };
  const primary = valuesForRole("primary")[0] ?? {};
  const positioning = valuesForRole("positioning")[0] ?? {};
  const manifest = project.manifest;
  const characters = valuesForRole("character").map((character) => ({
    id: stringValue(character.id),
    name: stringValue(character.name),
    avatar: stringValue(character.avatar, "blank-avatar"),
  }));
  return {
    id: projectInfo(project).storyId,
    title: stringValue(primary.title, stringValue(manifest.title, "未命名故事")),
    description: stringValue(primary.premise),
    goal: stringValue(primary.goal),
    lengthType: stringValue(positioning.lengthType),
    createdAt: numberValue(primary.createdAt, numberValue(manifest.createdAt, Date.now())),
    updatedAt: numberValue(manifest.updatedAt, Date.now()),
    characters,
    resourceCounts: {
      characters: characters.length,
      chapters: valuesForRole("chapterPlan").length,
      worldEntries: valuesForRole("worldEntry").length,
    },
  };
};
