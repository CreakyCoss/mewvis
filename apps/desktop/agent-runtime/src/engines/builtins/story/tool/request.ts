import type { ToolParameterDefinition } from "../../definition.js";

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseJson = (value: unknown) => {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text || (!text.startsWith("{") && !text.startsWith("["))) return value;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
};

const isEmptyArrayValue = (value: unknown) =>
  value === null || (typeof value === "string" && (!value.trim() || value.trim() === "null"));

const arrayFromItem = (item: unknown) => {
  if (isEmptyArrayValue(item)) return [];
  return Array.isArray(item) ? item : [item];
};

const arrayValue = (value: unknown) => {
  if (isEmptyArrayValue(value)) return [];
  const parsed = parseJson(value);
  if (isEmptyArrayValue(parsed)) return [];
  if (Array.isArray(parsed)) return parsed;
  if (isObject(parsed) && Object.keys(parsed).length === 1 && "item" in parsed) {
    return arrayFromItem(parsed.item);
  }
  return parsed;
};

const integerValue = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return value;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : value;
};

const booleanValue = (value: unknown) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return value;
};

const normalizeOperation = (input: unknown) => {
  const parsed = parseJson(input);
  if (!isObject(parsed)) return parsed;
  const operation = { ...parsed };
  if ("items" in operation) {
    const items = arrayValue(operation.items);
    operation.items = Array.isArray(items) ? items.map(parseJson) : items;
  }
  if ("ids" in operation) operation.ids = arrayValue(operation.ids);
  if ("values" in operation) operation.values = arrayValue(operation.values);
  if (isObject(operation.ref) && "identity" in operation.ref) {
    operation.ref = { ...operation.ref, identity: parseJson(operation.ref.identity) };
  }
  if ("value" in operation) operation.value = parseJson(operation.value);
  return operation;
};

/**
 * Normalizes unambiguous transport mistakes made by compatible model providers.
 * Story Project still performs the authoritative strict validation.
 */
export const normalizeStoryChangeSet = (input: unknown): unknown => {
  const parsed = parseJson(input);
  if (!isObject(parsed)) return parsed;
  const changeSet = { ...parsed };
  if ("storyTypeVersion" in changeSet) changeSet.storyTypeVersion = integerValue(changeSet.storyTypeVersion);
  if ("baseRevision" in changeSet) changeSet.baseRevision = integerValue(changeSet.baseRevision);
  if (isObject(changeSet.batch)) {
    changeSet.batch = {
      ...changeSet.batch,
      index: integerValue(changeSet.batch.index),
      ...(changeSet.batch.total === undefined ? {} : { total: integerValue(changeSet.batch.total) }),
      final: booleanValue(changeSet.batch.final),
    };
  }
  const operations = arrayValue(changeSet.operations);
  changeSet.operations = Array.isArray(operations) ? operations.map(normalizeOperation) : operations;
  return changeSet;
};

const optionalString = (description: string) => ({ type: "string", description, optional: true }) as const;
const optionalJson = (description: string) => ({ type: "json", description, optional: true }) as const;
const stringParam = (description: string) => ({ type: "string", description }) as const;
const optionalStringArray = (description: string) =>
  ({
    type: "array",
    description,
    items: { type: "string", description: "字符串值" },
    optional: true,
  }) as const;

const STORY_CHANGE_SET_OPERATION_PARAMETERS = {
  type: "object",
  description:
    "单个原子变更。type 可选 upsert、delete、patch、upsert-items、remove-items、add-values、remove-values、append-text、replace-text；不同 type 的必填字段由 Story Project 严格校验",
  properties: {
    type: stringParam("原子操作类型"),
    ref: {
      type: "object",
      description: "领域文档引用；kind 来自 describe_structure，many 文档按 identityFields 填写 identity",
      properties: {
        kind: stringParam("文档 kind"),
        identity: optionalJson("文档身份字段；one 文档传空对象，many 文档按 identityFields 填写"),
      },
    },
    value: optionalJson("upsert/patch 的 JSON 值，或 append-text/replace-text 使用的文本值"),
    field: optionalString("数组或文本操作使用的顶层字段名；Markdown 正文使用 content"),
    items: {
      type: "array",
      description: "upsert-items 要新增或更新的对象数组，每项必须包含稳定 id",
      items: { type: "json", description: "带稳定 id 的普通 JSON 对象" },
      optional: true,
    },
    ids: optionalStringArray("remove-items 要删除的对象 ID 数组"),
    values: optionalStringArray("add-values/remove-values 使用的字符串数组"),
    separator: optionalString("append-text 使用的可选分隔符"),
    oldText: optionalString("replace-text 使用且必须只出现一次的原文锚点"),
    newText: optionalString("replace-text 的替换文本，可为空字符串"),
  },
} as const satisfies ToolParameterDefinition;

/** Driver-neutral model schema. Business document fields remain story-type-driven. */
export const STORY_CHANGE_SET_PARAMETERS = {
  type: "object",
  description: "小批次 Story ChangeSet；数字和布尔值应使用原生 JSON 类型",
  properties: {
    storyTypeId: { type: "string", description: "describe_structure 返回的 storyType.id" },
    storyTypeVersion: { type: "integer", description: "describe_structure 返回的 storyType.version" },
    storyId: { type: "string", description: "当前故事稳定 ID" },
    baseRevision: { type: "integer", description: "read_context 返回的当前 revision" },
    validationMode: { type: "string", description: "当前故事类型声明的校验模式" },
    batch: {
      type: "object",
      description: "可选的小批次工作流元数据",
      optional: true,
      properties: {
        workflowId: { type: "string", description: "本次工作流稳定 ID" },
        index: { type: "integer", description: "从 1 开始的批次序号" },
        total: { type: "integer", description: "已知时填写总批次数", optional: true },
        label: { type: "string", description: "本批次单一目的" },
        final: { type: "boolean", description: "是否为工作流最后一批" },
      },
    },
    operations: {
      type: "array",
      description: "1-16 个原子变更；必须使用 JSON 数组",
      items: STORY_CHANGE_SET_OPERATION_PARAMETERS,
    },
  },
} as const satisfies ToolParameterDefinition;
