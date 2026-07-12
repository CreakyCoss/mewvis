export type StoryProjectLayout = Readonly<{
  profile: Readonly<{ id: string; version: number }>;
  layoutVersion: number;
  rootPath: string;
  documents: Readonly<Record<string, Readonly<{ pathPattern: string }>>>;
}>;

const objectValue = (input: unknown, owner: string): Record<string, unknown> => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`${owner} 必须是 JSON 对象。`);
  return input as Record<string, unknown>;
};

const nonEmptyString = (input: unknown, owner: string) => {
  if (typeof input !== "string" || !input.trim()) throw new Error(`${owner} 必须是非空字符串。`);
  return input.trim();
};

const positiveInteger = (input: unknown, owner: string) => {
  if (!Number.isInteger(input) || Number(input) <= 0) throw new Error(`${owner} 必须是正整数。`);
  return Number(input);
};

export const parseStoryProjectLayout = (input: unknown): StoryProjectLayout => {
  const value = objectValue(input, "故事项目布局");
  const profile = objectValue(value.profile, "故事项目布局 profile");
  const documents = objectValue(value.documents, "故事项目布局 documents");
  if (Object.keys(documents).length === 0) throw new Error("故事项目布局至少需要映射一种文档。 ");
  return {
    profile: {
      id: nonEmptyString(profile.id, "profile.id"),
      version: positiveInteger(profile.version, "profile.version"),
    },
    layoutVersion: positiveInteger(value.layoutVersion, "layoutVersion"),
    rootPath: nonEmptyString(value.rootPath, "rootPath"),
    documents: Object.fromEntries(
      Object.entries(documents).map(([kind, raw]) => {
        const document = objectValue(raw, `documents.${kind}`);
        return [kind, { pathPattern: nonEmptyString(document.pathPattern, `documents.${kind}.pathPattern`) }];
      }),
    ),
  };
};
