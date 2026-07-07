export type TavernProtocolContentKind = "reply" | "narrative_beat";

export type TavernProtocolFieldId = "privateThought" | "publicReply" | "narrativeBeat";

export type TavernProtocolFieldDefinition = {
  id: TavernProtocolFieldId;
  canonicalTag: string;
  label: string;
  aliases: readonly string[];
  labels: readonly string[];
  contentKind?: TavernProtocolContentKind;
  historyTag?: string;
  visibleTag?: string;
};

export const TAVERN_PROTOCOL_FIELDS = {
  privateThought: {
    id: "privateThought",
    canonicalTag: "inner_thought",
    label: "心理想法",
    aliases: ["private_thought", "history_private_thought", "thought", "mind", "心理想法", "内心想法", "心想", "心理"],
    labels: ["心理想法", "内心想法", "内心", "心想", "心理", "想法"],
    historyTag: "history_private_thought",
    visibleTag: "private_thought",
  },
  publicReply: {
    id: "publicReply",
    canonicalTag: "reply",
    label: "公开回复",
    aliases: [
      "public_reply",
      "history_public_reply",
      "public_content",
      "response",
      "content",
      "正文",
      "回复",
      "回应",
      "对白",
    ],
    labels: ["公开回应", "公开回复", "回复", "回应", "正文", "对白"],
    contentKind: "reply",
    historyTag: "history_public_reply",
    visibleTag: "public_content",
  },
  narrativeBeat: {
    id: "narrativeBeat",
    canonicalTag: "narrative_beat",
    label: "叙事片段",
    aliases: [
      "public_narrative_beat",
      "history_narrative_beat",
      "story_beat",
      "narrative",
      "story",
      "beat",
      "叙事片段",
      "故事片段",
      "小说正文",
      "叙事正文",
    ],
    labels: ["叙事片段", "故事片段", "小说正文", "叙事正文"],
    contentKind: "narrative_beat",
    historyTag: "history_narrative_beat",
    visibleTag: "narrative_beat",
  },
} as const satisfies Record<TavernProtocolFieldId, TavernProtocolFieldDefinition>;

export const TAVERN_PROTOCOL_CONTEXT_WRAPPER_TAGS = [
  "message",
  "history_message",
  "narration",
  "history_narration",
] as const;

export const getTavernProtocolFieldTagNames = (fieldId: TavernProtocolFieldId) => [
  TAVERN_PROTOCOL_FIELDS[fieldId].canonicalTag,
  ...TAVERN_PROTOCOL_FIELDS[fieldId].aliases,
];

export const getTavernProtocolFieldLabels = (fieldId: TavernProtocolFieldId) => TAVERN_PROTOCOL_FIELDS[fieldId].labels;

export const getTavernProtocolPublicContentTagNames = () => [
  ...getTavernProtocolFieldTagNames("narrativeBeat"),
  ...getTavernProtocolFieldTagNames("publicReply"),
];

export const getTavernProtocolVisiblePrivateThoughtTag = () => TAVERN_PROTOCOL_FIELDS.privateThought.visibleTag;

export const getTavernProtocolHistoryPrivateThoughtTag = () => TAVERN_PROTOCOL_FIELDS.privateThought.historyTag;

export const openTavernProtocolTag = (tagName: string) => `<${tagName}>`;

export const closeTavernProtocolTag = (tagName: string) => `</${tagName}>`;

export const formatTavernProtocolTagPair = (tagName: string) =>
  `${openTavernProtocolTag(tagName)}...${closeTavernProtocolTag(tagName)}`;

export const wrapTavernProtocolTag = (tagName: string, content: string) =>
  `${openTavernProtocolTag(tagName)}${content}${closeTavernProtocolTag(tagName)}`;
