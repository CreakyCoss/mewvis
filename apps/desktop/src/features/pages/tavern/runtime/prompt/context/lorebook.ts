import {
  formatTavernCharacterRelationships,
} from "../../../core";
import type {
  TavernCharacter,
  TavernLorebookEntry,
  TavernRoom,
} from "../../../types";
import {
  escapePromptXmlAttribute,
  escapePromptXmlText,
  limitPromptText,
} from "../shared/text";

const normalizeMatchText = (text: string) => text.toLowerCase();

export const selectTavernLorebookEntries = ({
  room,
  activeCharacter,
  characters,
  currentUserText,
}: {
  room: TavernRoom;
  activeCharacter?: TavernCharacter | null;
  characters: TavernCharacter[];
  currentUserText: string;
}) => {
  const matchText = normalizeMatchText([
    currentUserText,
    room.title,
    room.scene,
    activeCharacter?.name ?? "",
    characters.map((character) => [
      character.name,
      character.description,
      character.goals ?? "",
      formatTavernCharacterRelationships({
        character,
        characters,
        userPersonaName: room.userPersonaName,
        relationshipOverrides: room.relationshipOverrides,
        statusSnapshot: room.statusSnapshot,
        includePrivate: false,
      }),
    ].join("\n")).join("\n\n"),
  ].join("\n\n"));

  return room.lorebookEntries
    .filter((entry) => entry.enabled)
    .filter((entry) => entry.alwaysOn || entry.keywords.some((keyword) =>
      matchText.includes(keyword.toLowerCase())
    ));
};

export const formatTavernLorebookEntries = (
  entries: TavernLorebookEntry[],
  {
    maxEntries,
    maxContentChars,
  }: {
    maxEntries?: number;
    maxContentChars?: number;
  } = {},
) => entries
  .slice(0, maxEntries ?? entries.length)
  .map((entry) => [
    `<lore_entry title="${escapePromptXmlAttribute(entry.title)}" keywords="${escapePromptXmlAttribute(entry.keywords.join(", "))}">`,
    escapePromptXmlText(maxContentChars ? limitPromptText(entry.content, maxContentChars) : entry.content),
    "</lore_entry>",
  ].join("\n")).join("\n\n");
