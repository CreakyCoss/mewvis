import type { StoryDocumentDefinition, StoryObjectDefinition } from "./model/types.js";

/** Story Type Definition 持久化格式的稳定标识。 */
export const STORY_TYPE_DEFINITION_FORMAT = "novel-claw.story-type-definition";

/** Story Type Definition 持久化结构的版本。 */
export const STORY_TYPE_DEFINITION_FORMAT_VERSION = 1;

/** 仅用于读取改名前已经持久化的 Story Project。 */
export const STORY_TYPE_DEFINITION_LEGACY_FORMATS = ["novel-claw.story-project"] as const;

export type StoryContextDefinition = Readonly<{
  name: string;
  label: string;
  scope: "project" | "chapter";
  targetKind?: string;
  targetSelectors?: readonly string[];
  documentKinds: readonly string[];
}>;

export type StoryTypeDefinition = Readonly<{
  $format: typeof STORY_TYPE_DEFINITION_FORMAT;
  formatVersion: typeof STORY_TYPE_DEFINITION_FORMAT_VERSION;
  id: string;
  version: number;
  label: string;
  description: string;
  rootPath: string;
  manifestKind: string;
  primaryKind?: string;
  roles: Readonly<Record<string, string>>;
  objects: readonly StoryObjectDefinition[];
  documents: readonly StoryDocumentDefinition[];
  contexts: readonly StoryContextDefinition[];
  validationModes: Readonly<Record<string, Readonly<{ label?: string; description?: string }>>>;
  rules: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}>;

export type StoryTypeSummary = Pick<StoryTypeDefinition, "id" | "version" | "label" | "description">;
