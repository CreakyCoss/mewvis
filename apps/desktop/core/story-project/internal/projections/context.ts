import type {
  StoryProjectFileEntry,
  StoryProjectState,
  StoryContext,
  StoryContextSection,
  StoryContextSource,
} from "../../types.js";
import { StoryDefinition } from "../../definitions/index.js";
import type { StoryFieldDefinition } from "../../definitions/model/types.js";
import type { StoryTypeDefinition } from "../../definitions/types.js";

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const documentId = (value: unknown) => {
  if (!isObject(value)) return "";
  return typeof value.id === "string" ? value.id : typeof value.storyId === "string" ? value.storyId : "";
};
const documentKind = (value: unknown) => (isObject(value) && typeof value.kind === "string" ? value.kind : "");

const projectRevision = (project: StoryProjectState) => {
  if (!Number.isInteger(project.manifest.revision)) throw new Error("故事 Manifest 缺少 revision。");
  return Number(project.manifest.revision);
};

const displayScalar = (field: StoryFieldDefinition, value: unknown) => {
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "string") return field.options?.find((item) => item.value === value)?.label ?? value;
  return String(value ?? "");
};

const renderFields = (
  definition: StoryTypeDefinition,
  fields: Readonly<Record<string, StoryFieldDefinition>>,
  value: JsonObject,
  indent = "",
) =>
  Object.entries(fields).flatMap(([key, field]): string[] => {
    const item = value[key];
    if (item === undefined || item === null || item === "" || (Array.isArray(item) && item.length === 0)) return [];
    if (["schemaVersion", "kind", "updatedAt", "createdAt", "files"].includes(key)) return [];
    const prefix = `${indent}- ${field.label}：`;
    if (field.definition && isObject(item)) {
      return [
        `${prefix}`,
        ...renderFields(definition, StoryDefinition.objectFields(definition, field.definition), item, `${indent}  `),
      ];
    }
    if (field.itemDefinition && Array.isArray(item)) {
      const objectFields = StoryDefinition.objectFields(definition, field.itemDefinition);
      return [
        `${prefix}`,
        ...item.flatMap((child, index) =>
          isObject(child)
            ? [`${indent}  ${index + 1}.`, ...renderFields(definition, objectFields, child, `${indent}     `)]
            : [`${indent}  ${index + 1}. ${String(child)}`],
        ),
      ];
    }
    if (Array.isArray(item)) return [`${prefix}${item.join("、")}`];
    return [`${prefix}${displayScalar(field, item)}`];
  });

const entryIsTarget = (entries: readonly StoryProjectFileEntry[], target?: StoryProjectFileEntry) =>
  Boolean(target && entries.some((entry) => entry.path === target.path));

export const readStoryProjectContext = (
  project: StoryProjectState,
  definition: StoryTypeDefinition,
  input: { scope: "project" | "chapter"; targetId?: string },
): StoryContext => {
  const view = StoryDefinition.context(definition, input.scope);
  const candidates = project.documents.filter((entry) => view.documentKinds.includes(documentKind(entry.value)));
  const target =
    input.scope === "chapter" && view.targetKind
      ? candidates.find((entry) => {
          if (documentKind(entry.value) !== view.targetKind || !isObject(entry.value)) return false;
          const value = entry.value;
          return (view.targetSelectors ?? ["id"]).some((key) => String(value[key] ?? "") === input.targetId);
        })
      : undefined;
  if (input.scope === "chapter" && !target) throw new Error(`找不到章节上下文目标：${input.targetId ?? ""}`);
  const orderedKinds = [target ? documentKind(target.value) : "", ...view.documentKinds].filter(
    (kind, index, all) => kind && all.indexOf(kind) === index,
  );
  const sections = orderedKinds.flatMap((kind, index): StoryContextSection[] => {
    const entries = candidates.filter((entry) => documentKind(entry.value) === kind);
    if (entries.length === 0) return [];
    const sources: StoryContextSource[] = entries.map((entry) => ({
      kind,
      label: StoryDefinition.document(definition, kind).label,
      path: entry.path,
      ...(documentId(entry.value) ? { id: documentId(entry.value) } : {}),
    }));
    const content = entries
      .map((entry) => {
        if (!isObject(entry.value)) return String(entry.value);
        const heading =
          typeof entry.value.title === "string"
            ? entry.value.title
            : typeof entry.value.name === "string"
              ? entry.value.name
              : documentId(entry.value);
        const body = renderFields(definition, StoryDefinition.fields(definition, kind), entry.value).join("\n");
        return entries.length > 1 && heading ? `### ${heading}\n\n${body}` : body;
      })
      .filter(Boolean)
      .join("\n\n");
    return content
      ? [
          {
            id: kind,
            label: StoryDefinition.document(definition, kind).label,
            priority: 100 - index,
            required: entryIsTarget(entries, target),
            content,
            sources,
          },
        ]
      : [];
  });
  const targetValue = target && isObject(target.value) ? target.value : undefined;
  const targetLabel = targetValue
    ? typeof targetValue.title === "string"
      ? targetValue.number
        ? `第 ${String(targetValue.number)} 章《${targetValue.title}》`
        : targetValue.title
      : documentId(targetValue)
    : "";
  const sources = [
    ...new Map(sections.flatMap((section) => section.sources).map((source) => [source.path, source])).values(),
  ];
  return {
    scope: input.scope,
    revision: projectRevision(project),
    target: target ? { kind: documentKind(target.value), id: documentId(target.value), label: targetLabel } : null,
    sections,
    sources,
    text: [
      `# ${view.label}${targetLabel ? `：${targetLabel}` : ""}`,
      ...sections.map((section) => `## ${section.label}\n\n${section.content}`),
    ].join("\n\n"),
  };
};
