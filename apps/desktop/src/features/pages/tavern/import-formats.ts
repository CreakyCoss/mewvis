import type {
  TavernGeneratedPresetJson,
  TavernGeneratedPresetRoom,
  TavernProgressVisibility,
  TavernRoomSettings,
} from "./types";

export type TavernImportedLorebookEntry = {
  title: string;
  content: string;
  keywords: string[];
  enabled: boolean;
  alwaysOn: boolean;
};

export type TavernExternalImportPayload =
  | {
      kind: "generatedPreset";
      preset: TavernGeneratedPresetJson;
    }
  | {
      kind: "characterCard";
      preset: TavernGeneratedPresetJson;
    }
  | {
      kind: "worldBook";
      entries: TavernImportedLorebookEntry[];
      label: string;
    };

const textValue = (value: unknown) => typeof value === "string" ? value.trim() : "";

const stringArrayValue = (value: unknown) => Array.isArray(value)
  ? value.flatMap((item) => {
      const text = textValue(item);
      return text ? [text] : [];
    })
  : [];

const recordArrayValue = (value: unknown) => Array.isArray(value)
  ? value.filter(isRecord)
  : [];

const firstNonEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const text = textValue(value);
    if (text) {
      return text;
    }
  }

  return "";
};

const progressVisibilityValue = (
  value: unknown,
  fallback: TavernProgressVisibility,
): TavernProgressVisibility => {
  const text = textValue(value);
  return text === "public" ||
    text === "owner" ||
    text === "team" ||
    text === "private" ||
    text === "director" ||
    text === "hidden" ||
    text === "debug"
    ? text
    : fallback;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const parseJsonObject = (raw: string) => {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("导入文件必须是 JSON 对象。");
  }

  return parsed;
};

const normalizeWorldBookEntries = (entries: unknown): TavernImportedLorebookEntry[] => {
  const sourceEntries = Array.isArray(entries)
    ? entries
    : isRecord(entries)
    ? Object.values(entries)
    : [];

  return sourceEntries.flatMap((entry, index): TavernImportedLorebookEntry[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const content = textValue(entry.content);
    if (!content) {
      return [];
    }

    const primaryKeys = stringArrayValue(entry.key);
    const secondaryKeys = stringArrayValue(entry.keysecondary);
    const keywords = [...new Set([...primaryKeys, ...secondaryKeys])];
    const title = firstNonEmpty(
      entry.comment,
      entry.name,
      entry.title,
      keywords[0],
      typeof entry.uid === "number" || typeof entry.uid === "string"
        ? `世界书 ${entry.uid}`
        : `世界书 ${index + 1}`,
    );

    return [{
      title,
      content,
      keywords,
      enabled: entry.disable !== true,
      alwaysOn: entry.constant === true,
    }];
  });
};

const normalizeGeneratedLorebookEntries = (...sources: unknown[]) =>
  sources.flatMap((source) => {
    const entries = parseSillyTavernWorldBookJson(source);
    return entries.map((entry) => ({
      title: entry.title,
      content: entry.content,
      keywords: entry.keywords,
      enabled: entry.enabled,
      alwaysOn: entry.alwaysOn,
    }));
  });

export const parseSillyTavernWorldBookJson = (
  value: unknown,
): TavernImportedLorebookEntry[] => {
  if (!isRecord(value)) {
    return [];
  }

  if ("entries" in value) {
    return normalizeWorldBookEntries(value.entries);
  }

  return normalizeWorldBookEntries(value);
};

const joinSections = (
  sections: Array<[string, unknown]>,
) => sections.flatMap(([label, value]) => {
  const text = textValue(value);
  return text ? [`${label}：\n${text}`] : [];
}).join("\n\n");

