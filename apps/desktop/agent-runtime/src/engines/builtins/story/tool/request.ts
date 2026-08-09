import type { ToolParameterDefinition } from "../../definition.js";

type JsonObject = Record<string, unknown>;

export type StoryIdentityFieldsByKind = Readonly<Record<string, readonly string[]>>;

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

const nonEmptyString = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

const normalizeReference = (
  input: unknown,
  operationValue: unknown,
  identityFieldsByKind: StoryIdentityFieldsByKind,
) => {
  const parsed = parseJson(input);
  if (!isObject(parsed)) return parsed;
  const ref = { ...parsed };
  const kind = nonEmptyString(ref.kind);
  const identityFields = kind ? identityFieldsByKind[kind] : undefined;
  const parsedIdentity = parseJson(ref.identity);
  const parsedIdentityJson = parseJson(ref.identityJson);
  let identity = isObject(parsedIdentity)
    ? parsedIdentity
    : isObject(parsedIdentityJson)
      ? parsedIdentityJson
      : parsedIdentity;

  if (!isObject(identity) && identityFields?.length === 1) {
    const shorthand = nonEmptyString(ref.identityValue) ?? nonEmptyString(identity);
    if (shorthand) identity = { [identityFields[0]!]: shorthand };
  }
  if (!isObject(identity) && identityFields?.length === 1 && isObject(operationValue)) {
    const field = identityFields[0]!;
    const valueIdentity = nonEmptyString(operationValue[field]);
    if (valueIdentity) identity = { [field]: valueIdentity };
  }
  if ((identity === undefined || identity === "") && identityFields?.length === 0) identity = {};

  delete ref.identityValue;
  delete ref.identityJson;
  if (identity !== undefined) ref.identity = identity;
  return ref;
};

const normalizeOperation = (input: unknown, identityFieldsByKind: StoryIdentityFieldsByKind) => {
  const parsed = parseJson(input);
  if (!isObject(parsed)) return parsed;
  const operation = { ...parsed };
  if ("items" in operation) {
    const items = arrayValue(operation.items);
    operation.items = Array.isArray(items) ? items.map(parseJson) : items;
  }
  if ("ids" in operation) operation.ids = arrayValue(operation.ids);
  if ("values" in operation) operation.values = arrayValue(operation.values);
  if ("value" in operation) operation.value = parseJson(operation.value);
  if ("ref" in operation) operation.ref = normalizeReference(operation.ref, operation.value, identityFieldsByKind);
  return operation;
};

/**
 * Normalizes unambiguous transport mistakes made by compatible model providers.
 * Story Project still performs the authoritative strict validation.
 */
export const normalizeStoryChangeSet = (
  input: unknown,
  identityFieldsByKind: StoryIdentityFieldsByKind = {},
): unknown => {
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
  changeSet.operations = Array.isArray(operations)
    ? operations.map((operation) => normalizeOperation(operation, identityFieldsByKind))
    : operations;
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
      description:
        "领域文档引用；kind 来自 describe_structure。many 文档优先按 identityFields 填 identity 对象；只有一个身份字段时也可只传 identityValue",
      properties: {
        kind: stringParam("文档 kind"),
        identity: {
          type: "union",
          description:
            "文档身份；one 文档传空对象或省略，many 文档可传身份对象，也可在只有一个 identityFields 时直接传该字段值",
          anyOf: [
            {
              type: "object",
              description: "规范身份对象；常见 many 文档传 {id: 'chap-001'}，角色状态传 {characterId: 'char-001'}",
              properties: {
                id: optionalString("identityFields 为 id 时的稳定 ID"),
                characterId: optionalString("identityFields 为 characterId 时的角色 ID"),
              },
            },
            stringParam("单字段身份简写，例如 chap-001；运行时按该 kind 的 identityFields 恢复对象"),
          ],
          optional: true,
        },
        identityValue: optionalString(
          "推荐的单字段身份简写；运行时会按该 kind 唯一的 identityFields 字段组装身份对象，例如 chap-001",
        ),
        identityJson: optionalString("仅多字段身份使用：完整身份对象的 JSON 字符串"),
      },
    },
    value: optionalJson(
      "upsert 的完整 JSON/Markdown 值，或 patch 的对象值；patch 不得使用 field+标量，完整替换章节 Markdown 使用 upsert+正文字符串",
    ),
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
