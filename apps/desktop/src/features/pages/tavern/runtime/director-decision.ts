import type {
  TavernCharacter,
  TavernRoom,
} from "../types";

export type TavernDirectorDecision = {
  speakerIds: string[];
  narrator?: string;
  randomEvent?: string;
  ambientActions?: Array<{
    characterId: string;
    action: string;
  }>;
  reason?: string;
};

const extractJsonObject = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? "{}";
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
    `"${fieldName}"\\s*:\\s*"([\\s\\S]*?)"\\s*(?=,\\s*"(?:speakerIds|ambientActions|narrator|randomEvent|reason)"\\s*:|\\s*}\\s*$)`,
    "i",
  );
  const fieldMatch = fieldPattern.exec(text);

  return fieldMatch ? unescapeLooseJsonString(fieldMatch[1] ?? "") : "";
};

const forbiddenRandomEventPattern =
  /(替用户|代替用户|用户已经决定|你必须|你不得不|直接解决主线|主线直接结束|自动胜利|全体失败)/;

const normalizeDirectorRandomEvent = (value: string) => {
  const event = limitDirectorText(value.replace(/^[*_\s]+|[*_\s]+$/g, ""), 160);
  if (!event || forbiddenRandomEventPattern.test(event)) {
    return "";
  }
  return event;
};

export const parseTavernDirectorDecision = (
  text: string,
  characters: TavernCharacter[],
  maxSpeakers: number,
  allowRandomEvent = true,
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
  const uniqueSpeakerIds = [...new Set(speakerIds)].slice(0, maxSpeakers);
  const speakerIdSet = new Set(uniqueSpeakerIds);
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
    narrator: narrator || undefined,
    randomEvent: randomEvent || undefined,
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
