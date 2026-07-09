import { uniq } from "lodash-es";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const uniqueLabels = (labels: string[]) =>
  uniq(labels.map((label) => label.trim()).filter(Boolean)).sort((first, second) => second.length - first.length);

const labelPattern = (labels: readonly string[]) =>
  `(?:${uniqueLabels([...labels])
    .map(escapeRegExp)
    .join("|")})`;

const thoughtLabelPattern = labelPattern(["心理想法", "内心想法", "内心", "心想", "心理", "想法"]);

const stripOuterQuotes = (text: string) => text.replace(/^\s*["“”'‘’]+|["“”'‘’]+\s*$/g, "").trim();

const stripPairedOuterBrackets = (text: string) => {
  const trimmed = text.trim();
  const hasChineseBrackets = trimmed.startsWith("（") && trimmed.endsWith("）");
  const hasAsciiBrackets = trimmed.startsWith("(") && trimmed.endsWith(")");

  return hasChineseBrackets || hasAsciiBrackets ? trimmed.slice(1, -1).trim() : trimmed;
};

export const cleanTavernThoughtText = (text: string) => {
  const cleaned = text
    .replace(new RegExp(`^\\s*${thoughtLabelPattern}\\s*[:：]\\s*`), "")
    .replace(/^\s*(?:[-*]|\d+[.)、])\s*/, "");

  return stripPairedOuterBrackets(stripOuterQuotes(cleaned));
};

const stripDanglingMarkdownMarkers = (text: string) =>
  text
    .replace(/(^|\n)\s*[*_]+\s*$/g, "")
    .replace(/\s+[*_]+\s*$/g, "")
    .trim();

const stripUnpairedMarkdownMarker = (text: string, marker: "*" | "_") => {
  const markerCount = text.split(marker).length - 1;
  if (markerCount % 2 === 0) {
    return text;
  }

  const markerIndex = text.lastIndexOf(marker);
  return markerIndex >= 0 ? `${text.slice(0, markerIndex)}${text.slice(markerIndex + marker.length)}`.trim() : text;
};

const normalizeMarkdownMarkers = (text: string) =>
  stripUnpairedMarkdownMarker(stripUnpairedMarkdownMarker(stripDanglingMarkdownMarkers(text), "*"), "_");

export const stripTavernStandaloneActionBlocks = (text: string) =>
  text.replace(/(^|\n)\s*[*_][^*_\n]+[*_]\s*(?=\n|$)/g, "\n").trim();

export const stripTavernImmersiveDescriptionText = (text: string) =>
  stripTavernStandaloneActionBlocks(text)
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const hasTavernReplyDialogueText = (text: string) => stripTavernStandaloneActionBlocks(text).trim().length > 0;

const speakerPrefixPattern = (labels: string[]) => {
  const unique = uniqueLabels(labels);

  if (unique.length === 0) {
    return null;
  }

  return new RegExp(
    `^\\s*(?:>\\s*)?[「『“"《【\\[(（]?\\s*(?:${unique.map(escapeRegExp).join("|")})\\s*[」』”"》】\\])）]?\\s*(?::|：)\\s*`,
  );
};

const speakerLinePattern = (labels: string[]) => {
  const unique = uniqueLabels(labels);

  if (unique.length === 0) {
    return null;
  }

  return new RegExp(
    `(?:^|\\n)\\s*(?:>\\s*)?[「『“"《【\\[(（]?\\s*(?:${unique.map(escapeRegExp).join("|")})\\s*[」』”"》】\\])）]?\\s*(?::|：)\\s*`,
  );
};

const isOtherCharacterNarrationBlock = (
  block: string,
  activeCharacter: TavernCharacter,
  characters: TavernCharacter[],
) => {
  const source = block.replace(/^\s*(?:>\s*)?/, "").trimStart();

  if (!/^[_*（(]/.test(source)) {
    return false;
  }

  const normalized = source.replace(/^[_*（(]+/, "").trimStart();

  return characters.some((character) => character.id !== activeCharacter.id && normalized.startsWith(character.name));
};

const extractActiveSpeakerSegment = ({
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
  const activePattern = speakerLinePattern([activeCharacter.name, "角色"]);
  const activeMatch = activePattern?.exec(text);

  if (!activeMatch) {
    return null;
  }

  const allSpeakerPattern = speakerLinePattern([
    ...characters.map((character) => character.name),
    userPersonaName,
    "旁白",
    "用户",
    "角色",
  ]);
  const segmentStart = activeMatch.index + activeMatch[0].length;
  const segmentTail = text.slice(segmentStart);
  const nextSpeakerMatch = allSpeakerPattern?.exec(segmentTail);

  return (nextSpeakerMatch ? segmentTail.slice(0, nextSpeakerMatch.index) : segmentTail).trim();
};

const stripActiveSpeakerPrefix = (text: string, activeCharacter: TavernCharacter) => {
  const activePrefix = speakerPrefixPattern([activeCharacter.name, "角色"]);
  let cleaned = text.trim();

  for (let index = 0; index < 8; index += 1) {
    const next = cleaned.replace(activePrefix ?? /^$/, "").trimStart();
    if (next === cleaned) {
      break;
    }
    cleaned = next;
  }

  return cleaned.trim();
};

export const cleanTavernAgentOutputContent = ({
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
  const activeSegment = extractActiveSpeakerSegment({
    text,
    activeCharacter,
    characters,
    userPersonaName,
  });
  const source = activeSegment ?? stripActiveSpeakerPrefix(text, activeCharacter);
  const activePrefix = speakerPrefixPattern([activeCharacter.name, "角色"]);
  const foreignPrefix = speakerPrefixPattern([
    ...characters.filter((character) => character.id !== activeCharacter.id).map((character) => character.name),
    userPersonaName,
    "旁白",
    "用户",
  ]);
  const sanitizedBlocks = source
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => {
      if (foreignPrefix?.test(block) || isOtherCharacterNarrationBlock(block, activeCharacter, characters)) {
        return [];
      }

      const sanitizedLines: string[] = [];
      for (const line of block.split("\n")) {
        const trimmedLine = line.trim();
        if (!trimmedLine) {
          continue;
        }

        if (
          foreignPrefix?.test(trimmedLine) ||
          isOtherCharacterNarrationBlock(trimmedLine, activeCharacter, characters)
        ) {
          break;
        }

        sanitizedLines.push(trimmedLine.replace(activePrefix ?? /^$/, "").trim());
      }

      return [sanitizedLines.filter(Boolean).join("\n").trim()];
    })
    .filter(Boolean);

  return normalizeMarkdownMarkers(sanitizedBlocks.join("\n\n").trim());
};
