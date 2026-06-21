import {
  getTavernPresentationProfile,
} from "../presentation-profiles";
import { getTavernPresentationContract } from "../presentation-contracts";
import type {
  TavernMessage,
  TavernMessageActorRef,
  TavernMessageKind,
  TavernMessageSegment,
  TavernPresentationProfileId,
} from "../types";

const createActorForMessage = (message: Pick<TavernMessage, "role" | "characterId">): TavernMessageActorRef => {
  if (message.role === "user") {
    return { type: "user" };
  }

  if (message.role === "character" && message.characterId) {
    return { type: "character", characterId: message.characterId };
  }

  return { type: "narrator" };
};

const isStandaloneActionLine = (line: string) => {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.startsWith("**") || trimmed.startsWith("__")) {
    return false;
  }

  return (
    (trimmed.startsWith("*") && trimmed.endsWith("*")) ||
    (trimmed.startsWith("_") && trimmed.endsWith("_"))
  );
};

const stripActionMarkers = (line: string) => line.trim().slice(1, -1).trim();

const mergeAdjacentSegments = (
  segments: TavernMessageSegment[],
): TavernMessageSegment[] => {
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
    if (isStandaloneActionLine(line)) {
      flushDialogue();
      const actionText = stripActionMarkers(line);
      if (actionText) {
        segments.push({
          type: "action",
          actor,
          text: actionText,
        });
      }
      continue;
    }

    pendingDialogueLines.push(line);
  }

  flushDialogue();
  return mergeAdjacentSegments(segments);
};

export const inferTavernMessageKind = ({
  role,
  presentationProfileId,
}: {
  role: TavernMessage["role"];
  presentationProfileId?: TavernPresentationProfileId;
}): TavernMessageKind => {
  if (role === "user") {
    return "user_input";
  }

  if (role === "narrator") {
    return "narration";
  }

  const profile = getTavernPresentationProfile(presentationProfileId);
  return getTavernPresentationContract(profile).characterMessageKind;
};

export const buildTavernMessageSegments = ({
  role,
  characterId,
  content,
  thought,
  presentationProfileId,
}: Pick<TavernMessage, "role" | "characterId" | "content" | "thought" | "presentationProfileId">): TavernMessageSegment[] => {
  const actor = createActorForMessage({ role, characterId });
  const trimmedContent = content.trim();
  const segments: TavernMessageSegment[] = [];
  const profile = getTavernPresentationProfile(presentationProfileId);
  const presentationContract = getTavernPresentationContract(profile);

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
    } else if (presentationContract.characterMessageKind === "narrative_beat") {
      segments.push({
        type: "narration",
        actor,
        text: trimmedContent,
      });
    } else {
      segments.push(...buildDialogueAndActionSegments({
        actor,
        content: trimmedContent,
      }));
    }
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

export const normalizeTavernMessageSegments = (
  value: unknown,
): TavernMessageSegment[] => {
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
      return [{
        type: "narration",
        text,
        actor: candidate.actor,
      }];
    }

    if (candidate.type === "dialogue" && candidate.speaker) {
      return [{
        type: "dialogue",
        text,
        speaker: candidate.speaker,
      }];
    }

    if (candidate.type === "action") {
      return [{
        type: "action",
        text,
        actor: candidate.actor,
      }];
    }

    if (candidate.type === "thought" && candidate.owner) {
      return [{
        type: "thought",
        text,
        owner: candidate.owner,
        visibility: candidate.visibility === "public" ? "public" : "private",
      }];
    }

    if (candidate.type === "text") {
      return [{ type: "text", text }];
    }

    return [];
  });
};

export const resolveTavernMessageSegments = (
  message: TavernMessage,
): TavernMessageSegment[] => {
  const normalizedSegments = normalizeTavernMessageSegments(message.segments);
  return normalizedSegments.length > 0
    ? normalizedSegments
    : buildTavernMessageSegments(message);
};

export const formatTavernMessageSegmentsForDisplay = (
  segments: TavernMessageSegment[],
  {
    includeThoughts = true,
  }: {
    includeThoughts?: boolean;
  } = {},
) => segments
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
) => segments
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
