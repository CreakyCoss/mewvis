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
