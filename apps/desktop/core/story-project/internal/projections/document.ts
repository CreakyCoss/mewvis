import { StoryDefinition } from "../../definitions/index.js";
import type { StoryDocumentIdentity } from "../../definitions/model/types.js";
import type { StoryTypeDefinition } from "../../definitions/types.js";
import type { JsonFieldMetadata, JsonObjectDefinition, StoryDocument } from "../../types.js";

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

export const editableStoryDocument = (
  definition: StoryTypeDefinition,
  document: Pick<StoryDocument, "ref" | "value" | "updatedAt">,
): StoryDocument => ({
  ...document,
  definition: editorDefinition(definition, document.ref),
});
