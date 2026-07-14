export type StoryProjectLayoutDocument = Readonly<{ pathPattern: string }>;

export type StoryProjectLayout = Readonly<{
  profile: Readonly<{ id: string; version: number }>;
  layoutVersion: number;
  rootPath: string;
  documents: Readonly<Record<string, StoryProjectLayoutDocument>>;
}>;

export type StoryProjectLayoutInput<TRequiredKind extends string, TOptionalKind extends string> = Readonly<{
  layoutVersion: number;
  rootPath: string;
  documents: Readonly<Record<TRequiredKind, StoryProjectLayoutDocument>> &
    Readonly<Partial<Record<TOptionalKind, StoryProjectLayoutDocument>>>;
}>;

export type StoryProjectLayoutProfile<TRequiredKind extends string, TOptionalKind extends string> = Readonly<{
  identity: Readonly<{ id: string; version: number }>;
  requiredDocumentKinds: readonly TRequiredKind[];
  optionalDocumentKinds: readonly TOptionalKind[];
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

export const defineStoryProjectLayout = <TRequiredKind extends string, TOptionalKind extends string>(
  profile: StoryProjectLayoutProfile<TRequiredKind, TOptionalKind>,
  input: StoryProjectLayoutInput<TRequiredKind, TOptionalKind>,
): StoryProjectLayout => {
  const knownKinds = new Set<string>([...profile.requiredDocumentKinds, ...profile.optionalDocumentKinds]);
  const actualKinds = Object.keys(input.documents);
  const missingKinds = profile.requiredDocumentKinds.filter((kind) => !actualKinds.includes(kind));
  const unknownKinds = actualKinds.filter((kind) => !knownKinds.has(kind));
  if (missingKinds.length > 0 || unknownKinds.length > 0) {
    throw new Error(
      `Layout 文档映射与 Profile 定义不一致；缺少必需文档：${missingKinds.join("、") || "无"}；未知文档：${unknownKinds.join("、") || "无"}。`,
    );
  }
  return parseStoryProjectLayout({
    ...input,
    profile: profile.identity,
  });
};