const createCardGeneratedPreset = (
  card: Record<string, unknown>,
): TavernGeneratedPresetJson | null => {
  const rawData = isRecord(card.data) ? card.data : card;
  const name = firstNonEmpty(rawData.name, card.name);
  const description = joinSections([
    ["角色设定", rawData.description],
    ["性格", rawData.personality],
    ["作者注释", rawData.creator_notes],
  ]) || textValue(rawData.description);
  if (!name || !description) {
    return null;
  }

  const scenario = textValue(rawData.scenario);
  const firstMessage = firstNonEmpty(rawData.first_mes, rawData.firstMessage);
  const examples = firstNonEmpty(rawData.speakingStyle, rawData.mes_example, rawData.dialogue_examples);
  const systemPrompt = firstNonEmpty(rawData.replyStylePrompt) || joinSections([
    ["角色卡系统提示", rawData.system_prompt],
    ["后置历史指令", rawData.post_history_instructions],
  ]);
  const characterBook = isRecord(rawData.character_book)
    ? rawData.character_book
    : isRecord(rawData.extensions) && isRecord(rawData.extensions.character_book)
    ? rawData.extensions.character_book
    : null;
  const lorebookEntries = characterBook
    ? parseSillyTavernWorldBookJson(characterBook)
    : [];
  const room: TavernGeneratedPresetRoom = {
    title: `${name}（角色卡导入）`,
    promptStyleId: "novel",
    storyOutline: scenario || description,
    scene: scenario || `与${name}相关的故事场景尚未配置。`,
    sceneGoal: "",
    userPersonaName: "我",
    characterIds: ["main"],
    activeCharacterId: "main",
    lorebookEntries,
  };

  return {
    version: 1,
    label: name,
    description: "由角色卡导入。",
    room,
    characters: [{
      id: "main",
      name,
      avatar: "",
      description,
      speakingStyle: examples || "自然回应，保持角色口吻和人设一致。",
      writingStyle: textValue(rawData.writingStyle) || undefined,
      replyStylePrompt: systemPrompt || undefined,
      goals: firstNonEmpty(rawData.goals, rawData.creator_notes) || undefined,
      relationships: firstNonEmpty(rawData.relationships, scenario) || undefined,
    }],
    messages: firstMessage
      ? [{
          role: "character",
          characterId: "main",
          content: firstMessage,
        }]
      : [{
          role: "narrator",
          content: `已从角色卡导入「${name}」。`,
        }],
  };
};

const normalizeScriptCharacters = (characters: unknown) =>
  recordArrayValue(characters).flatMap((character, index) => {
    const name = firstNonEmpty(character.name, character.label, character.title);
    const description = joinSections([
      ["角色设定", firstNonEmpty(character.description, character.persona, character.profile)],
      ["性格", character.personality],
      ["背景", character.background],
      ["目标", character.goals],
    ]);
    if (!name || !description) {
      return [];
    }

    return [{
      id: firstNonEmpty(character.id, character.key, `char-${index + 1}`),
      name,
      avatar: textValue(character.avatar),
      description,
      speakingStyle: firstNonEmpty(
        character.speakingStyle,
        character.replyStyle,
        character.dialogueStyle,
        "自然回应，保持人设一致。",
      ),
      writingStyle: firstNonEmpty(character.writingStyle, character.narrationStyle) || undefined,
      replyStylePrompt: firstNonEmpty(character.replyStylePrompt, character.systemPrompt) || undefined,
      goals: firstNonEmpty(character.goals, character.objective) || undefined,
      relationships: firstNonEmpty(character.relationships) || undefined,
      memory: firstNonEmpty(character.memory, character.privateMemory) || undefined,
    }];
  });

const normalizeScriptFactEvents = (
  facts: unknown,
  defaultVisibility: TavernProgressVisibility = "private",
) => recordArrayValue(facts).flatMap((fact, index) => {
  const evidence = firstNonEmpty(fact.evidence, fact.content, fact.text, fact.description, fact.value);
  if (!evidence) {
    return [];
  }

  return [{
    ...fact,
    id: firstNonEmpty(fact.id, `import-fact-${index + 1}`),
    turnId: firstNonEmpty(fact.turnId, "initial"),
    sourceMessageIds: Array.isArray(fact.sourceMessageIds) ? fact.sourceMessageIds : [],
    type: firstNonEmpty(fact.type, fact.kind, "hidden_truth"),
    evidence,
    confidence: typeof fact.confidence === "number" ? fact.confidence : 1,
    visibility: progressVisibilityValue(fact.visibility, defaultVisibility),
  }];
});

