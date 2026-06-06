import type { TavernCharacter } from "./types";

const CHARACTER_CARD_TYPE = "novel-claw:tavern-character";

export type TavernCharacterCard = {
  type: typeof CHARACTER_CARD_TYPE;
  version: 1;
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  goals?: string;
  relationships?: string;
  modelConfig?: {
    providerId: string;
    modelId: string;
  };
};

export type TavernCharacterCardInput = Pick<
  TavernCharacter,
  "name" | "avatar" | "description" | "speakingStyle" | "goals" | "relationships" | "modelConfig"
>;

const textValue = (value: unknown) => typeof value === "string" ? value.trim() : "";

const modelConfigValue = (value: unknown) => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const providerId = textValue((value as Record<string, unknown>).providerId);
  const modelId = textValue((value as Record<string, unknown>).modelId);

  return providerId && modelId
    ? {
        providerId,
        modelId,
      }
    : undefined;
};

export const tavernCharacterToCard = (
  character: TavernCharacter,
): TavernCharacterCard => ({
  type: CHARACTER_CARD_TYPE,
  version: 1,
  name: character.name,
  avatar: character.avatar,
  description: character.description,
  speakingStyle: character.speakingStyle,
  goals: character.goals,
  relationships: character.relationships,
  modelConfig: character.modelConfig,
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
    goals: textValue(parsed.goals) || undefined,
    relationships: textValue(parsed.relationships) || undefined,
    modelConfig: modelConfigValue(parsed.modelConfig),
  };
};
