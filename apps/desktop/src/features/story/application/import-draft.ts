export type StoryImportDraftMode = "story" | "lorebookPatch";

export type StoryImportSourceKind =
  | "json"
  | "plainText"
  | "aiGenerated"
  | "characterCard"
  | "worldBook"
  | "unknown";

export type StoryImportDraftLorebookEntry = {
  id: string;
  title: string;
  content: string;
  keywords: string[];
  enabled: boolean;
  alwaysOn: boolean;
};

export type StoryImportDraftCharacter = {
  id: string;
  name: string;
  avatar?: string;
  description: string;
  speakingStyle: string;
  writingStyle?: string;
  replyStylePrompt?: string;
  goals?: string;
  memory?: string;
  relationships?: unknown[];
  extra?: Record<string, unknown>;
};

export type StoryImportDraftScene = {
  id: string;
  title: string;
  scene: string;
  goal: string;
  plot: string;
  direction: string;
  transition: string;
  memory: string;
  characterIds: string[];
  activeCharacterId?: string;
  lorebookEntries: StoryImportDraftLorebookEntry[];
  extra?: Record<string, unknown>;
};

export type StoryImportDraftMessage = {
  role: "user" | "character" | "narrator";
  characterId?: string;
  content: string;
};

export type StoryImportDraftInput = {
  mode?: StoryImportDraftMode;
  sourceKind?: StoryImportSourceKind;
  label?: string;
  description?: string;
  story?: {
    title?: string;
    outline?: string;
    goal?: string;
    userPersonaName?: string;
  };
  characters?: Array<Partial<StoryImportDraftCharacter>>;
  scenes?: Array<Partial<StoryImportDraftScene>>;
  lorebookEntries?: Array<Partial<StoryImportDraftLorebookEntry>>;
  messages?: StoryImportDraftMessage[];
  runtimeHints?: Record<string, unknown>;
  createdAt?: number;
};

export type StoryImportDraft = {
  id: string;
  version: 1;
  mode: StoryImportDraftMode;
  sourceKind: StoryImportSourceKind;
  label: string;
  description: string;
  story: {
    title: string;
    outline: string;
    goal: string;
    userPersonaName: string;
  };
  characters: StoryImportDraftCharacter[];
  scenes: StoryImportDraftScene[];
  lorebookEntries: StoryImportDraftLorebookEntry[];
  messages: StoryImportDraftMessage[];
  runtimeHints: Record<string, unknown>;
  createdAt: number;
};

const createDraftId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const trimText = (value: unknown) => typeof value === "string" ? value.trim() : "";

const trimStringArray = (value: unknown) => Array.isArray(value)
  ? value.flatMap((item) => {
      const text = trimText(item);
      return text ? [text] : [];
    })
  : [];

const normalizeLorebookEntry = (
  entry: Partial<StoryImportDraftLorebookEntry>,
  index: number,
): StoryImportDraftLorebookEntry | null => {
  const content = trimText(entry.content);
  if (!content) {
    return null;
  }

  const title = trimText(entry.title) || `世界书 ${index + 1}`;
  return {
    id: trimText(entry.id) || createDraftId("import-lore"),
    title,
    content,
    keywords: trimStringArray(entry.keywords),
    enabled: entry.enabled !== false,
    alwaysOn: entry.alwaysOn === true,
  };
};

const normalizeCharacter = (
  character: Partial<StoryImportDraftCharacter>,
  index: number,
): StoryImportDraftCharacter | null => {
  const name = trimText(character.name) || `角色 ${index + 1}`;
  const description = trimText(character.description);
  const speakingStyle = trimText(character.speakingStyle);
  if (!description && !speakingStyle) {
    return null;
  }

  return {
    id: trimText(character.id) || `char-${index + 1}`,
    name,
    avatar: trimText(character.avatar),
    description,
    speakingStyle: speakingStyle || "自然回应，保持人设一致。",
    writingStyle: trimText(character.writingStyle) || undefined,
    replyStylePrompt: trimText(character.replyStylePrompt) || undefined,
    goals: trimText(character.goals) || undefined,
    memory: trimText(character.memory) || undefined,
    relationships: Array.isArray(character.relationships) ? character.relationships : undefined,
    extra: character.extra,
  };
};

const normalizeScene = (
  scene: Partial<StoryImportDraftScene>,
  index: number,
): StoryImportDraftScene | null => {
  const sceneText = trimText(scene.scene);
  const title = trimText(scene.title) || `场景 ${index + 1}`;
  if (!sceneText && !trimText(scene.goal) && !trimText(scene.plot)) {
    return null;
  }

  return {
    id: trimText(scene.id) || `scene-${index + 1}`,
    title,
    scene: sceneText,
    goal: trimText(scene.goal),
    plot: trimText(scene.plot),
    direction: trimText(scene.direction),
    transition: trimText(scene.transition),
    memory: trimText(scene.memory),
    characterIds: trimStringArray(scene.characterIds),
    activeCharacterId: trimText(scene.activeCharacterId) || undefined,
    lorebookEntries: (scene.lorebookEntries ?? [])
      .flatMap((entry, entryIndex) => {
        const normalized = normalizeLorebookEntry(entry, entryIndex);
        return normalized ? [normalized] : [];
      }),
    extra: scene.extra,
  };
};

export const createStoryImportDraft = (
  input: StoryImportDraftInput,
): StoryImportDraft => {
  const createdAt = input.createdAt ?? Date.now();
  const characters = (input.characters ?? [])
    .flatMap((character, index) => {
      const normalized = normalizeCharacter(character, index);
      return normalized ? [normalized] : [];
    });
  const lorebookEntries = (input.lorebookEntries ?? [])
    .flatMap((entry, index) => {
      const normalized = normalizeLorebookEntry(entry, index);
      return normalized ? [normalized] : [];
    });
  const scenes = (input.scenes ?? [])
    .flatMap((scene, index) => {
      const normalized = normalizeScene(scene, index);
      return normalized ? [normalized] : [];
    });
  const title = trimText(input.story?.title) ||
    trimText(input.label) ||
    (input.mode === "lorebookPatch" ? "导入世界书" : "导入故事");

  return {
    id: createDraftId("story-import"),
    version: 1,
    mode: input.mode ?? "story",
    sourceKind: input.sourceKind ?? "unknown",
    label: trimText(input.label) || title,
    description: trimText(input.description),
    story: {
      title,
      outline: trimText(input.story?.outline),
      goal: trimText(input.story?.goal),
      userPersonaName: trimText(input.story?.userPersonaName) || "我",
    },
    characters,
    scenes,
    lorebookEntries,
    messages: (input.messages ?? []).filter((message) => message.content.trim()),
    runtimeHints: input.runtimeHints ?? {},
    createdAt,
  };
};

export const assertStoryImportDraftReady = (
  draft: StoryImportDraft,
) => {
  if (draft.mode === "lorebookPatch") {
    if (draft.lorebookEntries.length === 0) {
      throw new Error("导入草稿没有可确认的世界书条目。");
    }
    return;
  }

  if (!draft.story.title.trim()) {
    throw new Error("导入草稿缺少故事标题。");
  }

  if (
    !draft.story.outline.trim() &&
    !draft.story.goal.trim() &&
    draft.characters.length === 0 &&
    draft.scenes.length === 0 &&
    draft.lorebookEntries.length === 0
  ) {
    throw new Error("导入草稿没有可确认的故事内容。");
  }
};
