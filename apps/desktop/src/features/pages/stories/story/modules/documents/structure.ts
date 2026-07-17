import type { StoryValue } from "../../../../../../../core/story-project/types";
import type { JsonFieldMetadata, JsonObjectDefinition } from "../../../story-document";

export type DocumentSection = Readonly<{
  description: string;
  fields: readonly [string, JsonFieldMetadata][];
  id: "basics" | "content" | "structured" | "technical";
  label: string;
}>;

const technicalKeyPattern = /^(kind|id|schemaVersion|documentId|createdAt|updatedAt|version)$/i;

export const documentPointerKey = (pointer: string) => (pointer.startsWith("/") ? pointer.slice(1) : pointer);

const sectionForField = (pointer: string, field: JsonFieldMetadata): DocumentSection["id"] => {
  const key = documentPointerKey(pointer);
  if (
    field.readOnly ||
    field.generated ||
    field.immutable ||
    field.const !== undefined ||
    technicalKeyPattern.test(key)
  ) {
    return "technical";
  }
  if (["object", "collection", "string-list", "reference", "reference-list"].includes(field.type)) {
    return "structured";
  }
  if (["textarea", "content"].includes(field.type)) return "content";
  return "basics";
};

const documentSectionDefinitions = {
  basics: { label: "基本信息", description: "名称、类型与其他便于快速识别的基本属性。" },
  content: { label: "主要内容", description: "这份资料最重要的叙事内容。" },
  structured: { label: "列表与关系", description: "条目、引用和其他可重复的结构化信息。" },
  technical: { label: "技术信息", description: "文档身份、版本与更新时间等系统信息。" },
} as const;

export const buildDocumentSections = (fields: Readonly<Record<string, JsonFieldMetadata>>): DocumentSection[] => {
  const buckets = new Map<DocumentSection["id"], [string, JsonFieldMetadata][]>();
  for (const entry of Object.entries(fields)) {
    const section = sectionForField(...entry);
    buckets.set(section, [...(buckets.get(section) ?? []), entry]);
  }
  return (["basics", "content", "structured", "technical"] as const).flatMap((id) => {
    const sectionFields = buckets.get(id) ?? [];
    return sectionFields.length > 0 ? [{ id, ...documentSectionDefinitions[id], fields: sectionFields }] : [];
  });
};

const cloneStoryValue = (value: StoryValue): StoryValue => JSON.parse(JSON.stringify(value)) as StoryValue;

export const fieldDefaultValue = (
  field: JsonFieldMetadata,
  definitions: Readonly<Record<string, JsonObjectDefinition>>,
): StoryValue => {
  if (field.const !== undefined) return cloneStoryValue(field.const);
  if (field.default !== undefined) return cloneStoryValue(field.default);
  if (field.type === "boolean") return false;
  if (["integer", "number", "timestamp"].includes(field.type)) return 0;
  if (["string-list", "reference-list", "collection"].includes(field.type)) return [];
  if (field.type === "object") {
    const definition = field.definition ? definitions[field.definition] : undefined;
    return definition
      ? Object.fromEntries(
          Object.entries(definition.fields).map(([pointer, child]) => [
            documentPointerKey(pointer),
            fieldDefaultValue(child, definitions),
          ]),
        )
      : {};
  }
  if (field.type === "enum" && field.options?.[0]) return field.options[0].value;
  return "";
};

export const createDocumentValue = (
  fields: Readonly<Record<string, JsonFieldMetadata>>,
  definitions: Readonly<Record<string, JsonObjectDefinition>>,
): StoryValue =>
  Object.fromEntries(
    Object.entries(fields).map(([pointer, field]) => [
      documentPointerKey(pointer),
      fieldDefaultValue(field, definitions),
    ]),
  );

export const updatedDocumentLabel = (updatedAt: number | null) => {
  if (!updatedAt) return "尚未保存";
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "已保存";
  return date.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
