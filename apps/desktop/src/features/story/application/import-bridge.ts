import {
  createStoryImportDraft,
  type StoryImportDraft,
  type StoryImportDraftInput,
  type StoryImportDraftLorebookEntry,
  type StoryImportDraftScene,
  type StoryImportSourceKind,
} from "./import-draft";

const trimText = (value: unknown) => typeof value === "string" ? value.trim() : "";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const stringArrayValue = (value: unknown) => Array.isArray(value)
  ? value.flatMap((item) => {
      const text = trimText(item);
      return text ? [text] : [];
    })
  : [];

const recordArrayValue = (value: unknown) => Array.isArray(value)
  ? value.filter(isRecord)
  : [];

const firstNonEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const text = trimText(value);
    if (text) {
      return text;
    }
  }

  return "";
};

const joinSections = (
  sections: Array<[string, unknown]>,
) => sections.flatMap(([label, value]) => {
  const text = trimText(value);
  return text ? [`${label}：\n${text}`] : [];
}).join("\n\n");

const parseJsonObject = (raw: string) => {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("导入内容必须是 JSON 对象。");
  }

  return parsed;
};

const normalizeWorldBookEntries = (entries: unknown): StoryImportDraftLorebookEntry[] => {
  const sourceEntries = Array.isArray(entries)
    ? entries
    : isRecord(entries)
    ? Object.values(entries)
    : [];

  return sourceEntries.flatMap((entry, index): StoryImportDraftLorebookEntry[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const content = firstNonEmpty(entry.content, entry.text, entry.description);
    if (!content) {
      return [];
    }

    const keywords = [
      ...stringArrayValue(entry.keywords),
      ...stringArrayValue(entry.key),
      ...stringArrayValue(entry.keysecondary),
    ];
    const title = firstNonEmpty(
      entry.title,
      entry.name,
      entry.comment,
      keywords[0],
      typeof entry.uid === "number" || typeof entry.uid === "string"
        ? `世界书 ${entry.uid}`
        : `世界书 ${index + 1}`,
    );

    return [{
      id: firstNonEmpty(entry.id, `lore-${index + 1}`),
      title,
      content,
      keywords: [...new Set(keywords)],
      enabled: entry.enabled !== false && entry.disable !== true,
      alwaysOn: entry.alwaysOn === true || entry.constant === true,
    }];
  });
};

const normalizeCharacters = (characters: unknown) =>
  recordArrayValue(characters).flatMap((character, index) => {
    const name = firstNonEmpty(character.name, character.label, character.title);
    const description = joinSections([
      ["角色设定", firstNonEmpty(character.description, character.persona, character.profile)],
      ["性格", character.personality],
      ["背景", character.background],
      ["目标", character.goals],
    ]);
    const speakingStyle = firstNonEmpty(
      character.speakingStyle,
      character.replyStyle,
      character.dialogueStyle,
      character.mes_example,
      character.dialogue_examples,
    );
    if (!name && !description && !speakingStyle) {
      return [];
    }

    return [{
      id: firstNonEmpty(character.id, character.key, `char-${index + 1}`),
      name: name || `角色 ${index + 1}`,
      avatar: trimText(character.avatar),
      description,
      speakingStyle: speakingStyle || "自然回应，保持人设一致。",
      writingStyle: firstNonEmpty(character.writingStyle, character.narrationStyle) || undefined,
      replyStylePrompt: firstNonEmpty(
        character.replyStylePrompt,
        character.systemPrompt,
        character.system_prompt,
        character.post_history_instructions,
      ) || undefined,
      goals: firstNonEmpty(character.goals, character.objective) || undefined,
      memory: firstNonEmpty(character.memory, character.privateMemory) || undefined,
      relationships: Array.isArray(character.relationships) ? character.relationships : undefined,
      extra: isRecord(character.extra) ? character.extra : undefined,
    }];
  });

