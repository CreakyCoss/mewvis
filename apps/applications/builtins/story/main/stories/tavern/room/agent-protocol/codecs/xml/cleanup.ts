export const stripProtocolMarkdownCodeFence = (text: string) => {
  const trimmed = text.trim();
  const fenced = /^```(?:[a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n```\s*$/.exec(trimmed);

  return fenced ? (fenced[1] ?? "").trim() : trimmed;
};

export const cleanProtocolOutputValue = (text: string) =>
  stripProtocolMarkdownCodeFence(text)
    .replace(/^\s*(?:[-*]|\d+[.)、])\s*/, "")
    .trim();
