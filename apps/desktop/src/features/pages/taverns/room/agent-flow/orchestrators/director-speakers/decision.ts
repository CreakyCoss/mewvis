import type { AgentProtocolParseResult } from "@/features/pages/taverns/room/agent-protocol/types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import type { TavernAgentFlowDirectorDecision } from "../../types";
import { normalizeTavernAgentFlowText } from "./output";

type UnknownRecord = Record<string, unknown>;

export const parseTavernAgentFlowDirectorDecision = ({
  parsed,
  characters,
  maxSpeakers,
}: {
  parsed: AgentProtocolParseResult;
  characters: TavernCharacter[];
  maxSpeakers: number;
}): TavernAgentFlowDirectorDecision => {
  const decisionText = parsed.data.decision?.trim() || parsed.data.statePatch?.trim() || parsed.unwrappedText || "";
  const object = parseJsonObject(decisionText);
  const rawSpeakerIds = object
    ? [
        ...normalizeStringArray(object.speakerIds),
        ...normalizeStringArray(object.characterIds),
        ...normalizeStringArray(object.speakers),
      ]
    : findMentionedCharacterIds(decisionText, characters);
  const speakerIds = filterSpeakerIds({
    speakerIds: rawSpeakerIds,
    characters,
    maxSpeakers,
  });
  const fallbackSpeakerIds =
    speakerIds.length > 0
      ? speakerIds
      : filterSpeakerIds({
          speakerIds: characters.map((character) => character.id),
          characters,
          maxSpeakers: 1,
        });

  return {
    speakerIds: fallbackSpeakerIds,
    reason:
      typeof object?.reason === "string"
        ? object.reason.trim()
        : normalizeTavernAgentFlowText(parsed.data.summary ?? ""),
    narratorText:
      normalizeTavernAgentFlowText(parsed.data.narrative ?? "") ||
      (typeof object?.narratorText === "string"
        ? object.narratorText.trim()
        : typeof object?.narrator === "string"
          ? object.narrator.trim()
          : undefined),
  };
};

const parseJsonObject = (text: string): UnknownRecord | null => {
  const jsonText = extractJsonText(text);
  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const extractJsonText = (text: string) => {
  const normalized = normalizeTavernAgentFlowText(text);
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("{") && normalized.endsWith("}")) {
    return normalized;
  }

  const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced?.startsWith("{") && fenced.endsWith("}")) {
    return fenced;
  }

  return normalized.match(/\{[\s\S]*\}/)?.[0]?.trim() ?? "";
};

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => (typeof item === "string" ? [item.trim()] : [])).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,\n，、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const findMentionedCharacterIds = (text: string, characters: TavernCharacter[]) =>
  characters
    .filter((character) => {
      const id = character.id.trim();
      const name = character.name.trim();
      return (!!id && text.includes(id)) || (!!name && text.includes(name));
    })
    .map((character) => character.id);

const filterSpeakerIds = ({
  speakerIds,
  characters,
  maxSpeakers,
}: {
  speakerIds: string[];
  characters: TavernCharacter[];
  maxSpeakers: number;
}) => {
  const characterIds = new Set(characters.map((character) => character.id));
  return Array.from(new Set(speakerIds))
    .filter((id) => characterIds.has(id))
    .slice(0, Math.max(1, maxSpeakers));
};

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);
