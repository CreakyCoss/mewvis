import {
  getAgentProtocolOutputDefinition,
  getAgentProtocolOutputDefinitions,
  getAllAgentProtocolOutputDefinitions,
  type AgentProtocolOutputDefinition,
} from "../../fields";
import type {
  AgentProtocolIssue,
  AgentProtocolOutputKey,
  AgentProtocolParseResult,
  AgentProtocolPrepared,
} from "../../types";
import { cleanProtocolOutputValue, compactDroppedProtocolText, stripProtocolMarkdownCodeFence } from "./cleanup";
import { wrapProtocolXmlTag } from "./tag";

type ExtractedOutputBlock = {
  field: AgentProtocolOutputKey;
  tag: string;
  value: string;
  start: number;
  end: number;
  recovered: boolean;
};

type TextRange = {
  start: number;
  end: number;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const uniqueSorted = (values: readonly string[]) =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
    (left, right) => right.length - left.length,
  );

const tagPatternFor = (definition: AgentProtocolOutputDefinition) =>
  uniqueSorted([definition.canonicalTag, ...definition.aliases]).map(escapeRegExp).join("|");

const allKnownTagPattern = () =>
  uniqueSorted(
    getAllAgentProtocolOutputDefinitions().flatMap((definition) => [definition.canonicalTag, ...definition.aliases]),
  )
    .map(escapeRegExp)
    .join("|");

const overlapsRange = (range: TextRange, ranges: readonly TextRange[]) =>
  ranges.some((existing) => range.start < existing.end && range.end > existing.start);

const collectClosedBlocks = ({
  text,
  definitions,
}: {
  text: string;
  definitions: readonly AgentProtocolOutputDefinition[];
}) => {
  const blocks: ExtractedOutputBlock[] = [];
  const occupiedRanges: TextRange[] = [];

  for (const definition of definitions) {
    const pattern = tagPatternFor(definition);
    const regex = new RegExp(
      `<\\s*(${pattern})(?:\\s+[^>]*)?\\s*>\\s*([\\s\\S]*?)\\s*<\\s*\\/\\s*(?:${pattern})\\s*>`,
      "gi",
    );
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text))) {
      const range = {
        start: match.index,
        end: match.index + match[0].length,
      };
      if (overlapsRange(range, occupiedRanges)) {
        continue;
      }

      occupiedRanges.push(range);
      blocks.push({
        field: definition.key,
        tag: match[1] ?? definition.canonicalTag,
        value: match[2] ?? "",
        ...range,
        recovered: false,
      });
    }
  }

  return blocks.sort((left, right) => left.start - right.start);
};

const findNextKnownTagIndex = (text: string, fromIndex: number) => {
  const pattern = allKnownTagPattern();
  const regex = new RegExp(`<\\s*/?\\s*(?:${pattern})(?:\\s+[^>]*)?\\s*>`, "gi");
  regex.lastIndex = fromIndex;
  const match = regex.exec(text);

  return match?.index;
};

const collectMalformedOpenBlocks = ({
  text,
  definitions,
  occupiedRanges,
}: {
  text: string;
  definitions: readonly AgentProtocolOutputDefinition[];
  occupiedRanges: readonly TextRange[];
}) => {
  const blocks: ExtractedOutputBlock[] = [];
  const nextOccupiedRanges = [...occupiedRanges];

  for (const definition of definitions) {
    const pattern = tagPatternFor(definition);
    const regex = new RegExp(`<\\s*(${pattern})(?:\\s+[^>]*)?\\s*>`, "i");
    const match = regex.exec(text);
    if (!match) {
      continue;
    }

    const valueStart = match.index + match[0].length;
    const valueEnd = findNextKnownTagIndex(text, valueStart) ?? text.length;
    const range = {
      start: match.index,
      end: valueEnd,
    };
    const value = text.slice(valueStart, valueEnd);

    if (!value.trim() || overlapsRange(range, nextOccupiedRanges)) {
      continue;
    }

    nextOccupiedRanges.push(range);
    blocks.push({
      field: definition.key,
      tag: match[1] ?? definition.canonicalTag,
      value,
      ...range,
      recovered: true,
    });
  }

  return blocks.sort((left, right) => left.start - right.start);
};

const stripRanges = (text: string, ranges: readonly TextRange[]) =>
  [...ranges]
    .sort((left, right) => right.start - left.start)
    .reduce((nextText, range) => `${nextText.slice(0, range.start)}\n${nextText.slice(range.end)}`, text);

const stripKnownProtocolTags = (text: string) => {
  const pattern = allKnownTagPattern();

  return text.replace(new RegExp(`<\\s*/?\\s*(?:${pattern})(?:\\s+[^>]*)?\\s*>`, "gi"), "").trim();
};

