import type { StoryProjectState, StoryValidationIssue, StoryValidationResult } from "../../types.js";
import { storyValidationIssue } from "../../errors.js";
import { projectInfo } from "./project.js";
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

const walkFields = (
  definition: StoryTypeDefinition,
  fields: Readonly<Record<string, StoryFieldDefinition>>,
  value: JsonObject,
  visitor: (field: StoryFieldDefinition, value: unknown, path: string) => void,
  basePath: string,
) => {
  for (const [key, field] of Object.entries(fields)) {
    const item = value[key];
    visitor(field, item, `${basePath}.${key}`);
    if (field.definition && isObject(item)) {
      walkFields(
        definition,
        StoryDefinition.objectFields(definition, field.definition),
        item,
        visitor,
        `${basePath}.${key}`,
      );
    }
    if (field.itemDefinition && Array.isArray(item)) {
      const objectFields = StoryDefinition.objectFields(definition, field.itemDefinition);
      item.forEach((child, index) => {
        if (isObject(child)) walkFields(definition, objectFields, child, visitor, `${basePath}.${key}[${index}]`);
      });
    }
  }
};

const definitionIds = (project: StoryProjectState, definition: StoryTypeDefinition, issues: StoryValidationIssue[]) => {
  const result = new Map<string, Set<string>>();
  const collect = (definitionName: string, value: unknown, path: string) => {
    if (!isObject(value) || typeof value.id !== "string" || !value.id) return;
    const ids = result.get(definitionName) ?? new Set<string>();
    if (ids.has(value.id))
      issues.push(storyValidationIssue("identity.duplicate", path, `${definitionName} 的 ID「${value.id}」重复。`));
    ids.add(value.id);
    result.set(definitionName, ids);
  };
  const visit = (fields: Readonly<Record<string, StoryFieldDefinition>>, value: JsonObject, basePath: string) => {
    for (const [key, field] of Object.entries(fields)) {
      const item = value[key];
      if (field.definition && isObject(item)) {
        collect(field.definition, item, `${basePath}.${key}`);
        visit(StoryDefinition.objectFields(definition, field.definition), item, `${basePath}.${key}`);
      }
      if (field.itemDefinition && Array.isArray(item)) {
        const objectFields = StoryDefinition.objectFields(definition, field.itemDefinition);
        item.forEach((child, index) => {
          collect(field.itemDefinition!, child, `${basePath}.${key}[${index}]`);
          if (isObject(child)) visit(objectFields, child, `${basePath}.${key}[${index}]`);
        });
      }
    }
  };
  for (const entry of project.documents) {
    if (isObject(entry.value)) {
      visit(StoryDefinition.fields(definition, entry.ref.kind), entry.value, StoryDefinition.identityKey(entry.ref));
    }
  }
  return result;
};

export const validateProject = (
  project: StoryProjectState,
  definition: StoryTypeDefinition,
  validationMode: string,
): StoryValidationResult => {
  if (!definition.validationModes[validationMode]) throw new Error(`故事类型不支持校验模式：${validationMode}`);
  const issues: StoryValidationIssue[] = [];
  const info = projectInfo(project);
  const documentKeys = project.documents.map((entry) => StoryDefinition.identityKey(entry.ref));
  if (new Set(documentKeys).size !== documentKeys.length) {
    issues.push(storyValidationIssue("identity.duplicate", "project", "文档引用重复。"));
  }
  const idsByKind = new Map<string, Set<string>>();
  for (const entry of project.documents) {
    const kind = entry.ref.kind;
    const id = documentId(entry.value);
    const ids = idsByKind.get(kind) ?? new Set<string>();
    if (id && ids.has(id))
      issues.push(
        storyValidationIssue(
          "identity.duplicate",
          StoryDefinition.identityKey(entry.ref),
          `${kind} 的 ID「${id}」重复。`,
        ),
      );
    if (id) ids.add(id);
    idsByKind.set(kind, ids);
  }
  const idsByDefinition = definitionIds(project, definition, issues);
  for (const entry of project.documents) {
    const kind = entry.ref.kind;
    if (!isObject(entry.value)) continue;
    walkFields(
      definition,
      StoryDefinition.fields(definition, kind),
      entry.value,
      (field, fieldValue, path) => {
        if (
          (!field.targetKinds?.length && !field.targetObjectDefinitions?.length) ||
          fieldValue === undefined ||
          fieldValue === ""
        )
          return;
        const references = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
        for (const reference of references) {
          if (typeof reference !== "string") continue;
          const matchedKind =
            field.targetKinds?.some((targetKind) => idsByKind.get(targetKind)?.has(reference)) ?? false;
          const matchedDefinition =
            field.targetObjectDefinitions?.some((definition) => idsByDefinition.get(definition)?.has(reference)) ??
            false;
          if (!matchedKind && !matchedDefinition) {
            const targets = [...(field.targetKinds ?? []), ...(field.targetObjectDefinitions ?? [])];
            issues.push(
              storyValidationIssue(
                "reference.missing",
                path,
                `引用「${reference}」未指向 ${targets.join("、")} 中的现有对象。`,
              ),
            );
          }
        }
      },
      StoryDefinition.identityKey(entry.ref),
    );
    for (const companionKind of StoryDefinition.document(definition, kind).companionKinds ?? []) {
      const id = documentId(entry.value);
      if (id && !idsByKind.get(companionKind)?.has(id)) {
        issues.push(
          storyValidationIssue(
            "companion.missing",
            StoryDefinition.identityKey(entry.ref),
            `${kind}「${id}」缺少配套文档 ${companionKind}。`,
          ),
        );
      }
    }
  }
  if (!info.storyId) issues.push(storyValidationIssue("manifest.story_id", "manifest.storyId", "故事 ID 不能为空。"));
  return { valid: issues.every((item) => item.severity !== "error"), issues };
};
