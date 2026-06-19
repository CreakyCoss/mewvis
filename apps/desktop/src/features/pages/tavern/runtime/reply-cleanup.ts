import type { TavernCharacter } from "../types";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const uniqueLabels = (labels: string[]) => [
  ...new Set(labels.map((label) => label.trim()).filter(Boolean)),
].sort((first, second) => second.length - first.length);

export const cleanTavernReplyText = ({
  text,
  activeCharacter,
  characters: _characters,
  userPersonaName: _userPersonaName,
}: {
  text: string;
  activeCharacter: TavernCharacter;
  characters: TavernCharacter[];
  userPersonaName: string;
}) => {
  const labels = uniqueLabels([
    activeCharacter.name,
    "角色",
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

export type TavernReplyParts = {
  content: string;
  thought?: string;
};

const thoughtTagNames = [
  "inner_thought",
  "private_thought",
  "history_private_thought",
  "thought",
  "mind",
  "心理想法",
  "内心想法",
  "心想",
  "心理",
];

const replyTagNames = [
  "reply",
  "public_reply",
  "history_public_reply",
  "response",
  "content",
  "正文",
  "回复",
  "回应",
  "对白",
];

const thoughtLabelPattern = "(?:心理想法|内心想法|内心|心想|心理|想法)";
const replyLabelPattern = "(?:公开回应|公开回复|回复|回应|正文|对白)";

type TaggedBlock = {
  value: string;
  rest: string;
  closed: boolean;
};

const tagNamePattern = (tagNames: string[]) =>
  tagNames.map(escapeRegExp).join("|");

const extractTaggedBlock = (
  text: string,
  tagNames: string[],
): TaggedBlock | null => {
  const pattern = tagNamePattern(tagNames);
  const closedTagPattern = new RegExp(
    `<\\s*(?:${pattern})(?:\\s+[^>]*)?\\s*>\\s*([\\s\\S]*?)\\s*<\\s*/\\s*(?:${pattern})\\s*>`,
    "i",
  );
  const closedMatch = closedTagPattern.exec(text);

  if (closedMatch?.index !== undefined) {
    return {
      value: closedMatch[1] ?? "",
      rest: [
        text.slice(0, closedMatch.index),
        text.slice(closedMatch.index + closedMatch[0].length),
      ].join("\n").trim(),
      closed: true,
    };
  }

  const openTagPattern = new RegExp(`<\\s*(?:${pattern})(?:\\s+[^>]*)?\\s*>`, "i");
  const openMatch = openTagPattern.exec(text);

  if (openMatch?.index === undefined) {
    return null;
  }

  return {
    value: text.slice(openMatch.index + openMatch[0].length),
    rest: text.slice(0, openMatch.index).trim(),
    closed: false,
  };
};

const stripOuterQuotes = (text: string) =>
  text.replace(/^\s*["“”'‘’]+|["“”'‘’]+\s*$/g, "").trim();

const stripPairedOuterBrackets = (text: string) => {
  const trimmed = text.trim();
  const hasChineseBrackets = trimmed.startsWith("（") && trimmed.endsWith("）");
  const hasAsciiBrackets = trimmed.startsWith("(") && trimmed.endsWith(")");

  return hasChineseBrackets || hasAsciiBrackets
    ? trimmed.slice(1, -1).trim()
    : trimmed;
};

const normalizeThoughtText = (text: string) =>
  stripPairedOuterBrackets(stripOuterQuotes(text));

export const cleanTavernThoughtText = (text: string) => {
  const tagged = extractTaggedBlock(text, thoughtTagNames);
  const thoughtTagPattern = tagNamePattern(thoughtTagNames);
  const cleaned = (tagged?.value ?? text)
    .replace(new RegExp(`<\\s*/?\\s*(?:${thoughtTagPattern})(?:\\s+[^>]*)?\\s*>`, "gi"), "")
    .replace(new RegExp(`^\\s*${thoughtLabelPattern}\\s*[:：]\\s*`), "")
    .replace(/^\s*(?:[-*]|\d+[.)、])\s*/, "");

  return normalizeThoughtText(cleaned);
};

const stripDanglingTagPrefix = (text: string) => {
  const trimmed = text.trim();

  return /^<[^>\n]*$/.test(trimmed) ? "" : trimmed;
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
  return markerIndex >= 0
    ? `${text.slice(0, markerIndex)}${text.slice(markerIndex + marker.length)}`.trim()
    : text;
};

const normalizeMarkdownMarkers = (text: string) =>
  stripUnpairedMarkdownMarker(
    stripUnpairedMarkdownMarker(stripDanglingMarkdownMarkers(text), "*"),
    "_",
  );

export const stripTavernStandaloneActionBlocks = (text: string) =>
  text.replace(/(^|\n)\s*[*_][^*_\n]+[*_]\s*(?=\n|$)/g, "\n").trim();

export const hasTavernReplyDialogueText = (text: string) =>
  stripTavernStandaloneActionBlocks(text).trim().length > 0;

const stripKnownTagBlocks = (text: string, tagNames: string[]) => {
  const pattern = tagNamePattern(tagNames);

  return text.replace(
    new RegExp(
      `<\\s*(?:${pattern})(?:\\s+[^>]*)?\\s*>[\\s\\S]*?<\\s*/\\s*(?:${pattern})\\s*>`,
      "gi",
    ),
    "",
  );
};

const stripKnownWrapperTags = (text: string, tagNames: string[]) => {
  const pattern = tagNamePattern(tagNames);

  return text.replace(
    new RegExp(`<\\s*/?\\s*(?:${pattern})(?:\\s+[^>]*)?\\s*>`, "gi"),
    "",
  );
};

const stripContextWrapperTags = (
  text: string,
  { stripReplyTags = true }: { stripReplyTags?: boolean } = {},
) => {
  const withoutHiddenBlocks = stripKnownTagBlocks(
    stripKnownTagBlocks(text, ["narration", "history_narration"]),
    thoughtTagNames,
  );
  const withoutOuterWrappers = stripKnownWrapperTags(withoutHiddenBlocks, [
    "message",
    "history_message",
    "narration",
    "history_narration",
  ]);

  return (stripReplyTags
    ? stripKnownWrapperTags(withoutOuterWrappers, replyTagNames)
    : withoutOuterWrappers
  ).trim();
};

const openTagPatternFor = (tagNames: string[]) =>
  new RegExp(`<\\s*(?:${tagNamePattern(tagNames)})(?:\\s+[^>]*)?\\s*>`, "i");

const splitLooseThoughtValue = (value: string) => {
  const replyOpenMatch = openTagPatternFor(replyTagNames).exec(value);
  if (replyOpenMatch?.index !== undefined) {
    return {
      thought: value.slice(0, replyOpenMatch.index).trim(),
      rest: value.slice(replyOpenMatch.index).trim(),
    };
  }

  const paragraphSplit = value.match(/\n\s*\n/);
  if (paragraphSplit?.index !== undefined) {
    const thought = value.slice(0, paragraphSplit.index).trim();
    const rest = value.slice(paragraphSplit.index + paragraphSplit[0].length).trim();
    if (thought && rest) {
      return { thought, rest };
    }
  }

  return {
    thought: value,
    rest: "",
  };
};

const parseTaggedReplyParts = (text: string): TavernReplyParts | null => {
  const thoughtBlock = extractTaggedBlock(text, thoughtTagNames);
  const looseThought = thoughtBlock && !thoughtBlock.closed
    ? splitLooseThoughtValue(thoughtBlock.value)
    : null;
  const textWithoutThought = stripContextWrapperTags(
    looseThought
      ? [thoughtBlock?.rest ?? "", looseThought.rest].filter(Boolean).join("\n")
      : thoughtBlock?.rest ?? text,
    {
    stripReplyTags: false,
    },
  );
  const replyBlock = extractTaggedBlock(textWithoutThought, replyTagNames);

  if (!thoughtBlock && !replyBlock) {
    return null;
  }

  return {
    content: replyBlock
      ? stripContextWrapperTags(replyBlock.value).trim()
      : stripDanglingTagPrefix(stripContextWrapperTags(textWithoutThought)),
    thought: thoughtBlock
      ? cleanTavernThoughtText(looseThought?.thought ?? thoughtBlock.value)
      : undefined,
  };
};

const parseLabeledReplyParts = (text: string): TavernReplyParts | null => {
  const thoughtFirstPattern = new RegExp(
    `^\\s*${thoughtLabelPattern}\\s*[:：]\\s*([\\s\\S]*?)\\n+\\s*${replyLabelPattern}\\s*[:：]\\s*([\\s\\S]*)$`,
  );
  const thoughtFirstMatch = thoughtFirstPattern.exec(text);

  if (thoughtFirstMatch) {
    return {
      thought: cleanTavernThoughtText(thoughtFirstMatch[1] ?? ""),
      content: (thoughtFirstMatch[2] ?? "").trim(),
    };
  }

  const replyFirstPattern = new RegExp(
    `^\\s*${replyLabelPattern}\\s*[:：]\\s*([\\s\\S]*?)\\n+\\s*${thoughtLabelPattern}\\s*[:：]\\s*([\\s\\S]*)$`,
  );
  const replyFirstMatch = replyFirstPattern.exec(text);

  if (replyFirstMatch) {
    return {
      content: (replyFirstMatch[1] ?? "").trim(),
      thought: cleanTavernThoughtText(replyFirstMatch[2] ?? ""),
    };
  }

  return null;
};

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
  const source = block
    .replace(/^\s*(?:>\s*)?/, "")
    .trimStart();

  if (!/^[_*（(]/.test(source)) {
    return false;
  }

  const normalized = source
    .replace(/^[_*（(]+/, "")
    .trimStart();

  return characters.some((character) =>
    character.id !== activeCharacter.id &&
    normalized.startsWith(character.name)
  );
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

  return (
    nextSpeakerMatch
      ? segmentTail.slice(0, nextSpeakerMatch.index)
      : segmentTail
  ).trim();
};

const sanitizeTavernReplyContent = ({
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
  const source = activeSegment ?? text;
  const activePrefix = speakerPrefixPattern([activeCharacter.name, "角色"]);
  const foreignPrefix = speakerPrefixPattern([
    ...characters
      .filter((character) => character.id !== activeCharacter.id)
      .map((character) => character.name),
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

  return sanitizedBlocks.join("\n\n").trim();
};

export const parseTavernReplyText = ({
  text,
  activeCharacter,
  characters,
  userPersonaName,
}: {
  text: string;
  activeCharacter: TavernCharacter;
  characters: TavernCharacter[];
  userPersonaName: string;
}): TavernReplyParts => {
  const cleaned = cleanTavernReplyText({
    text,
    activeCharacter,
    characters,
    userPersonaName,
  });
  const parsed = parseTaggedReplyParts(cleaned) ?? parseLabeledReplyParts(cleaned);
  const contentSource = parsed?.content ?? stripContextWrapperTags(cleaned);
  const content = cleanTavernReplyText({
    text: normalizeMarkdownMarkers(
      sanitizeTavernReplyContent({
        text: contentSource,
        activeCharacter,
        characters,
        userPersonaName,
      }),
    ),
    activeCharacter,
    characters,
    userPersonaName,
  });
  const thought = cleanTavernThoughtText(parsed?.thought ?? "");

  return {
    content,
    thought: thought || undefined,
  };
};