const normalizeScriptInformationPolicy = (script: Record<string, unknown>) => {
  const settings = isRecord(script.settings) ? script.settings : {};
  const sourcePolicy = isRecord(script.informationPolicy)
    ? script.informationPolicy
    : isRecord(settings.informationPolicy)
    ? settings.informationPolicy
    : {};
  const sourceRoleAssignment = isRecord(sourcePolicy.roleAssignment) ? sourcePolicy.roleAssignment : {};
  const rolePool = Array.isArray(script.rolePool)
    ? script.rolePool
    : Array.isArray(script.roles)
    ? script.roles
    : Array.isArray(sourceRoleAssignment.rolePool)
    ? sourceRoleAssignment.rolePool
    : [];
  const mode = firstNonEmpty(script.mode, sourcePolicy.mode);
  const isDeductionLike = mode === "social_deduction" ||
    mode === "mystery" ||
    rolePool.length > 0 ||
    recordArrayValue(script.privateFacts).length > 0 ||
    recordArrayValue(script.hiddenFacts).length > 0;

  return {
    ...sourcePolicy,
    mode: firstNonEmpty(sourcePolicy.mode, mode, isDeductionLike ? "social_deduction" : "open"),
    uiDefaultView: firstNonEmpty(sourcePolicy.uiDefaultView, isDeductionLike ? "public" : "reveal"),
    hideCharacterThoughts: typeof sourcePolicy.hideCharacterThoughts === "boolean"
      ? sourcePolicy.hideCharacterThoughts
      : isDeductionLike,
    revealThoughts: firstNonEmpty(sourcePolicy.revealThoughts, isDeductionLike ? "sceneOutcome" : "manual"),
    hiddenFacts: {
      ...(isRecord(sourcePolicy.hiddenFacts) ? sourcePolicy.hiddenFacts : {}),
      enabled: isDeductionLike,
      defaultVisibility: firstNonEmpty(
        isRecord(sourcePolicy.hiddenFacts) ? sourcePolicy.hiddenFacts.defaultVisibility : undefined,
        "director",
      ),
      reveal: firstNonEmpty(
        isRecord(sourcePolicy.hiddenFacts) ? sourcePolicy.hiddenFacts.reveal : undefined,
        isDeductionLike ? "sceneOutcome" : "manual",
      ),
    },
    roleAssignment: {
      ...sourceRoleAssignment,
      enabled: typeof sourceRoleAssignment.enabled === "boolean"
        ? sourceRoleAssignment.enabled
        : rolePool.length > 0,
      strategy: firstNonEmpty(sourceRoleAssignment.strategy, rolePool.length > 0 ? "director_random" : "manual"),
      includeUser: sourceRoleAssignment.includeUser !== false,
      revealToAssignedCharacter: sourceRoleAssignment.revealToAssignedCharacter !== false,
      revealFactionMembers: sourceRoleAssignment.revealFactionMembers !== false,
      rolePool,
    },
  };
};

const createScriptGeneratedPreset = (
  script: Record<string, unknown>,
): TavernGeneratedPresetJson | null => {
  const characters = normalizeScriptCharacters(script.characters);
  if (characters.length === 0) {
    return null;
  }

  const background = firstNonEmpty(script.background, script.worldInfo, script.world, script.setting);
  const title = firstNonEmpty(script.title, script.name, script.label, "导入互动剧本");
  const lorebookEntries = [
    ...normalizeGeneratedLorebookEntries(script.lorebookEntries, script.worldBook, script.worldbook),
    ...(background ? [{
      title: "背景设定",
      content: background,
      keywords: ["背景", "世界观"],
      enabled: true,
      alwaysOn: true,
    }] : []),
  ];
  const factEvents = [
    ...normalizeScriptFactEvents(script.factEvents, "public"),
    ...normalizeScriptFactEvents(script.privateFacts, "private"),
    ...normalizeScriptFactEvents(script.hiddenFacts, "director"),
  ];
  const settings: Partial<TavernRoomSettings> = {
    ...(isRecord(script.settings) ? script.settings : {}),
    informationPolicy: normalizeScriptInformationPolicy(script) as TavernRoomSettings["informationPolicy"],
  };
  const firstMessage = firstNonEmpty(script.openingMessage, script.firstMessage, script.opening);
  const room: TavernGeneratedPresetRoom = {
    title,
    promptStyleId: firstNonEmpty(script.promptStyleId, script.promptStyle, "novel"),
    storyOutline: firstNonEmpty(script.storyOutline, script.premise, script.summary, background),
    storyGoal: firstNonEmpty(script.storyGoal, script.goal, script.objective),
    scene: firstNonEmpty(script.scene, script.scenario, script.premise, background, `${title} 的起始场景。`),
    sceneGoal: firstNonEmpty(script.sceneGoal, script.goal, script.objective),
    userPersonaName: firstNonEmpty(script.userPersonaName, script.userName, "我"),
    characterIds: characters.map((character) => character.id),
    activeCharacterId: characters[0]?.id,
    lorebookEntries,
    factEvents,
    statusDefinitions: Array.isArray(script.statusDefinitions) ? script.statusDefinitions : [],
    statusRules: Array.isArray(script.statusRules) ? script.statusRules : [],
    progressViews: Array.isArray(script.progressViews) ? script.progressViews : [],
    progressTracker: isRecord(script.progressTracker) ? script.progressTracker : undefined,
    taskDefinitions: Array.isArray(script.taskDefinitions)
      ? script.taskDefinitions
      : Array.isArray(script.tasks)
      ? script.tasks
      : [],
    sceneOutcomes: Array.isArray(script.sceneOutcomes)
      ? script.sceneOutcomes
      : Array.isArray(script.outcomes)
      ? script.outcomes
      : [],
    settings,
  };

  return {
    version: 1,
    label: title,
    description: firstNonEmpty(script.description, script.summary, "由互动剧本 JSON 导入。"),
    room,
    characters,
    messages: firstMessage
      ? [{ role: "narrator", content: firstMessage }]
      : [{ role: "narrator", content: `已导入互动剧本「${title}」。` }],
  };
};

