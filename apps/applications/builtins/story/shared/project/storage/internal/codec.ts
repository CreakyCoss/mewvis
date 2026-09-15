import { StoryDefinition } from "../../definitions/index.js";
import type { StoryDocumentIdentity } from "../../definitions/model/types.js";
import type { StoryTypeDefinition } from "../../definitions/types.js";

const objectFromUnknown = (value: unknown, owner: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${owner} 必须是普通 JSON 对象。`);
  }
  return value as Record<string, unknown>;
};

/** 将已通过 Definitions 校验的领域文档编码为 Record Backend 可存储的值。 */
export const serializeStoryDocument = (
  definition: StoryTypeDefinition,
  input: unknown,
  inputRef: StoryDocumentIdentity,
): Record<string, unknown> | string => {
  const ref = StoryDefinition.identity(definition, inputRef.kind, inputRef.identity);
  const document = StoryDefinition.document(definition, ref.kind);
  if (document.contentFormat === "markdown") {
    return StoryDefinition.parseDocument(definition, input, ref).content as string;
  }
  const owner = StoryDefinition.identityKey(ref);
  const source = objectFromUnknown(input, owner);
  const allowed = new Set(Object.keys(StoryDefinition.fields(definition, ref.kind)));
  return StoryDefinition.materializeDocument(
    definition,
    Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key))),
    ref,
    Date.now(),
    { refreshGenerated: false },
  );
};
