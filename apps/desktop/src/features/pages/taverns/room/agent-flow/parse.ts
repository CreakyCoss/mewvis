import { AgentProtocol } from "@/features/pages/taverns/room/agent-protocol";
import type {
  AgentProtocolOutputKey,
  AgentProtocolParseResult,
} from "@/features/pages/taverns/room/agent-protocol/types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import type { TavernAgentFlowDirectorDecision } from "./types";

type UnknownRecord = Record<string, unknown>;

const publicOutputFallbackOrder = ["publicReply", "narrative", "summary", "action", "decision"] as const;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

const uniq = <T>(values: T[]) => Array.from(new Set(values));

const normalizeText = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*```(?:json|xml|text)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

const extractJsonText = (text: string) => {
  const normalized = normalizeText(text);
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

  const objectLike = normalized.match(/\{[\s\S]*\}/)?.[0]?.trim();
  return objectLike ?? "";
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
  return uniq(speakerIds).filter((id) => characterIds.has(id)).slice(0, Math.max(1, maxSpeakers));
};

export const parseTavernAgentFlowOutput = (text: string): AgentProtocolParseResult => AgentProtocol.parse(text);

const formatActionForPublicContext = (text: string) => (text ? `动作：${text}` : "");

export const getTavernAgentFlowPublicText = ({
  parsed,
  preferredOutput,
}: {
  parsed: AgentProtocolParseResult;
  preferredOutput?: Extract<AgentProtocolOutputKey, "publicReply" | "narrative">;
}) => {
  const preferredText = preferredOutput ? parsed.data[preferredOutput]?.trim() : "";
  const actionText = normalizeText(parsed.data.action ?? "");

  if (preferredOutput === "publicReply") {
    const normalizedPreferredText = preferredText ? normalizeText(preferredText) : "";
    if (actionText && normalizedPreferredText) {
      return `${formatActionForPublicContext(actionText)}\n${normalizedPreferredText}`;
    }

    if (actionText) {
      return formatActionForPublicContext(actionText);
    }

    if (normalizedPreferredText) {
      return normalizedPreferredText;
    }
  }

  if (preferredText) {
    return normalizeText(preferredText);
  }

  const fallbackKey = publicOutputFallbackOrder.find((key) => parsed.data[key]?.trim());
  if (fallbackKey) {
    return normalizeText(parsed.data[fallbackKey] ?? "");
  }

  return normalizeText(parsed.unwrappedText ?? "");
};

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
    reason: typeof object?.reason === "string" ? object.reason.trim() : normalizeText(parsed.data.summary ?? ""),
    narratorText:
      normalizeText(parsed.data.narrative ?? "") ||
      (typeof object?.narratorText === "string"
        ? object.narratorText.trim()
        : typeof object?.narrator === "string"
          ? object.narrator.trim()
          : undefined),
  };
};
