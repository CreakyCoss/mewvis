import type { StoryImportDraftInput } from "./import-draft";
import {
  firstNonEmpty,
  isRecord,
  joinSections,
  stringArrayValue,
  trimText,
} from "./import-bridge-utils";
import {
  normalizeCharacters,
  normalizeScenes,
  normalizeWorldBookEntries,
} from "./import-normalizers";

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
  const characters = normalizeCharacters(value.characters);
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
    characters,
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
            characterIds: characters.map((character) => character.id),
            activeCharacterId: characters[0]?.id,
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

export const createStoryImportDraftInputFromJsonValue = (
  value: unknown,
): StoryImportDraftInput => {
  if (!isRecord(value)) {
    throw new Error("导入内容必须是 JSON 对象。");
  }

  if (looksLikeGeneratedPreset(value)) {
    return createDraftFromGeneratedPreset(value);
  }

  if (looksLikeCharacterCard(value)) {
    return createDraftFromCharacterCard(value);
  }

  if (looksLikeWorldBook(value)) {
    const entries = [
      ...normalizeWorldBookEntries(value.entries),
      ...normalizeWorldBookEntries(value.lorebookEntries),
      ...normalizeWorldBookEntries(value.worldBook),
      ...normalizeWorldBookEntries(value.worldbook),
    ];
    if (entries.length > 0 && !looksLikeScript(value)) {
      return {
        mode: "lorebookPatch",
        sourceKind: "worldBook",
        label: firstNonEmpty(value.name, value.label, value.title, "导入世界书"),
        description: "由世界书 JSON 转换。",
        lorebookEntries: entries,
      };
    }
  }

  const standardDraft = looksLikeStandardStory(value)
    ? createDraftFromStandardStory(value)
    : null;
  if (standardDraft) {
    return standardDraft;
  }

  if (looksLikeScript(value)) {
    return createDraftFromScript(value);
  }

  throw new Error("导入 JSON 没有可识别的故事、角色、场景或世界书内容。");
};
