import { defineStoryType, parseStoryTypeDefinition } from "./internal/parser.js";
import { materializeStoryDocument, parseStoryDocument } from "./internal/document.js";
import {
  storyTypeContext,
  storyTypeDocument,
  storyTypeFields,
  storyTypeObject,
  storyTypeObjectFields,
  storyTypeIdentity,
  storyTypeIdentityKey,
} from "./internal/resolver.js";
import type {
  StoryDocumentDefinition,
  StoryDocumentIdentity,
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
  parseDocument(
    definition: StoryTypeDefinition,
    input: unknown,
    identity: StoryDocumentIdentity,
    timestamp?: number,
    options?: Readonly<{ coerce?: boolean }>,
  ): Record<string, unknown>;
  materializeDocument(
    definition: StoryTypeDefinition,
    input: unknown,
    identity: StoryDocumentIdentity,
    timestamp?: number,
    options?: Readonly<{ coerce?: boolean; refreshGenerated?: boolean }>,
  ): Record<string, unknown>;
  document(definition: StoryTypeDefinition, kind: string): StoryDocumentDefinition;
  object(definition: StoryTypeDefinition, id: string): StoryObjectDefinition;
  objectFields(definition: StoryTypeDefinition, id: string): Readonly<Record<string, StoryFieldDefinition>>;
  fields(definition: StoryTypeDefinition, kind: string): Readonly<Record<string, StoryFieldDefinition>>;
  identity(
    definition: StoryTypeDefinition,
    kind: string,
    identity?: Readonly<Record<string, string>>,
  ): StoryDocumentIdentity;
  identityKey(identity: StoryDocumentIdentity): string;
  context(definition: StoryTypeDefinition, scope: "project" | "chapter"): StoryContextDefinition;
}

export const StoryDefinition: StoryDefinitionApi = Object.freeze({
  format: STORY_TYPE_DEFINITION_FORMAT,
  formatVersion: STORY_TYPE_DEFINITION_FORMAT_VERSION,
  define: defineStoryType,
  parse: parseStoryTypeDefinition,
  parseDocument: parseStoryDocument,
  materializeDocument: materializeStoryDocument,
  document: storyTypeDocument,
  object: storyTypeObject,
  objectFields: storyTypeObjectFields,
  fields: storyTypeFields,
  identity: storyTypeIdentity,
  identityKey: storyTypeIdentityKey,
  context: storyTypeContext,
});
