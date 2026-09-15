import type { StoryDocumentIdentity } from "./types.js";

const nonEmpty = (value: string, owner: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${owner} 必须是非空字符串。`);
  return normalized;
};

export const createStoryDocumentIdentity = (
  kind: string,
  identity: Readonly<Record<string, string>> = {},
): StoryDocumentIdentity => ({
  kind: nonEmpty(kind, "文档 kind"),
  identity: Object.freeze(
    Object.fromEntries(
      Object.entries(identity)
        .map(([key, value]) => [nonEmpty(key, "身份字段"), nonEmpty(value, `身份字段 ${key}`)] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  ),
});

export const storyDocumentIdentityKey = (documentIdentity: StoryDocumentIdentity) => {
  const normalized = createStoryDocumentIdentity(documentIdentity.kind, documentIdentity.identity);
  const query = Object.entries(normalized.identity)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return query ? `${encodeURIComponent(normalized.kind)}?${query}` : encodeURIComponent(normalized.kind);
};

export const parseStoryDocumentIdentityKey = (input: string): StoryDocumentIdentity => {
  const [encodedKind, query = ""] = input.split("?", 2);
  const identity = Object.fromEntries(
    query
      ? query.split("&").map((entry) => {
          const [key, value] = entry.split("=", 2);
          return [decodeURIComponent(key ?? ""), decodeURIComponent(value ?? "")];
        })
      : [],
  );
  return createStoryDocumentIdentity(decodeURIComponent(encodedKind ?? ""), identity);
};
