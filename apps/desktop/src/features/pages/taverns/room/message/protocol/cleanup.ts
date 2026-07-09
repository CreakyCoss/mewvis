const erroneousOutputTagNames = [
  "private_thought",
  "privateThought",
  "public_reply",
  "publicReply",
  "narrative",
  "action",
  "decision",
  "summary",
  "state_patch",
  "statePatch",
  "memory_patch",
  "memoryPatch",
  "dialogue",
  "narration",
  "text",
  "thought",
];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const stripErroneousOutputTags = (text: string) =>
  text
    .replace(
      new RegExp(
        `<\\s*/?\\s*(?:${erroneousOutputTagNames.map(escapeRegExp).join("|")})(?:\\s+[^>]*)?\\s*/?\\s*>`,
        "gi",
      ),
      "",
    )
    .trim();

export const cleanThoughtText = (text: string) => stripErroneousOutputTags(text);

const stripStandaloneActionBlocks = (text: string) =>
  text.replace(/(^|\n)\s*[*_][^*_\n]+[*_]\s*(?=\n|$)/g, "\n").trim();

export const stripImmersiveDescriptionText = (text: string) =>
  stripStandaloneActionBlocks(text)
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const cleanAgentOutputContent = ({
  text,
}: {
  text: string;
}) => stripErroneousOutputTags(text);