const looksLikeScriptPreset = (value: Record<string, unknown>) => {
  const marker = firstNonEmpty(value.type, value.spec, value.schema, value.kind);
  if (
    marker === "novel-claw:tavern-script" ||
    marker === "tavern_script" ||
    marker === "interactive_script"
  ) {
    return true;
  }

  return Array.isArray(value.characters) && (
    Array.isArray(value.statusDefinitions) ||
    Array.isArray(value.statusRules) ||
    Array.isArray(value.taskDefinitions) ||
    Array.isArray(value.tasks) ||
    Array.isArray(value.sceneOutcomes) ||
    Array.isArray(value.outcomes) ||
    Array.isArray(value.privateFacts) ||
    Array.isArray(value.hiddenFacts) ||
    Array.isArray(value.rolePool)
  );
};

const looksLikeGeneratedPreset = (value: Record<string, unknown>) =>
  isRecord(value.room) && Array.isArray(value.characters);

const looksLikeCharacterCard = (value: Record<string, unknown>) => {
  if (value.type === "novel-claw:tavern-character") {
    return true;
  }

  if (value.spec === "chara_card_v2" || value.spec === "chara_card_v3") {
    return true;
  }

  const data = isRecord(value.data) ? value.data : value;
  return typeof data.name === "string" &&
    (
      typeof data.description === "string" ||
      typeof data.personality === "string" ||
      typeof data.first_mes === "string"
    );
};

const looksLikePromptPreset = (value: Record<string, unknown>) =>
  Array.isArray(value.prompts) ||
  typeof value.chat_completion_source === "string" ||
  typeof value.openai_model === "string";

export const parseTavernExternalImportJson = (
  raw: string,
): TavernExternalImportPayload => {
  const parsed = parseJsonObject(raw);

  if (looksLikeGeneratedPreset(parsed)) {
    return {
      kind: "generatedPreset",
      preset: parsed as TavernGeneratedPresetJson,
    };
  }

  if (looksLikeScriptPreset(parsed)) {
    const preset = createScriptGeneratedPreset(parsed);
    if (!preset) {
      throw new Error("互动剧本缺少可导入角色。");
    }
    return {
      kind: "generatedPreset",
      preset,
    };
  }

  if (looksLikeCharacterCard(parsed)) {
    const preset = createCardGeneratedPreset(parsed);
    if (!preset) {
      throw new Error("角色卡缺少角色名称或角色设定。");
    }
    return {
      kind: "characterCard",
      preset,
    };
  }

  if ("entries" in parsed) {
    const entries = parseSillyTavernWorldBookJson(parsed);
    if (entries.length === 0) {
      throw new Error("世界书没有可导入条目。");
    }
    return {
      kind: "worldBook",
      entries,
      label: firstNonEmpty(parsed.name, parsed.label, parsed.title, "世界书"),
    };
  }

  if (looksLikePromptPreset(parsed)) {
    throw new Error("这是提示词预设，不是角色卡、世界书或酒馆房间；请在系统提示词风格中手动整理后使用。");
  }

  throw new Error("导入文件格式不受支持。");
};
