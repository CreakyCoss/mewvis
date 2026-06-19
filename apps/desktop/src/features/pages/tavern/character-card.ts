import type { TavernCharacter } from "./types";

const CHARACTER_CARD_TYPE = "novel-claw:tavern-character";

export type TavernCharacterCard = {
  type: typeof CHARACTER_CARD_TYPE;
  version: 1;
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  writingStyle?: string;
  replyStylePrompt?: string;
  goals?: string;
  relationships?: string;
};

export type TavernCharacterCardInput = Pick<
  TavernCharacter,
  "name" | "avatar" | "description" | "speakingStyle" | "goals" | "relationships"
  | "writingStyle" | "replyStylePrompt"
>;

const textValue = (value: unknown) => typeof value === "string" ? value.trim() : "";

export const tavernCharacterToCard = (
  character: TavernCharacter,
): TavernCharacterCard => ({
  type: CHARACTER_CARD_TYPE,
  version: 1,
  name: character.name,
  avatar: character.avatar,
  description: character.description,
  speakingStyle: character.speakingStyle,
  writingStyle: character.writingStyle,
  replyStylePrompt: character.replyStylePrompt,
  goals: character.goals,
  relationships: character.relationships,
});

export const stringifyTavernCharacterCard = (character: TavernCharacter) =>
  JSON.stringify(tavernCharacterToCard(character), null, 2);

export const parseTavernCharacterCard = (raw: string): TavernCharacterCardInput => {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("角色卡格式无效");
  }

  const name = textValue(parsed.name);
  const description = textValue(parsed.description);
  const speakingStyle = textValue(parsed.speakingStyle);
  if (!name || !description || !speakingStyle) {
    throw new Error("角色卡缺少名称、设定或说话方式");
  }

  return {
    name,
    avatar: textValue(parsed.avatar) || "tavern-01",
    description,
    speakingStyle,
    writingStyle: textValue(parsed.writingStyle) || undefined,
    replyStylePrompt: textValue(parsed.replyStylePrompt) || undefined,
    goals: textValue(parsed.goals) || undefined,
    relationships: textValue(parsed.relationships) || undefined,
  };
};
