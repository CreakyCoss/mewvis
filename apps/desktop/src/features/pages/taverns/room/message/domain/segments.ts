import { getTavernPresentationProfile } from "@/features/pages/taverns/tavern/prompt-registry/presentation-rules";
import type {
  TavernMessage,
  TavernMessageActorRef,
  TavernMessageKind,
  TavernMessageSegment,
} from "@/features/pages/taverns/tavern/types";
import type { TavernPresentationProfileId } from "@/features/pages/taverns/manage/model";
import { getTavernMessageRawText } from "../../model/message-body";

const createActorForMessage = (message: Pick<TavernMessage, "role" | "characterId">): TavernMessageActorRef => {
  if (message.role === "user") {
    return { type: "user" };
  }

  if (message.role === "character" && message.characterId) {
    return { type: "character", characterId: message.characterId };
  }

  return { type: "narrator" };
};

const actionPrefixPattern = /^\s*(?:动作|行动|神态|表情|姿态|可见动作|肢体动作)\s*[:：]\s*(.+?)\s*$/;
const actionTagPattern = /^\s*<action(?:\s[^>]*)?>([\s\S]*?)<\/action>\s*$/i;

const stripPairedActionMarkers = (text: string, includeBrackets = false) => {
  const trimmed = text.trim();
  const markerPairs = [
    ["**", "**"],
    ["__", "__"],
    ["*", "*"],
    ["_", "_"],
    ...(includeBrackets
      ? ([
          ["（", "）"],
          ["(", ")"],
        ] as const)
      : []),
  ] as const;

  for (const [open, close] of markerPairs) {
    if (trimmed.startsWith(open) && trimmed.endsWith(close) && trimmed.length > open.length + close.length) {
      return trimmed.slice(open.length, trimmed.length - close.length).trim();
    }
  }

  return trimmed;
};

const normalizeActionText = (text: string, includeBrackets = true) => {
  const trimmed = text.trim();
  const prefixedText = actionPrefixPattern.exec(trimmed)?.[1]?.trim();
  return stripPairedActionMarkers(prefixedText || trimmed, includeBrackets);
};

const stripStandaloneActionMarkers = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("**") || trimmed.startsWith("__")) {
    return trimmed;
  }

  for (const marker of ["*", "_"] as const) {
    if (trimmed.startsWith(marker) && trimmed.endsWith(marker) && trimmed.length > marker.length * 2) {
      return trimmed.slice(marker.length, trimmed.length - marker.length).trim();
    }
  }

  return trimmed;
};

const parseStandaloneActionLine = (line: string) => {
  const trimmed = line.trim();

  if (!trimmed) {
    return null;
  }

  const tagText = actionTagPattern.exec(trimmed)?.[1]?.trim();
  if (tagText) {
    return normalizeActionText(tagText, true);
  }

  const prefixedText = actionPrefixPattern.exec(trimmed)?.[1]?.trim();
  if (prefixedText) {
    return normalizeActionText(prefixedText, true);
  }

  if (trimmed.length < 3) {
    return null;
  }

  const markedText = stripStandaloneActionMarkers(trimmed);
  if (markedText !== trimmed) {
    return markedText;
  }

  return null;
};

const mergeAdjacentSegments = (segments: TavernMessageSegment[]): TavernMessageSegment[] => {
  const merged: TavernMessageSegment[] = [];

  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.type === segment.type &&
      "text" in previous &&
      "text" in segment &&
      JSON.stringify({ ...previous, text: "" }) === JSON.stringify({ ...segment, text: "" })
    ) {
      previous.text = [previous.text, segment.text].filter(Boolean).join("\n");
      continue;
    }

    merged.push({ ...segment });
  }

  return merged;
};

const buildDialogueAndActionSegments = ({
  actor,
  content,
}: {
  actor: TavernMessageActorRef;
  content: string;
}): TavernMessageSegment[] => {
  const segments: TavernMessageSegment[] = [];
  const pendingDialogueLines: string[] = [];

  const flushDialogue = () => {
    const text = pendingDialogueLines.join("\n").trim();
    pendingDialogueLines.length = 0;
    if (!text) {
      return;
    }

    segments.push({
      type: "dialogue",
      speaker: actor,
      text,
    });
  };

  for (const line of content.split("\n")) {
    const actionText = parseStandaloneActionLine(line);
    if (actionText) {
      flushDialogue();
      segments.push({
        type: "action",
        actor,
        text: actionText,
      });
      continue;
    }

    pendingDialogueLines.push(line);
  }

  flushDialogue();
  return mergeAdjacentSegments(segments);
};

export const inferTavernMessageKind = ({
  role,
}: {
  role: TavernMessage["role"];
  presentationProfileId?: TavernPresentationProfileId;
}): TavernMessageKind => {
  if (role === "user") {
    return "user_text";
  }

  if (role === "narrator") {
    return "director_narration";
  }

  return "character_agent_output";
};