const canRecoverUnwrappedTextToField = (field: AgentProtocolOutputKey) =>
  getAgentProtocolOutputDefinition(field).visibility !== "private";

const pickUnwrappedRecoveryField = (output: readonly AgentProtocolOutputKey[]) =>
  output.find(canRecoverUnwrappedTextToField);

const addIssue = (issues: AgentProtocolIssue[], issue: AgentProtocolIssue) => {
  issues.push(issue);
};

const buildNormalizedText = (
  data: Partial<Record<AgentProtocolOutputKey, string>>,
  output: readonly AgentProtocolOutputKey[],
) =>
  getAgentProtocolOutputDefinitions(output)
    .flatMap((definition) => {
      const value = data[definition.key]?.trim();
      return value ? [wrapProtocolXmlTag(definition.canonicalTag, value)] : [];
    })
    .join("\n");

export const parseXmlOutput = (text: string, prepared: AgentProtocolPrepared): AgentProtocolParseResult => {
  const source = stripProtocolMarkdownCodeFence(text);
  const requestedDefinitions = getAgentProtocolOutputDefinitions(prepared.output);
  const requestedFields = new Set<AgentProtocolOutputKey>(prepared.output);
  const remainingDefinitions = getAllAgentProtocolOutputDefinitions().filter(
    (definition) => !requestedFields.has(definition.key),
  );
  const orderedDefinitions = [...requestedDefinitions, ...remainingDefinitions];
  const closedBlocks = collectClosedBlocks({
    text: source,
    definitions: orderedDefinitions,
  });
  const closedFields = new Set(closedBlocks.map((block) => block.field));
  const malformedBlocks = collectMalformedOpenBlocks({
    text: source,
    definitions: requestedDefinitions.filter((definition) => !closedFields.has(definition.key)),
    occupiedRanges: closedBlocks,
  });
  const blocks = [...closedBlocks, ...malformedBlocks].sort((left, right) => left.start - right.start);
  const issues: AgentProtocolIssue[] = [];
  const data: Partial<Record<AgentProtocolOutputKey, string>> = {};

  for (const block of blocks) {
    const value = cleanProtocolOutputValue(block.value);
    if (!requestedFields.has(block.field)) {
      addIssue(issues, {
        code: "unknown_output_dropped",
        field: block.field,
        tag: block.tag,
        message: `未请求的输出字段 ${block.field} 已丢弃。`,
        text: compactDroppedProtocolText(value),
      });
      continue;
    }

    if (data[block.field]) {
      addIssue(issues, {
        code: "duplicate_output_dropped",
        field: block.field,
        tag: block.tag,
        message: `重复输出字段 ${block.field} 已丢弃，只保留第一次出现的内容。`,
        text: compactDroppedProtocolText(value),
      });
      continue;
    }

    if (!value) {
      addIssue(issues, {
        code: "empty_output",
        field: block.field,
        tag: block.tag,
        message: `输出字段 ${block.field} 为空。`,
      });
      continue;
    }

    data[block.field] = value;

    if (block.recovered) {
      addIssue(issues, {
        code: "malformed_output_recovered",
        field: block.field,
        tag: block.tag,
        message: `输出字段 ${block.field} 缺少闭合标签，已按可恢复内容解析。`,
      });
    }
  }

  const outsideText = cleanProtocolOutputValue(stripKnownProtocolTags(stripRanges(source, blocks)));
  if (outsideText) {
    const recoveryField = pickUnwrappedRecoveryField(prepared.output);
    if (
      prepared.options.recoverUnwrappedText &&
      !prepared.options.strict &&
      recoveryField &&
      Object.keys(data).length === 0
    ) {
      data[recoveryField] = outsideText;
      addIssue(issues, {
        code: "unwrapped_text_recovered",
        field: recoveryField,
        message: `未包裹标签的文本已恢复为 ${recoveryField}。`,
        text: compactDroppedProtocolText(outsideText),
      });
    } else {
      addIssue(issues, {
        code: "outside_text_dropped",
        message: "标签外文本已丢弃。",
        text: compactDroppedProtocolText(outsideText),
      });
    }
  }

  const missing = prepared.output.filter((field) => !data[field]?.trim());
  for (const field of missing) {
    addIssue(issues, {
      code: "missing_output",
      field,
      message: `缺少必需输出字段 ${field}。`,
    });
  }

  const hasStrictIssue = prepared.options.strict && issues.length > 0;
  const hasRequiredOutput = missing.length === 0;
  const hasPartialOutput = Object.keys(data).length > 0;
  const ok = !hasStrictIssue && (hasRequiredOutput || (prepared.options.allowPartial && hasPartialOutput));

  return {
    ok,
    data,
    normalizedText: buildNormalizedText(data, prepared.output),
    issues,
    missing,
  };
};
