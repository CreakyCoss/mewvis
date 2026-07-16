import { normalizeStoryTypePath } from "./path.js";
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

const patternRegex = (pattern: string) => {
  const escaped = normalizeStoryTypePath(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\\\{[^}]+\\\}/g, "[A-Za-z0-9_-]+")}$`);
};

export const storyTypeKindForPath = (definition: StoryTypeDefinition, input: string) => {
  const path = normalizeStoryTypePath(input);
  const document = definition.documents.find((candidate) => patternRegex(candidate.pathPattern).test(path));
  if (!document) throw new Error(`故事类型不允许文件路径：${path}`);
  return document.kind;
};

export const resolveStoryTypePath = (
  definition: StoryTypeDefinition,
  kind: string,
  parameters: Readonly<Record<string, string>> = {},
) => {
  const pattern = storyTypeDocument(definition, kind).pathPattern;
  const path = pattern.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = parameters[name]?.trim();
    if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`${kind} 路径缺少合法参数：${name}`);
    return value;
  });
  if (path.includes("{")) throw new Error(`${kind} 路径仍包含未解析参数：${path}`);
  return normalizeStoryTypePath(path);
};

export const storyTypeContext = (definition: StoryTypeDefinition, scope: "project" | "chapter") => {
  const context = definition.contexts.find((candidate) => candidate.scope === scope);
  if (!context) throw new Error(`故事类型缺少 ${scope} 上下文定义。`);
  return context;
};
