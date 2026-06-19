import type {
  TavernGeneratedPresetJson,
  TavernGeneratedPresetRoom,
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

const firstNonEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const text = textValue(value);
    if (text) {
      return text;
    }
  }

  return "";
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
