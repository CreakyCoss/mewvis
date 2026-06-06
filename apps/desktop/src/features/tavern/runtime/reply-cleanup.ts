import type { TavernCharacter } from "../types";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const uniqueLabels = (labels: string[]) => [
  ...new Set(labels.map((label) => label.trim()).filter(Boolean)),
].sort((first, second) => second.length - first.length);

export const cleanTavernReplyText = ({
  text,
  activeCharacter,
  characters,
  userPersonaName,
}: {
  text: string;
  activeCharacter: TavernCharacter;
  characters: TavernCharacter[];
  userPersonaName: string;
}) => {
  const labels = uniqueLabels([
    activeCharacter.name,
    ...characters.map((character) => character.name),
    userPersonaName,
    "旁白",
    "角色",
    "用户",
  ]);
  if (labels.length === 0) {
    return text.trim();
  }

  const labelPattern = labels.map(escapeRegExp).join("|");
  const speakerPrefixPattern = new RegExp(
    `^\\s*[「『“"《【\\[(（]?\\s*(?:${labelPattern})\\s*[」』”"》】\\])）]?\\s*(?::|：)\\s*`,
  );
  let cleaned = text.trim();

  for (let index = 0; index < 8; index += 1) {
    const next = cleaned.replace(speakerPrefixPattern, "").trimStart();
    if (next === cleaned) {
      break;
    }
    cleaned = next;
  }

  return cleaned.trim();
};
