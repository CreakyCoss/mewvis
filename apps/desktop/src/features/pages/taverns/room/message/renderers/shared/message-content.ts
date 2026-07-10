import type { MessageSegment } from "../../types";

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

const stripStandaloneActionBlocks = (text: string) =>
  text.replace(/(^|\n)\s*[*_][^*_\n]+[*_]\s*(?=\n|$)/g, "\n").trim();

export const stripImmersiveDescriptionText = (text: string) =>
  stripStandaloneActionBlocks(text)
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
