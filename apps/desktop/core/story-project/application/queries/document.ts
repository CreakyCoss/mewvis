import { StoryDefinition } from "../../definitions/index.js";
import type { StoryDocumentIdentity } from "../../definitions/model/types.js";
import type { StoryTypeDefinition } from "../../definitions/types.js";
import type { JsonFieldMetadata, JsonObjectDefinition, StoryDocument, StoryProjectDocumentEntry } from "../../types.js";

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const displayValue = (value: unknown) => {
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ");
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

const displaySource = (
  definition: StoryTypeDefinition,
  document: Pick<StoryProjectDocumentEntry, "ref" | "value">,
  documents: readonly StoryProjectDocumentEntry[],
  sourceKind: string,
) => {
  if (sourceKind === document.ref.kind) return document;
  const sourceRef = StoryDefinition.identity(definition, sourceKind, document.ref.identity);
  const sourceKey = StoryDefinition.identityKey(sourceRef);
  return documents.find((candidate) => StoryDefinition.identityKey(candidate.ref) === sourceKey) ?? null;
};

/** 按文档定义解析实例显示名；来源字段缺失时退回稳定的类型名称。 */
const storyDocumentDisplayName = (
  definition: StoryTypeDefinition,
  document: Pick<StoryProjectDocumentEntry, "ref" | "value">,
  documents: readonly StoryProjectDocumentEntry[],
) => {
  const documentDefinition = StoryDefinition.document(definition, document.ref.kind);
  const display = documentDefinition.display;
  if (!display) return documentDefinition.label;
  const source = displaySource(definition, document, documents, display.sourceKind ?? document.ref.kind);
  if (!source || !isObject(source.value)) return documentDefinition.label;
  const sourceValue = source.value;
  let complete = true;
  const name = display.template.replace(/\{([^{}]+)\}/g, (_placeholder, field: string) => {
    const value = displayValue(sourceValue[field]);
    if (!value) complete = false;
    return value;
  });
  if (!complete || !name.trim()) return documentDefinition.label;
  return `${name.trim()}${display.suffix ? `（${display.suffix}）` : ""}`;
};

const editorDefinition = (
  definition: StoryTypeDefinition,
  ref: StoryDocumentIdentity,
): NonNullable<StoryDocument["definition"]> => {
  const document = StoryDefinition.document(definition, ref.kind);
  const definitions: Record<string, JsonObjectDefinition> = Object.fromEntries(
    definition.objects.map((object) => [
      object.id,
      {
        ...(object.label ? { label: object.label } : {}),
        fields: Object.fromEntries(object.fields.map(({ key, ...field }) => [key, field as JsonFieldMetadata])),
      },
    ]),
  );
  return {
    kind: ref.kind,
    label: document.label,
    contentFormat: document.contentFormat,
    fields: Object.fromEntries(document.fields.map(({ key, ...field }) => [key, field as JsonFieldMetadata])),
    definitions,
  };
};

/** 为领域文档附加编辑器需要的结构描述。 */
export const editableStoryDocument = (
  definition: StoryTypeDefinition,
  document: Pick<StoryDocument, "ref" | "value" | "updatedAt">,
  documents: readonly StoryProjectDocumentEntry[],
): StoryDocument => {
  return {
    ...document,
    displayName: storyDocumentDisplayName(definition, document, documents),
    definition: editorDefinition(definition, document.ref),
  };
};