const normalizeScenes = (scenes: unknown): StoryImportDraftScene[] =>
  recordArrayValue(scenes).flatMap((scene, index) => {
    const sceneText = firstNonEmpty(scene.scene, scene.scenario, scene.description, scene.content);
    const goal = firstNonEmpty(scene.goal, scene.sceneGoal, scene.objective);
    const plot = firstNonEmpty(scene.plot, scene.storyPlot, scene.progress);
    if (!sceneText && !goal && !plot) {
      return [];
    }

    return [{
      id: firstNonEmpty(scene.id, scene.key, `scene-${index + 1}`),
      title: firstNonEmpty(scene.title, scene.name, `场景 ${index + 1}`),
      scene: sceneText,
      goal,
      plot,
      direction: firstNonEmpty(scene.direction, scene.storyDirection),
      transition: firstNonEmpty(scene.transition, scene.sceneTransition),
      memory: firstNonEmpty(scene.memory, scene.summary),
      characterIds: stringArrayValue(scene.characterIds),
      activeCharacterId: firstNonEmpty(scene.activeCharacterId) || undefined,
      lorebookEntries: normalizeWorldBookEntries(scene.lorebookEntries),
      extra: isRecord(scene.extra) ? scene.extra : undefined,
    }];
  });

const looksLikeCharacterCard = (value: Record<string, unknown>) => {
  if (value.spec === "chara_card_v2" || value.spec === "chara_card_v3") {
    return true;
  }
  const data = isRecord(value.data) ? value.data : null;
  if (!data) {
    return false;
  }

  return (
    typeof data.name === "string" &&
    (
      typeof data.description === "string" ||
      typeof data.personality === "string" ||
      typeof data.first_mes === "string"
    )
  );
};

const createDraftFromCharacterCard = (
  value: Record<string, unknown>,
): StoryImportDraftInput => {
  const rawData = isRecord(value.data) ? value.data : value;
  const name = firstNonEmpty(rawData.name, value.name, "角色卡导入");
  const description = joinSections([
    ["角色设定", rawData.description],
    ["性格", rawData.personality],
    ["作者注释", rawData.creator_notes],
  ]) || trimText(rawData.description);
  const scenario = trimText(rawData.scenario);
  const characterBook = isRecord(rawData.character_book)
    ? rawData.character_book
    : isRecord(rawData.extensions) && isRecord(rawData.extensions.character_book)
    ? rawData.extensions.character_book
    : null;
  const characterBookEntries = characterBook && "entries" in characterBook
    ? characterBook.entries
    : characterBook;

  return {
    sourceKind: "characterCard",
    label: name,
    description: "由角色卡 JSON 转换。",
    story: {
      title: `${name}（角色卡导入）`,
      outline: scenario || description,
      goal: firstNonEmpty(rawData.goals, rawData.creator_notes),
      userPersonaName: "我",
    },
    characters: [{
      id: "main",
      name,
      description,
      speakingStyle: firstNonEmpty(
        rawData.speakingStyle,
        rawData.mes_example,
        rawData.dialogue_examples,
        "自然回应，保持角色口吻和人设一致。",
      ),
      writingStyle: trimText(rawData.writingStyle) || undefined,
      replyStylePrompt: firstNonEmpty(
        rawData.replyStylePrompt,
        rawData.system_prompt,
        rawData.post_history_instructions,
      ) || undefined,
      goals: firstNonEmpty(rawData.goals, rawData.creator_notes) || undefined,
    }],
    scenes: scenario
      ? [{
          id: "scene-main",
          title: "起始场景",
          scene: scenario,
          goal: "",
          plot: "",
          direction: "",
          transition: "",
          memory: "",
          characterIds: ["main"],
          activeCharacterId: "main",
          lorebookEntries: [],
        }]
      : [],
    lorebookEntries: characterBookEntries ? normalizeWorldBookEntries(characterBookEntries) : [],
    messages: firstNonEmpty(rawData.first_mes, rawData.firstMessage)
      ? [{
          role: "character",
          characterId: "main",
          content: firstNonEmpty(rawData.first_mes, rawData.firstMessage),
        }]
      : [],
  };
};

