import type { MessageActorRef, MessageSegment } from "../types";

const actionPrefixPattern = /^\s*(?:动作|行动|神态|表情|姿态|可见动作|肢体动作)\s*[:：]\s*(.+?)\s*$/;
const actionTagPattern = /^\s*<action(?:\s[^>]*)?>([\s\S]*?)<\/action>\s*$/i;

export const normalizeActionText = (text: string, includeBrackets = true) => {
  const trimmed = text.trim();
  const prefixedText = actionPrefixPattern.exec(trimmed)?.[1]?.trim();
  return stripPairedActionMarkers(prefixedText || trimmed, includeBrackets);
};

export const buildDialogueAndActionSegments = ({
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
  return markedText === trimmed ? null : markedText;
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
