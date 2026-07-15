import { storyTypeDocument, storyTypeKindForPath } from "../../definitions/definition.js";
import type { StoryTypeDefinition } from "../../definitions/types.js";
import type { JsonFieldMetadata, JsonObjectDefinition, StoryDocument } from "../../types.js";

const editorDefinition = (definition: StoryTypeDefinition, path: string): NonNullable<StoryDocument["definition"]> => {
  const kind = storyTypeKindForPath(definition, path);
  const document = storyTypeDocument(definition, kind);
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
    kind,
    label: document.label,
    fields: Object.fromEntries(document.fields.map(({ key, ...field }) => [key, field as JsonFieldMetadata])),
    definitions,
  };
};

export const editableStoryDocument = (
  definition: StoryTypeDefinition,
  document: Pick<StoryDocument, "path" | "value" | "updatedAt">,
): StoryDocument => ({
  ...document,
  definition: editorDefinition(definition, document.path),
});
