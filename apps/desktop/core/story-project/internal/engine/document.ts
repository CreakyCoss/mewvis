import type { StoryValidationIssue } from "../../types.js";
import { StoryProjectValidationError } from "./issues.js";
import {
  storyTypeDocument,
  storyTypeFields,
  storyTypeKindForPath,
  storyTypeObjectFields,
} from "../../definitions/definition.js";
import type { StoryFieldDefinition, StoryTypeDefinition } from "../../definitions/types.js";

const objectFromUnknown = (value: unknown, owner: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${owner} 必须是普通 JSON 对象。`);
  }
  return value as Record<string, unknown>;
};

const canonicalPath = (input: string) =>
  input
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");

const patternRegex = (pattern: string) => {
  const escaped = canonicalPath(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\\\{([a-zA-Z][a-zA-Z0-9]*)\\\}/g, "(?<$1>[^/]+)")}$`);
};

const pathParameters = (pattern: string, input: string) => {
  const match = patternRegex(pattern).exec(canonicalPath(input));
  if (!match) throw new Error(`路径不符合协议：${input}`);
  return match.groups ?? {};
};

const cloneJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

const parseCompatibleJson = (value: unknown) => {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text || (!text.startsWith("{") && !text.startsWith("["))) return value;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
};

const isEmptyCompatibleArrayValue = (value: unknown) =>
  value === null || (typeof value === "string" && (!value.trim() || value.trim() === "null"));

const compatibleArrayFromItem = (item: unknown) => {
  if (isEmptyCompatibleArrayValue(item)) return [];
  return Array.isArray(item) ? item : [item];
};

const compatibleArray = (value: unknown) => {
  if (isEmptyCompatibleArrayValue(value)) return [];
  const parsed = parseCompatibleJson(value);
  if (isEmptyCompatibleArrayValue(parsed)) return [];
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Object.keys(parsed).length === 1 && "item" in parsed) {
    const item = (parsed as Record<string, unknown>).item;
    return compatibleArrayFromItem(item);
  }
  return parsed;
};

const compatibleInteger = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return value;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : value;
};

const compatibleNumber = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

const compatibleBoolean = (value: unknown) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return value;
};

const compatiblePrimitive = (field: StoryFieldDefinition, value: unknown) => {
  const stringTypes = new Set(["id", "text", "textarea", "content", "enum", "reference", "path"]);
  if (stringTypes.has(field.type) && (typeof value === "number" || typeof value === "boolean")) {
    return String(value);
  }
  if (field.type === "integer" || field.type === "timestamp") return compatibleInteger(value);
  if (field.type === "number") return compatibleNumber(value);
  if (field.type === "boolean") return compatibleBoolean(value);
  if (field.type === "string-list" || field.type === "reference-list") {
    const array = compatibleArray(value);
    return Array.isArray(array)
      ? array.map((item) => (typeof item === "number" || typeof item === "boolean" ? String(item) : item))
      : array;
  }
  return value;
};

