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
  if (typeof operation.path === "string" && operation.path.endsWith(".json") && "value" in operation) {
    operation.value = parseJson(operation.value);
  }
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

const literalParam = (value: string) => ({ type: "literal", value }) as const;
const optionalString = (description: string) => ({ type: "string", description, optional: true }) as const;
const stringParam = (description: string) => ({ type: "string", description }) as const;
const jsonParam = (description: string) => ({ type: "json", description }) as const;
const stringArray = (description: string) =>
  ({
    type: "array",
    description,
    items: { type: "string", description: "字符串值" },
  }) as const;

const operationParameters = (
  type: string,
  description: string,
  properties: Record<string, ToolParameterDefinition> = {},
) =>
  ({
    type: "object",
    description,
    properties: {
      type: literalParam(type),
      path: stringParam("当前故事类型允许的故事文件路径"),
      ...properties,
    },
  }) as const;

const STORY_CHANGE_SET_OPERATION_PARAMETERS = {
  type: "union",
  description: "单个原子变更；按 type 使用对应的必填字段",
  anyOf: [
    operationParameters("upsert", "创建新文件或完整替换单个文件", {
      value: jsonParam("符合当前文档 schema 的 JSON 对象，或 Markdown 正文字符串"),
    }),
    operationParameters("delete", "删除非 manifest 文件"),
    operationParameters("patch", "深合并已有 JSON 文件的少数字段", {
      value: jsonParam("只包含需修改字段的 JSON 对象"),
    }),
    operationParameters("upsert-items", "按稳定 id 合并顶层对象数组", {
      field: stringParam("顶层对象数组字段名"),
      items: {
        type: "array",
        description: "要新增或更新的对象数组，每项必须包含稳定 id",
        items: { type: "json", description: "带稳定 id 的普通 JSON 对象" },
      },
    }),
    operationParameters("remove-items", "按稳定 id 删除顶层对象数组条目", {
      field: stringParam("顶层对象数组字段名"),
      ids: stringArray("要删除的对象 ID 数组"),
    }),
    operationParameters("add-values", "向顶层字符串数组追加并去重", {
      field: stringParam("顶层字符串数组字段名"),
      values: stringArray("要追加的字符串数组"),
    }),
    operationParameters("remove-values", "从顶层字符串数组移除值", {
      field: stringParam("顶层字符串数组字段名"),
      values: stringArray("要移除的字符串数组"),
    }),
    operationParameters("append-text", "向已有文本字段末尾追加内容", {
      field: stringParam("顶层文本字段名；Markdown 正文使用 content"),
      value: stringParam("要追加的文本"),
      separator: optionalString("可选分隔符"),
    }),
    operationParameters("replace-text", "用唯一原文锚点替换局部文本", {
      field: stringParam("顶层文本字段名；Markdown 正文使用 content"),
      oldText: stringParam("必须只出现一次的原文锚点"),
      newText: stringParam("替换后的文本，可为空字符串"),
    }),
  ],
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
