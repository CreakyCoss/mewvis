import type { StoryFieldDefinition, StoryFieldType } from "./types.js";

type StoryFieldOptions = Omit<StoryFieldDefinition, "key" | "label" | "type">;

const makeField = (type: StoryFieldType, key: string, label: string, options: StoryFieldOptions = {}) =>
  Object.freeze({ key, type, label, ...options }) satisfies StoryFieldDefinition;

export const field = Object.freeze({
  id: (key: string, label: string, options?: StoryFieldOptions) => makeField("id", key, label, options),
  text: (key: string, label: string, options?: StoryFieldOptions) => makeField("text", key, label, options),
  textarea: (key: string, label: string, options?: StoryFieldOptions) => makeField("textarea", key, label, options),
  content: (key: string, label: string, options?: StoryFieldOptions) => makeField("content", key, label, options),
  integer: (key: string, label: string, options?: StoryFieldOptions) => makeField("integer", key, label, options),
  number: (key: string, label: string, options?: StoryFieldOptions) => makeField("number", key, label, options),
  boolean: (key: string, label: string, options?: StoryFieldOptions) => makeField("boolean", key, label, options),
  timestamp: (key: string, label: string, options?: StoryFieldOptions) => makeField("timestamp", key, label, options),
  select: (key: string, label: string, options?: StoryFieldOptions) => makeField("enum", key, label, options),
  stringList: (key: string, label: string, options?: StoryFieldOptions) =>
    makeField("string-list", key, label, options),
  reference: (key: string, label: string, options?: StoryFieldOptions) => makeField("reference", key, label, options),
  referenceList: (key: string, label: string, options?: StoryFieldOptions) =>
    makeField("reference-list", key, label, options),
  object: (key: string, label: string, options?: StoryFieldOptions) => makeField("object", key, label, options),
  collection: (key: string, label: string, options?: StoryFieldOptions) => makeField("collection", key, label, options),
  path: (key: string, label: string, options?: StoryFieldOptions) => makeField("path", key, label, options),
});

export const defineFields = (fields: readonly StoryFieldDefinition[]) => {
  const keys = fields.map((item) => item.key);
  if (keys.some((key) => !key.trim() || key.includes("/"))) {
    throw new Error("故事字段 key 必须是非空的直接属性名。");
  }
  if (new Set(keys).size !== keys.length) throw new Error("故事字段 key 不得重复。");
  return Object.freeze(fields.map((item) => Object.freeze({ ...item })));
};

/** 所有普通实体文档复用的稳定身份字段。 */
export const STORY_ENTITY_FIELDS = defineFields([
  field.integer("schemaVersion", "结构版本", { required: true, readOnly: true, const: 1 }),
  field.text("kind", "文档类型", { required: true, readOnly: true }),
  field.id("id", "文档 ID", {
    description: "跨文件引用使用的稳定身份，创建后不可修改",
    required: true,
    immutable: true,
  }),
  field.timestamp("updatedAt", "更新时间", { required: true, generated: true, readOnly: true }),
]);
