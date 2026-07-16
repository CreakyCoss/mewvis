import { defineStoryType, parseStoryTypeDefinition } from "./internal/parser.js";
import {
  storyTypeContext,
  storyTypeDocument,
  storyTypeFields,
  storyTypeObject,
  storyTypeObjectFields,
  storyTypeReference,
  storyTypeReferenceKey,
} from "./internal/resolver.js";
import type {
  StoryDocumentDefinition,
  StoryDocumentRef,
  StoryFieldDefinition,
  StoryObjectDefinition,
} from "./model/types.js";
import {
  STORY_TYPE_DEFINITION_FORMAT,
  STORY_TYPE_DEFINITION_FORMAT_VERSION,
  type StoryContextDefinition,
  type StoryTypeDefinition,
} from "./types.js";

/** Story Type 定义的唯一运行时入口。 */
export interface StoryDefinitionApi {
  readonly format: typeof STORY_TYPE_DEFINITION_FORMAT;
  readonly formatVersion: typeof STORY_TYPE_DEFINITION_FORMAT_VERSION;
  define(input: StoryTypeDefinition): StoryTypeDefinition;
  parse(input: unknown): StoryTypeDefinition;
  document(definition: StoryTypeDefinition, kind: string): StoryDocumentDefinition;
  object(definition: StoryTypeDefinition, id: string): StoryObjectDefinition;
  objectFields(definition: StoryTypeDefinition, id: string): Readonly<Record<string, StoryFieldDefinition>>;
  fields(definition: StoryTypeDefinition, kind: string): Readonly<Record<string, StoryFieldDefinition>>;
  reference(
    definition: StoryTypeDefinition,
    kind: string,
    identity?: Readonly<Record<string, string>>,
  ): StoryDocumentRef;
  referenceKey(ref: StoryDocumentRef): string;
  context(definition: StoryTypeDefinition, scope: "project" | "chapter"): StoryContextDefinition;
}

export const StoryDefinition: StoryDefinitionApi = Object.freeze({
  format: STORY_TYPE_DEFINITION_FORMAT,
  formatVersion: STORY_TYPE_DEFINITION_FORMAT_VERSION,
  define: defineStoryType,
  parse: parseStoryTypeDefinition,
  document: storyTypeDocument,
  object: storyTypeObject,
  objectFields: storyTypeObjectFields,
  fields: storyTypeFields,
  reference: storyTypeReference,
  referenceKey: storyTypeReferenceKey,
  context: storyTypeContext,
});
