import { storyDocumentIdentityKey } from "../../../../core/story-project";
import type { StoryDocument, StoryDocumentIdentity, StoryValue } from "../../../../core/story-project/types";

export type JsonObject = { [key: string]: StoryValue };
type StoryDocumentDefinition = NonNullable<StoryDocument["definition"]>;
export type JsonFieldMetadata = StoryDocumentDefinition["fields"][string];
export type JsonObjectDefinition = StoryDocumentDefinition["definitions"][string];

export type EditableStoryDocument = Readonly<{
  data: JsonObject;
  definitions: Readonly<Record<string, JsonObjectDefinition>>;
  fields: Readonly<Record<string, JsonFieldMetadata>>;
  kind: string;
  label: string;
  ref: StoryDocumentIdentity;
}>;

export const storyDocumentKey = (document: Pick<StoryDocument, "ref">) => storyDocumentIdentityKey(document.ref);

export const isJsonObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const inspectStoryDocument = (document: StoryDocument): EditableStoryDocument | null =>
  document.definition && isJsonObject(document.value)
    ? {
        data: document.value,
        definitions: document.definition.definitions,
        fields: document.definition.fields,
        kind: document.definition.kind,
        label: document.definition.label,
        ref: document.ref,
      }
    : null;

export const storyDocumentData = (document: StoryDocument) => (isJsonObject(document.value) ? document.value : null);

export const storyDocumentLabel = (document: StoryDocument) => document.definition?.label ?? storyDocumentKey(document);
