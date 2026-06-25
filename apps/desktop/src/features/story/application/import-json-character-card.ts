import type { StoryImportDraftInput } from "./import-draft";
import {
  firstNonEmpty,
  isRecord,
  joinSections,
  trimText,
} from "./import-bridge-utils";
import { normalizeWorldBookEntries } from "./import-normalizers";

export const looksLikeCharacterCard = (value: Record<string, unknown>) => {
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

export const createDraftFromCharacterCard = (
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
      avatar: firstNonEmpty(rawData.avatar, rawData.avatarUrl, rawData.image),
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