type TavernMessageSegmentBuildInput = {
  role: TavernMessage["role"];
  characterId?: string;
  content: string;
  actions?: string[];
  thought?: string;
  presentationProfileId?: TavernPresentationProfileId;
};

export const buildTavernMessageSegments = ({
  role,
  characterId,
  content,
  actions,
  thought,
  presentationProfileId,
}: TavernMessageSegmentBuildInput): TavernMessageSegment[] => {
  const actor = createActorForMessage({ role, characterId });
  const trimmedContent = content.trim();
  const segments: TavernMessageSegment[] = [];
  const profile = getTavernPresentationProfile(presentationProfileId);
  const isNarrativeCharacterMessage = role === "character" && presentationProfileId === "novel-prose";

  if (trimmedContent) {
    if (role === "narrator") {
      segments.push({
        type: "narration",
        actor,
        text: trimmedContent,
      });
    } else if (role === "user") {
      segments.push({
        type: profile.userInputMode === "speech" ? "dialogue" : "text",
        ...(profile.userInputMode === "speech" ? { speaker: actor } : {}),
        text: trimmedContent,
      } as TavernMessageSegment);
    } else if (isNarrativeCharacterMessage) {
      segments.push({
        type: "narration",
        actor,
        text: trimmedContent,
      });
    } else {
      segments.push(
        ...buildDialogueAndActionSegments({
          actor,
          content: trimmedContent,
        }),
      );
    }
  }

  const explicitActionTexts = (actions ?? []).map((action) => normalizeActionText(action, true)).filter(Boolean);
  for (const actionText of explicitActionTexts) {
    segments.push({
      type: "action",
      actor,
      text: actionText,
    });
  }

  const trimmedThought = thought?.trim();
  if (trimmedThought && role === "character") {
    segments.push({
      type: "thought",
      owner: actor,
      visibility: "private",
      text: trimmedThought,
    });
  }

  return segments;
};

export const normalizeTavernMessageSegments = (value: unknown): TavernMessageSegment[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((segment): TavernMessageSegment[] => {
    if (!segment || typeof segment !== "object") {
      return [];
    }

    const candidate = segment as Partial<TavernMessageSegment>;
    const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
    if (!text) {
      return [];
    }

    if (candidate.type === "narration") {
      return [
        {
          type: "narration",
          text,
          actor: candidate.actor,
        },
      ];
    }

    if (candidate.type === "dialogue" && candidate.speaker) {
      return [
        {
          type: "dialogue",
          text,
          speaker: candidate.speaker,
        },
      ];
    }

    if (candidate.type === "action") {
      return [
        {
          type: "action",
          text,
          actor: candidate.actor,
        },
      ];
    }

    if (candidate.type === "thought" && candidate.owner) {
      return [
        {
          type: "thought",
          text,
          owner: candidate.owner,
          visibility: candidate.visibility === "public" ? "public" : "private",
        },
      ];
    }

    if (candidate.type === "text") {
      return [{ type: "text", text }];
    }

    return [];
  });
};

export const resolveTavernMessageSegments = (message: TavernMessage): TavernMessageSegment[] => {
  return buildTavernMessageSegments({
    role: message.role,
    characterId: message.characterId,
    content: getTavernMessageRawText(message),
    presentationProfileId: message.presentationProfileId,
  });
};

export const formatTavernMessageSegmentsForDisplay = (
  segments: TavernMessageSegment[],
  {
    includeThoughts = true,
  }: {
    includeThoughts?: boolean;
  } = {},
) =>
  segments
    .filter((segment) => includeThoughts || segment.type !== "thought")
    .map((segment) => {
      if (segment.type === "action") {
        return `*${segment.text}*`;
      }

      if (segment.type === "thought") {
        return `（${segment.text}）`;
      }

      return segment.text;
    })
    .filter(Boolean)
    .join("\n\n");

export const formatTavernMessageSegmentsForPrompt = (
  segments: TavernMessageSegment[],
  {
    escapeText = (text: string) => text,
    includeThoughts = false,
  }: {
    escapeText?: (text: string) => string;
    includeThoughts?: boolean;
  } = {},
) =>
  segments
    .filter((segment) => includeThoughts || segment.type !== "thought")
    .map((segment) => {
      const text = escapeText(segment.text);
      if (segment.type === "dialogue") {
        return `<dialogue>${text}</dialogue>`;
      }
      if (segment.type === "action") {
        return `<action>${text}</action>`;
      }
      if (segment.type === "thought") {
        return `<thought visibility="${segment.visibility}">${text}</thought>`;
      }
      if (segment.type === "narration") {
        return `<narration>${text}</narration>`;
      }
      return `<text>${text}</text>`;
    })
    .join("\n");
