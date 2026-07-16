import { createStoryDocumentRef } from "../../../definitions/model/reference.js";
import type { StoryDocumentRef } from "../../../definitions/model/types.js";
import type { StoryTypeDefinition } from "../../../definitions/types.js";
import type { StoryFileLayout } from "../../types.js";

export const normalizeStoryFilePath = (input: string) => {
  const path = input
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (!path || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`非法故事文件路径：${input}`);
  }
  return path;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const patternMatcher = (pattern: string) => {
  const normalized = normalizeStoryFilePath(pattern);
  const fields: string[] = [];
  let expression = "^";
  let offset = 0;
  for (const match of normalized.matchAll(/\{([^}]+)\}/g)) {
    expression += escapeRegex(normalized.slice(offset, match.index));
    expression += "([A-Za-z0-9_-]+)";
    fields.push(match[1]!);
    offset = (match.index ?? 0) + match[0].length;
  }
  expression += `${escapeRegex(normalized.slice(offset))}$`;
  return { fields, regex: new RegExp(expression) };
};

const patternFields = (pattern: string) => [...pattern.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]!);

export const assertStoryFileLayout = (layout: StoryFileLayout, definition: StoryTypeDefinition) => {
  const definitionPath = normalizeStoryFilePath(layout.definitionPath);
  const managedRoots = layout.managedRoots.map(normalizeStoryFilePath);
  const preservedPaths = (layout.preservedPaths ?? []).map(normalizeStoryFilePath);
  if (managedRoots.length === 0 || new Set(managedRoots).size !== managedRoots.length) {
    throw new Error("文件布局必须声明不重复的受管根目录。");
  }
  if (
    !managedRoots.some((root) => definitionPath === root || definitionPath.startsWith(`${root}/`)) ||
    preservedPaths.some((path) => !managedRoots.some((root) => path === root || path.startsWith(`${root}/`)))
  ) {
    throw new Error("故事类型定义和保留路径必须位于受管根目录内。");
  }
  const definitionKinds = new Set(definition.documents.map((document) => document.kind));
  const layoutKinds = Object.keys(layout.documentPaths);
  const missing = [...definitionKinds].filter((kind) => !layoutKinds.includes(kind));
  const unknown = layoutKinds.filter((kind) => !definitionKinds.has(kind));
  if (missing.length || unknown.length) {
    throw new Error(
      `文件布局与故事类型不一致：缺少 ${missing.join("、") || "无"}；多出 ${unknown.join("、") || "无"}。`,
    );
  }
  const signatures = new Map<string, string>();
  for (const document of definition.documents) {
    const pattern = normalizeStoryFilePath(layout.documentPaths[document.kind]!);
    if (!managedRoots.some((root) => pattern === root || pattern.startsWith(`${root}/`))) {
      throw new Error(`${document.kind} 的文件路径不在受管根目录内。`);
    }
    const fields = patternFields(pattern);
    const actual = [...fields].sort();
    const expected = [...document.identityFields].sort();
    if (
      fields.some((field) => !/^[A-Za-z][A-Za-z0-9_-]*$/.test(field)) ||
      new Set(fields).size !== fields.length ||
      actual.length !== expected.length ||
      actual.some((field, index) => field !== expected[index])
    ) {
      throw new Error(`${document.kind} 的文件布局身份字段必须是：${expected.join("、") || "无"}。`);
    }
    const extension = pattern.endsWith(".md") ? "markdown" : pattern.endsWith(".json") ? "structured" : null;
    if (extension !== document.contentFormat) {
      throw new Error(`${document.kind} 的文件后缀与 contentFormat=${document.contentFormat} 不一致。`);
    }
    if (pattern === definitionPath) throw new Error(`${document.kind} 的文件路径与故事类型定义路径冲突。`);
    const signature = pattern.replace(/\{[^}]+\}/g, "{}");
    const duplicateKind = signatures.get(signature);
    if (duplicateKind) throw new Error(`${document.kind} 与 ${duplicateKind} 的文件布局无法区分。`);
    signatures.set(signature, document.kind);
  }
};

export const storyFilePathForRef = (layout: StoryFileLayout, ref: StoryDocumentRef) => {
  const pattern = layout.documentPaths[ref.kind];
  if (!pattern) throw new Error(`文件布局未定义文档：${ref.kind}`);
  const expectedFields = patternFields(pattern);
  const actualFields = Object.keys(ref.identity);
  if (actualFields.length !== expectedFields.length || actualFields.some((field) => !expectedFields.includes(field))) {
    throw new Error(`${ref.kind} 的文件布局身份字段必须是：${expectedFields.join("、") || "无"}。`);
  }
  return normalizeStoryFilePath(
    pattern.replace(/\{([^}]+)\}/g, (_match, field: string) => {
      const value = ref.identity[field];
      if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`${ref.kind}.${field} 不是安全文件名。`);
      return value;
    }),
  );
};

export const storyDocumentRefForFilePath = (layout: StoryFileLayout, input: string): StoryDocumentRef | null => {
  const path = normalizeStoryFilePath(input);
  for (const [kind, pattern] of Object.entries(layout.documentPaths)) {
    const matcher = patternMatcher(pattern);
    const match = matcher.regex.exec(path);
    if (!match) continue;
    return createStoryDocumentRef(
      kind,
      Object.fromEntries(matcher.fields.map((field, index) => [field, match[index + 1]!])),
    );
  }
  return null;
};

export const replaceableStoryFilePaths = (layout: StoryFileLayout, keys: readonly string[]) => {
  const definitionPath = normalizeStoryFilePath(layout.definitionPath);
  const managedRoots = layout.managedRoots.map(normalizeStoryFilePath);
  const preservedPaths = (layout.preservedPaths ?? []).map(normalizeStoryFilePath);
  return keys.filter((input) => {
    const path = normalizeStoryFilePath(input);
    return (
      path !== definitionPath &&
      managedRoots.some((root) => path.startsWith(`${root}/`)) &&
      !preservedPaths.some((preserved) => path === preserved || path.startsWith(`${preserved}/`)) &&
      (path.endsWith(".json") || path.endsWith(".md"))
    );
  });
};
