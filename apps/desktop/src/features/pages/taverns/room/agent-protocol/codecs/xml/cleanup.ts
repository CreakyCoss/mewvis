export const stripProtocolMarkdownCodeFence = (text: string) => {
  const trimmed = text.trim();
  const fenced = /^```(?:[a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n```\s*$/.exec(trimmed);

  return fenced ? (fenced[1] ?? "").trim() : trimmed;
};

export const cleanProtocolOutputValue = (text: string) =>
  stripProtocolMarkdownCodeFence(text)
    .replace(/^\s*(?:[-*]|\d+[.)、])\s*/, "")
    .trim();

export const compactDroppedProtocolText = (text: string, maxLength = 180) => {
  const compacted = text.replace(/\s+/g, " ").trim();

  return compacted.length <= maxLength ? compacted : `${compacted.slice(0, maxLength)}...`;
};
