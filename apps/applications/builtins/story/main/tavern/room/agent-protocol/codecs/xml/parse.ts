import { getAllAgentProtocolOutputDefinitions, type AgentProtocolOutputDefinition } from "../../fields";
import type { AgentProtocolData } from "../../types";
import { cleanProtocolOutputValue, stripProtocolMarkdownCodeFence } from "./cleanup";

type ExtractedOutputBlock = {
  definition: AgentProtocolOutputDefinition;
  tag: string;
  value: string;
  start: number;
  end: number;
};

type KnownTagMatch = {
  end: number;
  index: number;
  isClosing: boolean;
  tag: string;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const uniqueSorted = (values: readonly string[]) =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => right.length - left.length);

const outputDefinitions = getAllAgentProtocolOutputDefinitions();

const tagsForDefinition = (definition: AgentProtocolOutputDefinition) => [
  definition.canonicalTag,
  ...definition.aliases,
];

const allKnownTags = uniqueSorted(outputDefinitions.flatMap(tagsForDefinition));
const allKnownTagPattern = allKnownTags.map(escapeRegExp).join("|");

const definitionByCanonicalTag = new Map(
  outputDefinitions.map((definition) => [definition.canonicalTag.toLowerCase(), definition]),
);
const definitionByAlias = new Map<string, AgentProtocolOutputDefinition>();

for (const definition of outputDefinitions) {
  for (const alias of definition.aliases) {
    const normalizedAlias = alias.toLowerCase();
    if (!definitionByCanonicalTag.has(normalizedAlias) && !definitionByAlias.has(normalizedAlias)) {
      definitionByAlias.set(normalizedAlias, definition);
    }
  }
}

const resolveOutputDefinition = (tag: string) => {
  const normalizedTag = tag.toLowerCase();
  return definitionByCanonicalTag.get(normalizedTag) ?? definitionByAlias.get(normalizedTag) ?? null;
};

const createKnownTagRegex = (flags: string) =>
  new RegExp(`<\\s*(\\/?)\\s*(${allKnownTagPattern})(?:\\s+[^>]*)?\\s*\\/?\\s*>`, flags);

const findNextKnownTag = (text: string, fromIndex: number): KnownTagMatch | null => {
  const regex = createKnownTagRegex("gi");
  regex.lastIndex = fromIndex;
  const match = regex.exec(text);
  if (!match) {
    return null;
  }

  return {
    index: match.index,
    end: match.index + match[0].length,
    isClosing: match[1] === "/",
    tag: match[2] ?? "",
  };
};

const collectOutputBlocks = (text: string) => {
  const blocks: ExtractedOutputBlock[] = [];
  let searchIndex = 0;

  while (searchIndex < text.length) {
    const openingTag = findNextKnownTag(text, searchIndex);
    if (!openingTag) {
      break;
    }

    if (openingTag.isClosing) {
      searchIndex = openingTag.end;
      continue;
    }

    const definition = resolveOutputDefinition(openingTag.tag);
    if (!definition) {
      searchIndex = openingTag.end;
      continue;
    }

    const nextTag = findNextKnownTag(text, openingTag.end);
    const nextTagDefinition = nextTag ? resolveOutputDefinition(nextTag.tag) : null;
    const hasMatchingClose = Boolean(nextTag?.isClosing && nextTagDefinition?.key === definition.key);
    const valueEnd = nextTag?.index ?? text.length;
    const blockEnd = hasMatchingClose && nextTag ? nextTag.end : valueEnd;

    blocks.push({
      definition,
      tag: openingTag.tag,
      value: text.slice(openingTag.end, valueEnd),
      start: openingTag.index,
      end: blockEnd,
    });
    searchIndex = blockEnd > openingTag.index ? blockEnd : openingTag.end;
  }

  return blocks;
};

const stripKnownProtocolTags = (text: string) => text.replace(createKnownTagRegex("gi"), "").trim();

const appendUnwrappedText = (data: AgentProtocolData[], text: string) => {
  const content = cleanProtocolOutputValue(stripKnownProtocolTags(text));
  if (content) {
    data.push({
      type: "unwrappedText",
      content,
    });
  }
};

export const parseXmlOutput = (text: string): AgentProtocolData[] => {
  const source = stripProtocolMarkdownCodeFence(text);
  const blocks = collectOutputBlocks(source);
  const data: AgentProtocolData[] = [];
  let cursor = 0;

  for (const block of blocks) {
    appendUnwrappedText(data, source.slice(cursor, block.start));

    data.push({
      type: block.definition.key,
      tag: block.tag,
      content: cleanProtocolOutputValue(block.value),
    });
    cursor = block.end;
  }

  appendUnwrappedText(data, source.slice(cursor));
  return data;
};