const createDraftFromGeneratedPreset = (
  value: Record<string, unknown>,
): StoryImportDraftInput => {
  const room = isRecord(value.room) ? value.room : {};
  const title = firstNonEmpty(room.title, value.label, value.title, "导入故事");
  const scene = firstNonEmpty(room.scene, room.scenario, room.storyOutline);
  const sceneGoal = firstNonEmpty(room.sceneGoal, room.goal, room.storyGoal);

  return {
    sourceKind: "json",
    label: title,
    description: firstNonEmpty(value.description, "由结构化 JSON 转换。"),
    story: {
      title,
      outline: firstNonEmpty(room.storyOutline, room.outline, scene),
      goal: firstNonEmpty(room.storyGoal, room.goal, sceneGoal),
      userPersonaName: firstNonEmpty(room.userPersonaName, room.userName, "我"),
    },
    characters: normalizeCharacters(value.characters),
    scenes: [
      ...normalizeScenes(room.scenes),
      ...(scene || sceneGoal
        ? [{
            id: "scene-main",
            title: "起始场景",
            scene,
            goal: sceneGoal,
            plot: firstNonEmpty(room.scenePlot, room.plot),
            direction: firstNonEmpty(room.sceneDirection, room.direction),
            transition: firstNonEmpty(room.sceneTransition, room.transition),
            memory: firstNonEmpty(room.sceneMemory, room.memory),
            characterIds: stringArrayValue(room.characterIds),
            activeCharacterId: firstNonEmpty(room.activeCharacterId) || undefined,
            lorebookEntries: [],
          }]
        : []),
    ],
    lorebookEntries: normalizeWorldBookEntries(room.lorebookEntries),
    messages: Array.isArray(value.messages)
      ? value.messages as StoryImportDraftInput["messages"]
      : [],
    runtimeHints: {
      source: "generatedPreset",
    },
  };
};

const createDraftFromScript = (
  value: Record<string, unknown>,
): StoryImportDraftInput => {
  const title = firstNonEmpty(value.title, value.name, value.label, "导入互动剧本");
  const background = firstNonEmpty(value.background, value.worldInfo, value.world, value.setting);
  const storyOutline = firstNonEmpty(value.storyOutline, value.premise, value.summary, background);
  const scenes = normalizeScenes(value.scenes);
  const openingScene = firstNonEmpty(value.scene, value.scenario, value.openingScene);
  const openingGoal = firstNonEmpty(value.sceneGoal, value.goal, value.objective);

  return {
    sourceKind: "json",
    label: title,
    description: firstNonEmpty(value.description, value.summary, "由互动剧本 JSON 转换。"),
    story: {
      title,
      outline: storyOutline,
      goal: firstNonEmpty(value.storyGoal, value.goal, value.objective),
      userPersonaName: firstNonEmpty(value.userPersonaName, value.userName, "我"),
    },
    characters: normalizeCharacters(value.characters),
    scenes: [
      ...scenes,
      ...(openingScene || openingGoal
        ? [{
            id: "scene-main",
            title: "起始场景",
            scene: openingScene || storyOutline,
            goal: openingGoal,
            plot: "",
            direction: "",
            transition: "",
            memory: "",
            characterIds: normalizeCharacters(value.characters).map((character) => character.id),
            activeCharacterId: normalizeCharacters(value.characters)[0]?.id,
            lorebookEntries: [],
          }]
        : []),
    ],
    lorebookEntries: [
      ...normalizeWorldBookEntries(value.lorebookEntries),
      ...normalizeWorldBookEntries(value.worldBook),
      ...normalizeWorldBookEntries(value.worldbook),
      ...(background
        ? [{
            id: "lore-background",
            title: "背景设定",
            content: background,
            keywords: ["背景", "世界观"],
            enabled: true,
            alwaysOn: true,
          }]
        : []),
    ],
    messages: firstNonEmpty(value.openingMessage, value.firstMessage, value.opening)
      ? [{
          role: "narrator",
          content: firstNonEmpty(value.openingMessage, value.firstMessage, value.opening),
        }]
      : [],
  };
};

const looksLikeGeneratedPreset = (value: Record<string, unknown>) =>
  isRecord(value.room) && Array.isArray(value.characters);

const looksLikeWorldBook = (value: Record<string, unknown>) =>
  "entries" in value || "lorebookEntries" in value || "worldBook" in value || "worldbook" in value;

const looksLikeScript = (value: Record<string, unknown>) =>
  Array.isArray(value.characters) ||
  Array.isArray(value.scenes) ||
  typeof value.storyOutline === "string" ||
  typeof value.premise === "string" ||
  typeof value.background === "string";

