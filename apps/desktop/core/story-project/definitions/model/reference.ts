import type { StoryDocumentRef } from "./types.js";

const nonEmpty = (value: string, owner: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${owner} 必须是非空字符串。`);
  return normalized;
};

export const createStoryDocumentRef = (
  kind: string,
  identity: Readonly<Record<string, string>> = {},
): StoryDocumentRef => ({
  kind: nonEmpty(kind, "文档 kind"),
  identity: Object.freeze(
    Object.fromEntries(
      Object.entries(identity)
        .map(([key, value]) => [nonEmpty(key, "身份字段"), nonEmpty(value, `身份字段 ${key}`)] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  ),
});

export const storyDocumentRefKey = (ref: StoryDocumentRef) => {
  const normalized = createStoryDocumentRef(ref.kind, ref.identity);
  const query = Object.entries(normalized.identity)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return query ? `${encodeURIComponent(normalized.kind)}?${query}` : encodeURIComponent(normalized.kind);
};

export const parseStoryDocumentRefKey = (input: string): StoryDocumentRef => {
  const [encodedKind, query = ""] = input.split("?", 2);
  const identity = Object.fromEntries(
    query
      ? query.split("&").map((entry) => {
          const [key, value] = entry.split("=", 2);
          return [decodeURIComponent(key ?? ""), decodeURIComponent(value ?? "")];
        })
      : [],
  );
  return createStoryDocumentRef(decodeURIComponent(encodedKind ?? ""), identity);
};
