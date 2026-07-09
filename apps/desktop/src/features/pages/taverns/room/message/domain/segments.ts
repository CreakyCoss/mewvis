import type {
  MessageActorRef,
  MessagePresentationConfig,
  MessageRole,
  MessageSegment,
} from "./types";

const createActorForMessage = (message: { role: MessageRole; characterId?: string }): MessageActorRef => {
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

const mergeAdjacentSegments = (segments: MessageSegment[]): MessageSegment[] => {
  const merged: MessageSegment[] = [];

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
  actor: MessageActorRef;
  content: string;
}): MessageSegment[] => {
  const segments: MessageSegment[] = [];
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

type MessageSegmentBuildInput = {
  role: MessageRole;
  characterId?: string;
  content: string;
  actions?: string[];
  thought?: string;
  presentation?: MessagePresentationConfig;
};

export const buildMessageSegments = ({
  role,
  characterId,
  content,
  actions,
  thought,
  presentation,
}: MessageSegmentBuildInput): MessageSegment[] => {
  const actor = createActorForMessage({ role, characterId });
  const trimmedContent = content.trim();
  const segments: MessageSegment[] = [];
  const userInputMode = presentation?.userInputMode ?? "text";
  const isNarrativeCharacterMessage = role === "character" && presentation?.profileId === "novel-prose";

  if (trimmedContent) {
    if (role === "narrator") {
      segments.push({
        type: "narration",
        actor,
        text: trimmedContent,
      });
    } else if (role === "user") {
      segments.push({
        type: userInputMode === "speech" ? "dialogue" : "text",
        ...(userInputMode === "speech" ? { speaker: actor } : {}),
        text: trimmedContent,
      } as MessageSegment);
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

export const formatMessageSegmentsForDisplay = (
  segments: MessageSegment[],
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