const looksLikeStandardStory = (value: Record<string, unknown>) =>
  isRecord(value.story) ||
  typeof value.outline === "string" ||
  typeof value.goal === "string" ||
  isRecord(value.graph) ||
  Array.isArray(value.lorebookEntries);

const createDraftFromStandardStory = (
  value: Record<string, unknown>,
): StoryImportDraftInput | null => {
  const storyRecord = isRecord(value.story) ? value.story : value;
  const title = firstNonEmpty(storyRecord.title, value.title);
  if (!title) {
    return null;
  }

  return {
    sourceKind: "json",
    label: title,
    description: firstNonEmpty(value.description, "由标准故事 JSON 转换。"),
    story: {
      title,
      outline: firstNonEmpty(
        storyRecord.outline,
        value.outline,
        value.storyOutline,
        value.premise,
        value.summary,
        value.background,
      ),
      goal: firstNonEmpty(storyRecord.goal, value.goal, value.storyGoal, value.objective),
      userPersonaName: firstNonEmpty(storyRecord.userPersonaName, value.userPersonaName, "我"),
    },
    characters: normalizeCharacters(value.characters),
    scenes: normalizeScenes(value.scenes),
    lorebookEntries: normalizeWorldBookEntries(value.lorebookEntries),
    messages: Array.isArray(value.messages)
      ? value.messages as StoryImportDraftInput["messages"]
      : [],
  };
};

const createDraftFromPlainText = (
  raw: string,
  sourceKind: StoryImportSourceKind = "plainText",
): StoryImportDraft => {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines[0] ?? "导入故事";
  const title = firstLine.replace(/^#+\s*/, "").slice(0, 80) || "导入故事";
  const content = raw.trim();

  return createStoryImportDraft({
    sourceKind,
    label: title,
    description: "由纯文本转换。",
    story: {
      title,
      outline: content,
      goal: "",
      userPersonaName: "我",
    },
    scenes: content
      ? [{
          id: "scene-main",
          title: "文本稿起点",
          scene: content,
          goal: "",
          plot: "",
          direction: "",
          transition: "",
          memory: "",
          characterIds: [],
          lorebookEntries: [],
        }]
      : [],
  });
};

export const createStoryImportDraftFromJsonValue = (
  value: unknown,
): StoryImportDraft => {
  if (!isRecord(value)) {
    throw new Error("导入内容必须是 JSON 对象。");
  }

  if (looksLikeGeneratedPreset(value)) {
    return createStoryImportDraft(createDraftFromGeneratedPreset(value));
  }

  if (looksLikeCharacterCard(value)) {
    return createStoryImportDraft(createDraftFromCharacterCard(value));
  }

  if (looksLikeWorldBook(value)) {
    const entries = [
      ...normalizeWorldBookEntries(value.entries),
      ...normalizeWorldBookEntries(value.lorebookEntries),
      ...normalizeWorldBookEntries(value.worldBook),
      ...normalizeWorldBookEntries(value.worldbook),
    ];
    if (entries.length > 0 && !looksLikeScript(value)) {
      return createStoryImportDraft({
        mode: "lorebookPatch",
        sourceKind: "worldBook",
        label: firstNonEmpty(value.name, value.label, value.title, "导入世界书"),
        description: "由世界书 JSON 转换。",
        lorebookEntries: entries,
      });
    }
  }

  const standardDraft = looksLikeStandardStory(value)
    ? createDraftFromStandardStory(value)
    : null;
  if (standardDraft) {
    return createStoryImportDraft(standardDraft);
  }

  if (looksLikeScript(value)) {
    return createStoryImportDraft(createDraftFromScript(value));
  }

  throw new Error("导入 JSON 没有可识别的故事、角色、场景或世界书内容。");
};

export const createStoryImportDraftFromText = (
  raw: string,
  {
    sourceKind,
  }: {
    sourceKind?: StoryImportSourceKind;
  } = {},
): StoryImportDraft => {
  const content = raw.trim();
  if (!content) {
    throw new Error("导入内容不能为空。");
  }

  if (sourceKind !== "plainText") {
    try {
      return createStoryImportDraftFromJsonValue(parseJsonObject(content));
    } catch (error) {
      if (sourceKind === "json") {
        throw error;
      }
    }
  }

  return createDraftFromPlainText(content, sourceKind ?? "plainText");
};
