import { createStoryDocumentRef, storyDocumentRefKey } from "../model/reference.js";
import type { StoryDocumentRef } from "../model/types.js";
import type { StoryTypeDefinition } from "../types.js";

export const storyTypeDocument = (definition: StoryTypeDefinition, kind: string) => {
  const document = definition.documents.find((candidate) => candidate.kind === kind);
  if (!document) throw new Error(`故事类型未定义文档：${kind}`);
  return document;
};

export const storyTypeObject = (definition: StoryTypeDefinition, id: string) => {
  const object = definition.objects.find((candidate) => candidate.id === id);
  if (!object) throw new Error(`故事类型未定义对象：${id}`);
  return object;
};

export const storyTypeObjectFields = (definition: StoryTypeDefinition, id: string) =>
  Object.fromEntries(storyTypeObject(definition, id).fields.map((field) => [field.key, field]));

export const storyTypeFields = (definition: StoryTypeDefinition, kind: string) =>
  Object.fromEntries(storyTypeDocument(definition, kind).fields.map((field) => [field.key, field]));

export const storyTypeReference = (
  definition: StoryTypeDefinition,
  kind: string,
  identity: Readonly<Record<string, string>> = {},
) => {
  const document = storyTypeDocument(definition, kind);
  const ref = createStoryDocumentRef(kind, identity);
  const actual = Object.keys(ref.identity).sort();
  const expected = [...document.identityFields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${kind} 文档身份字段必须是：${expected.join("、") || "无"}。`);
  }
  return ref;
};

export const storyTypeReferenceKey = (ref: StoryDocumentRef) => storyDocumentRefKey(ref);

export const storyTypeContext = (definition: StoryTypeDefinition, scope: "project" | "chapter") => {
  const context = definition.contexts.find((candidate) => candidate.scope === scope);
  if (!context) throw new Error(`故事类型缺少 ${scope} 上下文定义。`);
  return context;
};
