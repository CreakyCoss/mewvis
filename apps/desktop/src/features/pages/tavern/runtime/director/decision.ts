import type {
  TavernCharacter,
  TavernRoom,
} from "../../types";

export type TavernDirectorDecision = {
  speakerIds: string[];
  nonverbalReplyIds?: string[];
  narrator?: string;
  randomEvent?: string;
  illustrationHints?: string[];
  ambientActions?: Array<{
    characterId: string;
    action: string;
  }>;
  reason?: string;
};

const extractJsonObject = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      // Fall through to balanced-object scanning when the model appended a
      // second JSON object or self-correction after an otherwise valid object.
    }
  }

  const candidates: string[] = [];
  let startIndex = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{") {
      if (depth === 0) {
        startIndex = index;
      }
      depth += 1;
    } else if (character === "}") {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && startIndex >= 0) {
        candidates.push(trimmed.slice(startIndex, index + 1));
        startIndex = -1;
      }
    }
  }

  return candidates.reverse().find((candidate) => {
    try {
      JSON.parse(candidate);
      return true;
    } catch {
      return false;
    }
  }) ?? candidates.at(-1) ?? "{}";
};

const limitDirectorText = (text: string, maxChars: number) => {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}...`;
};

const unescapeLooseJsonString = (value: string) =>
  value
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\")
    .trim();

const extractLooseJsonStringArray = (text: string, fieldName: string) => {
  const fieldPattern = new RegExp(
    `"${fieldName}"\\s*:\\s*\\[([\\s\\S]*?)\\]`,
    "i",
  );
  const fieldMatch = fieldPattern.exec(text);
  if (!fieldMatch) {
    return [];
  }

  return [...(fieldMatch[1] ?? "").matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)]
    .map((match) => unescapeLooseJsonString(match[1] ?? ""))
    .filter(Boolean);
};

const extractLooseJsonStringField = (text: string, fieldName: string) => {
  const fieldPattern = new RegExp(
    `"${fieldName}"\\s*:\\s*"([\\s\\S]*?)"\\s*(?=,\\s*"(?:speakerIds|nonverbalReplyIds|ambientActions|narrator|randomEvent|illustrationHints|reason)"\\s*:|\\s*}\\s*$)`,
    "i",
  );
  const fieldMatch = fieldPattern.exec(text);

  return fieldMatch ? unescapeLooseJsonString(fieldMatch[1] ?? "") : "";
};

const forbiddenRandomEventPattern =
  /(替用户|代替用户|用户已经决定|你必须|你不得不|直接解决主线|主线直接结束|自动胜利|全体失败)/;
const forbiddenIllustrationHintPattern =
  /(心理|内心|秘密|不可见|无人知道|替用户|代替用户|用户已经决定|你必须|你不得不|直接解决主线|主线直接结束|自动胜利|全体失败)/;

const normalizeDirectorRandomEvent = (value: string) => {
  const event = limitDirectorText(value.replace(/^[*_\s]+|[*_\s]+$/g, ""), 160);
  if (!event || forbiddenRandomEventPattern.test(event)) {
    return "";
  }
  return event;
};

const normalizeDirectorIllustrationHint = (value: string) => {
  const hint = limitDirectorText(value.replace(/^[*_\s-]+|[*_\s]+$/g, ""), 180);
  if (!hint || forbiddenIllustrationHintPattern.test(hint)) {
    return "";
  }
  return hint;
};

export const parseTavernDirectorDecision = (
  text: string,
  characters: TavernCharacter[],
  maxSpeakers: number,
  allowRandomEvent = true,
  allowIllustrationHints = true,
): TavernDirectorDecision => {
  const characterIds = new Set(characters.map((character) => character.id));
  const characterNameById = new Map(characters.map((character) => [character.id, character.name]));
  const jsonText = extractJsonObject(text);
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  const parsedSpeakerIds: unknown[] | null = Array.isArray(parsed?.speakerIds)
    ? parsed.speakerIds
    : null;
  const speakerIds: string[] = parsedSpeakerIds
    ? parsedSpeakerIds
        .flatMap((value: unknown) => typeof value === "string" ? [value] : [])
        .filter((id) => characterIds.has(id))
    : extractLooseJsonStringArray(jsonText, "speakerIds")
        .filter((id) => characterIds.has(id));
  const parsedNonverbalReplyIds: unknown[] | null = Array.isArray(parsed?.nonverbalReplyIds)
    ? parsed.nonverbalReplyIds
    : null;
  const nonverbalReplyIdsRaw = parsedNonverbalReplyIds
    ? parsedNonverbalReplyIds
        .flatMap((value: unknown) => typeof value === "string" ? [value] : [])
        .filter((id) => characterIds.has(id))
    : extractLooseJsonStringArray(jsonText, "nonverbalReplyIds")
        .filter((id) => characterIds.has(id));
  const scheduledIdSet = new Set([...new Set(nonverbalReplyIdsRaw), ...new Set(speakerIds)].slice(0, maxSpeakers));
  const uniqueSpeakerIds = [...new Set(speakerIds)].filter((id) => scheduledIdSet.has(id));
  const nonverbalReplyIds = [...new Set(nonverbalReplyIdsRaw)].filter((id) => scheduledIdSet.has(id));
  const speakerIdSet = new Set([...uniqueSpeakerIds, ...nonverbalReplyIds]);
  const narrator = typeof parsed?.narrator === "string"
    ? limitDirectorText(parsed.narrator, 280)
    : limitDirectorText(extractLooseJsonStringField(jsonText, "narrator"), 280);
  const reason = typeof parsed?.reason === "string"
    ? limitDirectorText(parsed.reason, 180)
    : limitDirectorText(extractLooseJsonStringField(jsonText, "reason"), 180);
  const randomEvent = allowRandomEvent
    ? normalizeDirectorRandomEvent(
        typeof parsed?.randomEvent === "string"
          ? parsed.randomEvent
          : extractLooseJsonStringField(jsonText, "randomEvent"),
      )
    : "";
  const rawIllustrationHints = allowIllustrationHints
    ? Array.isArray(parsed?.illustrationHints)
      ? parsed.illustrationHints.flatMap((value) => typeof value === "string" ? [value] : [])
      : typeof parsed?.illustrationHints === "string"
      ? [parsed.illustrationHints]
      : extractLooseJsonStringArray(jsonText, "illustrationHints")
    : [];
  const illustrationHints = [...new Set(
    rawIllustrationHints
      .map(normalizeDirectorIllustrationHint)
      .filter(Boolean),
  )].slice(0, 3);
  const ambientActions = Array.isArray(parsed?.ambientActions)
    ? parsed.ambientActions.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") {
          return [];
        }
        const record = candidate as Record<string, unknown>;
        const characterId = typeof record.characterId === "string" ? record.characterId.trim() : "";
        const rawAction = typeof record.action === "string" ? record.action.trim() : "";
        const characterName = characterNameById.get(characterId);
        if (
          !characterIds.has(characterId) ||
          speakerIdSet.has(characterId) ||
          !characterName ||
          !rawAction
        ) {
          return [];
        }
        const action = rawAction.includes(characterName)
          ? rawAction
          : `${characterName}${rawAction.replace(/^他(?:们)?|^她(?:们)?|^它(?:们)?/, "")}`;

        return [{
          characterId,
          action: limitDirectorText(action.replace(/^[*_\s]+|[*_\s]+$/g, ""), 120),
        }];
      }).slice(0, 2)
    : [];

  return {
    speakerIds: uniqueSpeakerIds,
    nonverbalReplyIds,
    narrator: narrator || undefined,
    randomEvent: randomEvent || undefined,
    illustrationHints,
    ambientActions,
    reason: reason || undefined,
  };
};

export const shouldOfferTavernDirectorRandomEvent = (
  room: Pick<TavernRoom, "settings">,
  random = Math.random,
) => {
  if (!room.settings.randomEvents.enabled) {
    return false;
  }

  const probability = Math.min(1, Math.max(0, room.settings.randomEvents.probability));
  return random() < probability;
};