const assertPrimitiveType = (field: StoryFieldDefinition, value: unknown, owner: string) => {
  const type = field.type;
  const stringTypes = new Set(["id", "text", "textarea", "content", "enum", "reference", "path"]);
  if (stringTypes.has(type) && typeof value !== "string") throw new Error(`${owner} 必须是字符串。`);
  if ((type === "integer" || type === "timestamp") && !Number.isInteger(value))
    throw new Error(`${owner} 必须是整数。`);
  if (type === "number" && typeof value !== "number") throw new Error(`${owner} 必须是数值。`);
  if (type === "boolean" && typeof value !== "boolean") throw new Error(`${owner} 必须是布尔值。`);
  if (
    (type === "string-list" || type === "reference-list") &&
    (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
  ) {
    throw new Error(`${owner} 必须是字符串数组。`);
  }
  if (field.options && !field.options.some((option) => option.value === value)) {
    throw new Error(`${owner} 不在协议允许的枚举值中。`);
  }
  if (typeof value === "number" && typeof field.minimum === "number" && value < field.minimum) {
    throw new Error(`${owner} 不能小于 ${field.minimum}。`);
  }
  if (typeof value === "number" && typeof field.maximum === "number" && value > field.maximum) {
    throw new Error(`${owner} 不能大于 ${field.maximum}。`);
  }
  if (typeof value === "string" && typeof field.minLength === "number" && value.length < field.minLength) {
    throw new Error(`${owner} 长度不能小于 ${field.minLength}。`);
  }
  if (Array.isArray(value) && typeof field.minItems === "number" && value.length < field.minItems) {
    throw new Error(`${owner} 至少需要 ${field.minItems} 项。`);
  }
  if (Array.isArray(value) && typeof field.maxItems === "number" && value.length > field.maxItems) {
    throw new Error(`${owner} 不能超过 ${field.maxItems} 项。`);
  }
};

const materializeFields = (
  definition: StoryTypeDefinition,
  owner: string,
  fields: Readonly<Record<string, StoryFieldDefinition>>,
  input: unknown,
  timestamp: number,
  coerce: boolean,
  refreshGenerated: boolean,
  issues: StoryValidationIssue[],
) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    issues.push({
      severity: "error",
      code: "document.invalid_type",
      path: owner,
      message: `${owner} 必须是普通 JSON 对象。`,
    });
    return {};
  }
  const source = input as Record<string, unknown>;
  const allowed = new Set(Object.keys(fields));
  const unknownKeys = Object.keys(source).filter((key) => !allowed.has(key));
  for (const key of unknownKeys) {
    issues.push({
      severity: "error",
      code: "document.unknown_field",
      path: `${owner}.${key}`,
      message: `${owner} 包含协议未声明的字段：${key}`,
    });
  }
  if (unknownKeys.length === Object.keys(source).length && unknownKeys.length > 0) return {};
  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields)) {
    const path = `${owner}.${key}`;
    let value = source[key];
    if (field.const !== undefined) value = field.const;
    else if (
      field.generated &&
      (key === "updatedAt" || key === "createdAt") &&
      (value === undefined || (refreshGenerated && key === "updatedAt"))
    ) {
      value = timestamp;
    } else if (value === undefined && field.default !== undefined) value = cloneJson(field.default);
    if (value === undefined) {
      if (field.required) {
        issues.push({
          severity: "error",
          code: "document.required",
          path,
          message: `${path} 是协议声明的必填字段。`,
        });
      }
      continue;
    }
    try {
      if (field.definition) {
        const objectFields = storyTypeObjectFields(definition, field.definition);
        value = materializeFields(
          definition,
          path,
          objectFields,
          coerce ? parseCompatibleJson(value) : value,
          timestamp,
          coerce,
          refreshGenerated,
          issues,
        );
      } else if (field.itemDefinition) {
        if (coerce) value = compatibleArray(value);
        if (!Array.isArray(value)) throw new Error(`${path} 必须是数组。`);
        const objectFields = storyTypeObjectFields(definition, field.itemDefinition);
        value = value.map((item, index) =>
          materializeFields(
            definition,
            `${path}[${index}]`,
            objectFields,
            coerce ? parseCompatibleJson(item) : item,
            timestamp,
            coerce,
            refreshGenerated,
            issues,
          ),
        );
      } else {
        if (coerce) value = compatiblePrimitive(field, value);
        assertPrimitiveType(field, value, path);
      }
      result[key] = value;
    } catch (error) {
      issues.push({
        severity: "error",
        code: "document.invalid",
        path,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
};

export const materializeStoryDocument = (
  definition: StoryTypeDefinition,
  input: unknown,
  expectedKind: string,
  timestamp = Date.now(),
  options: Readonly<{ coerce?: boolean; refreshGenerated?: boolean }> = {},
) => {
  const issues: StoryValidationIssue[] = [];
  const value = materializeFields(
    definition,
    expectedKind,
    storyTypeFields(definition, expectedKind),
    input,
    timestamp,
    options.coerce === true,
    options.refreshGenerated !== false,
    issues,
  );
  if (value.kind !== expectedKind) {
    issues.push({
      severity: "error",
      code: "document.kind_mismatch",
      path: `${expectedKind}.kind`,
      message: `故事文档 kind 与目标路径不一致：期望 ${expectedKind}，收到 ${String(value.kind)}`,
    });
  }
  if (issues.length > 0) throw new StoryProjectValidationError(issues);
  return value;
};

export const serializeStoryDocument = (
  definition: StoryTypeDefinition,
  input: unknown,
  path: string,
): Record<string, unknown> | string => {
  const kind = storyTypeKindForPath(definition, path);
  const document = storyTypeDocument(definition, kind);
  if (document.contentType === "markdown") return parseStoryDocument(definition, input, path).content as string;
  const source = objectFromUnknown(input, path);
  const allowed = new Set(Object.keys(storyTypeFields(definition, kind)));
  return materializeStoryDocument(
    definition,
    Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key))),
    kind,
    Date.now(),
    { refreshGenerated: false },
  );
};

export const parseStoryDocument = (
  definition: StoryTypeDefinition,
  input: unknown,
  path: string,
  timestamp = Date.now(),
  options: Readonly<{ coerce?: boolean }> = {},
) => {
  const kind = storyTypeKindForPath(definition, path);
  const document = storyTypeDocument(definition, kind);
  if (document.contentType === "markdown") {
    const content = typeof input === "string" ? input : objectFromUnknown(input, path).content;
    if (typeof content !== "string") throw new Error(`${path} 的 Markdown 内容必须是字符串。`);
    const parameters = pathParameters(document.pathPattern, path);
    const id = parameters.id;
    if (!id) throw new Error(`${kind} 的 Markdown 路径必须包含 {id} 参数。`);
    return { kind, id, content };
  }
  return materializeStoryDocument(definition, input, kind, timestamp, {
    ...options,
    refreshGenerated: false,
  });
};
