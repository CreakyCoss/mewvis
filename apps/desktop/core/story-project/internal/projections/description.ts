import type { StoryFieldDefinition } from "../../definitions/model/types.js";
import type { StoryTypeDefinition } from "../../definitions/types.js";
import type {
  JsonFieldMetadata,
  JsonObjectDefinition,
  StoryChangeSetDescription,
  StoryProjectStructure,
} from "../../types.js";
import { STORY_CHANGE_SET_MAX_BYTES, STORY_CHANGE_SET_MAX_OPERATIONS } from "../engine/changes.js";

const CHANGE_SET: StoryChangeSetDescription = Object.freeze({
  maxOperations: STORY_CHANGE_SET_MAX_OPERATIONS,
  maxBytes: STORY_CHANGE_SET_MAX_BYTES,
  operations: [
    "upsert",
    "delete",
    "patch",
    "upsert-items",
    "remove-items",
    "add-values",
    "remove-values",
    "append-text",
    "replace-text",
  ],
  atomicCommit: true,
  revisionRequired: true,
});

const fieldMetadata = ({ key: _key, ...field }: StoryFieldDefinition): JsonFieldMetadata => field as JsonFieldMetadata;

const fieldRecord = (fields: readonly StoryFieldDefinition[]) =>
  Object.fromEntries(fields.map((field) => [field.key, fieldMetadata(field)]));

const referencedObjects = (definition: StoryTypeDefinition, fields: readonly StoryFieldDefinition[]) => {
  const names = new Set<string>();
  const visit = (source: readonly StoryFieldDefinition[]) => {
    for (const field of source) {
      for (const id of [field.definition, field.itemDefinition]) {
        if (!id || names.has(id)) continue;
        names.add(id);
        const object = definition.objects.find((candidate) => candidate.id === id);
        if (object) visit(object.fields);
      }
    }
  };
  visit(fields);
  return Object.fromEntries(
    [...names].flatMap((id): [string, JsonObjectDefinition][] => {
      const object = definition.objects.find((candidate) => candidate.id === id);
      return object
        ? [[id, { ...(object.label ? { label: object.label } : {}), fields: fieldRecord(object.fields) }]]
        : [];
    }),
  );
};

export const describeStoryProject = (
  definition: StoryTypeDefinition,
  input: { documentKinds?: readonly string[] } = {},
): StoryProjectStructure => {
  const requested = [...new Set(input.documentKinds ?? [])];
  const requestedDocuments = requested.map((kind) => {
    const document = definition.documents.find((candidate) => candidate.kind === kind);
    if (!document) throw new Error(`故事类型未定义文档：${kind}`);
    return document;
  });
  const schemaFields = requestedDocuments.flatMap((document) => document.fields);
  return {
    storyType: {
      id: definition.id,
      version: definition.version,
      label: definition.label,
      description: definition.description,
      rootPath: definition.rootPath,
      manifestKind: definition.manifestKind,
      ...(definition.primaryKind ? { primaryKind: definition.primaryKind } : {}),
    },
    roles: definition.roles,
    documents: Object.fromEntries(
      definition.documents.map((document) => [
        document.kind,
        {
          label: document.label,
          ...(document.description ? { description: document.description } : {}),
          contentType: document.contentType,
          pathPattern: document.pathPattern,
          cardinality: document.cardinality,
        },
      ]),
    ),
    contexts: Object.fromEntries(
      definition.contexts.map((context) => [
        context.name,
        {
          label: context.label,
          scope: context.scope,
          ...(context.targetKind ? { targetKind: context.targetKind } : {}),
          documentKinds: context.documentKinds,
        },
      ]),
    ),
    validationModes: Object.keys(definition.validationModes),
    schemas: {
      documents: Object.fromEntries(
        requestedDocuments.map((document) => [
          document.kind,
          {
            label: document.label,
            ...(document.description ? { description: document.description } : {}),
            contentType: document.contentType,
            pathPattern: document.pathPattern,
            cardinality: document.cardinality,
            fields: fieldRecord(document.fields),
          },
        ]),
      ),
      objectDefinitions: referencedObjects(definition, schemaFields),
    },
    changes: CHANGE_SET,
    rules: Object.keys(definition.rules),
  };
};
