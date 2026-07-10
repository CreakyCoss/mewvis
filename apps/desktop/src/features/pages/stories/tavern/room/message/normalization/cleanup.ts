import { getAllAgentProtocolOutputDefinitions } from "../../agent-protocol/fields";

const presentationTagNames = ["dialogue", "narration", "text", "thought"];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const erroneousOutputTagPattern = [
  ...getAllAgentProtocolOutputDefinitions().flatMap((definition) => [definition.canonicalTag, ...definition.aliases]),
  ...presentationTagNames,
]
  .map(escapeRegExp)
  .join("|");

const stripErroneousOutputTags = (text: string) =>
  text.replace(new RegExp(`<\\s*\\/?\\s*(?:${erroneousOutputTagPattern})(?:\\s+[^>]*)?\\s*\\/?\\s*>`, "gi"), "").trim();

export const cleanThoughtText = (text: string) => stripErroneousOutputTags(text);

export const cleanAgentOutputContent = (text: string) => stripErroneousOutputTags(text);
