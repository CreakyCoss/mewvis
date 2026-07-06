import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { TavernCharacter, TavernStatusValue } from "@/features/pages/taverns/manage/model";
import { getTavernStatusSnapshotValue } from "./progress-engine";

export type TavernRoundParticipant =
  | {
      type: "user";
      id: "user";
      name: string;
    }
  | {
      type: "character";
      id: string;
      name: string;
      character: TavernCharacter;
    };

const speechStateStatusIds = new Set(["player_state", "alive_state", "life_state", "survival_state"]);

const unavailableSpeechStates = new Set([
  "dead",
  "death",
  "eliminated",
  "out",
  "killed",
  "死亡",
  "阵亡",
  "淘汰",
  "出局",
  "离场",
]);

const normalizeSpeechState = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "");

const statusValueDisablesSpeech = (value: TavernStatusValue) => {
  if (typeof value === "boolean") {
    return !value;
  }
  if (typeof value === "string") {
    return unavailableSpeechStates.has(normalizeSpeechState(value));
  }
  if (Array.isArray(value)) {
    return value.some((item) => unavailableSpeechStates.has(normalizeSpeechState(item)));
  }
  return false;
};

export const isTavernCharacterAvailableForSpeech = (
  room: Pick<TavernRoom, "statusDefinitions" | "statusSnapshot">,
  character: TavernCharacter,
) => {
  for (const definition of room.statusDefinitions) {
    if (definition.scope !== "character") {
      continue;
    }

    const value =
      getTavernStatusSnapshotValue(
        room.statusSnapshot,
        { type: "character", characterId: character.id },
        definition.id,
      ) ?? definition.defaultValue;

    if (definition.id === "health" && typeof value === "number" && value <= 0) {
      return false;
    }

    if (speechStateStatusIds.has(definition.id) && statusValueDisablesSpeech(value)) {
      return false;
    }
  }

  return true;
};

export const orderTavernRoundSpeakers = ({
  room,
  characters,
  activeCharacterId,
}: {
  room: Pick<TavernRoom, "statusDefinitions" | "statusSnapshot">;
  characters: TavernCharacter[];
  activeCharacterId?: string;
}) => {
  const availableCharacters = characters.filter((character) => isTavernCharacterAvailableForSpeech(room, character));

  if (!activeCharacterId) {
    return availableCharacters;
  }

  const activeIndex = availableCharacters.findIndex((character) => character.id === activeCharacterId);
  if (activeIndex <= 0) {
    return availableCharacters;
  }

  return [...availableCharacters.slice(activeIndex), ...availableCharacters.slice(0, activeIndex)];
};

export const orderTavernRoundParticipants = ({
  room,
  characters,
  activeCharacterId,
  includeUser = false,
  userPosition = "first",
  userPersonaName,
}: {
  room: Pick<TavernRoom, "statusDefinitions" | "statusSnapshot">;
  characters: TavernCharacter[];
  activeCharacterId?: string;
  includeUser?: boolean;
  userPosition?: "first" | "last";
  userPersonaName?: string;
}): TavernRoundParticipant[] => {
  const characterParticipants: TavernRoundParticipant[] = orderTavernRoundSpeakers({
    room,
    characters,
    activeCharacterId,
  }).map((character) => ({
    type: "character" as const,
    id: character.id,
    name: character.name,
    character,
  }));

  if (!includeUser) {
    return characterParticipants;
  }

  const userParticipant: TavernRoundParticipant = {
    type: "user",
    id: "user",
    name: userPersonaName?.trim() || "你",
  };

  return userPosition === "last"
    ? [...characterParticipants, userParticipant]
    : [userParticipant, ...characterParticipants];
};
