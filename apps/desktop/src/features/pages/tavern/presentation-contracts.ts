import type {
  TavernCharacter,
  TavernMessageKind,
  TavernPresentationGenerationContract,
  TavernPresentationProfile,
} from "./types";

export type TavernPresentationPublicContentTag = "reply" | "narrative_beat";
export type TavernPresentationHistoryContentTag =
  | "history_public_reply"
  | "history_narrative_beat";
export type TavernPresentationVisibleContentTag =
  | "public_content"
  | "narrative_beat";

export type TavernPresentationRuntimeContract = {
  generationContract: TavernPresentationGenerationContract;
  publicContentTag: TavernPresentationPublicContentTag;
  historyContentTag: TavernPresentationHistoryContentTag;
  visibleContentTag: TavernPresentationVisibleContentTag;
  characterMessageKind: Extract<TavernMessageKind, "character_reply" | "narrative_beat">;
  allowsContentOnlyReply: boolean;
  buildRequestActionLine: (activeCharacter: TavernCharacter) => string;
  buildRequestRequiredTagsLine: () => string;
  buildRequestContentLine: (allowNonverbalReply: boolean) => string;
  buildRetryMissingLine: (nonverbalReplyAllowed: boolean) => string;
  buildRetryTemplateLine: (
    speaker: TavernCharacter,
    nonverbalReplyAllowed: boolean,
  ) => string;
  buildRetryGuidanceLine: (nonverbalReplyAllowed: boolean) => string;
  buildEmptyContentFallback: (speaker: TavernCharacter) => string;
};

const presentationContracts: Record<
  TavernPresentationGenerationContract,
  TavernPresentationRuntimeContract
> = {
  character_reply_xml: {
    generationContract: "character_reply_xml",
    publicContentTag: "reply",
    historyContentTag: "history_public_reply",
    visibleContentTag: "public_content",
    characterMessageKind: "character_reply",
    allowsContentOnlyReply: false,
    buildRequestActionLine: (activeCharacter) =>
      `请以「${activeCharacter.name}」的身份生成本轮回复。`,
    buildRequestRequiredTagsLine: () =>
      "输出必须包含 <inner_thought>...</inner_thought> 和 <reply>...</reply>。",
    buildRequestContentLine: (allowNonverbalReply) =>
      allowNonverbalReply
        ? "<reply> 可以只包含当前角色可被观察到的动作，也可以没有直接对白；不要为了格式强行开口。"
        : "<reply> 必须非空；即使没有新信息，也要用当前角色口吻说一句简短公开状态。",
    buildRetryMissingLine: (nonverbalReplyAllowed) =>
      nonverbalReplyAllowed
        ? "上一次输出没有可展示的公开动作。"
        : "上一次输出的 <reply> 为空或只有动作标注，不能作为公开回复。",
    buildRetryTemplateLine: (speaker, nonverbalReplyAllowed) =>
      nonverbalReplyAllowed
        ? `请重新以${speaker.name}身份输出完整 XML：<inner_thought>当前角色自己的心理短句</inner_thought><reply>*一个可被观察到的动作，不写直接对白。*</reply>。`
        : `请重新以${speaker.name}身份输出完整 XML：<inner_thought>当前角色自己的心理短句</inner_thought><reply>一句非空直接对白，可选一个动作。</reply>。`,
    buildRetryGuidanceLine: (nonverbalReplyAllowed) =>
      nonverbalReplyAllowed
        ? "本轮允许不开口，但必须给出用户能看到的动作或神态。"
        : "不能只点头、沉默、看向某处或只写动作；如果角色只想确认，也要先说一句短对白。",
    buildEmptyContentFallback: (speaker) => `*${speaker.name}短暂沉默，没有开口。*`,
  },
  character_narrative_beat: {
    generationContract: "character_narrative_beat",
    publicContentTag: "narrative_beat",
    historyContentTag: "history_narrative_beat",
    visibleContentTag: "narrative_beat",
    characterMessageKind: "narrative_beat",
    allowsContentOnlyReply: true,
    buildRequestActionLine: (activeCharacter) =>
      `请围绕「${activeCharacter.name}」生成本轮第三人称叙事片段。`,
    buildRequestRequiredTagsLine: () =>
      "输出必须包含 <inner_thought>...</inner_thought> 和 <narrative_beat>...</narrative_beat>。",
    buildRequestContentLine: () =>
      "<narrative_beat> 必须是一段可展示的第三人称正文；可以没有直接对白，但不要输出聊天记录格式。",
    buildRetryMissingLine: () => "上一次输出没有可展示的第三人称正文。",
    buildRetryTemplateLine: (speaker) =>
      `请重新以${speaker.name}为中心输出完整 XML：<inner_thought>当前角色自己的心理短句</inner_thought><narrative_beat>一段第三人称小说正文，包含${speaker.name}的动作、心理压强、间接表达或公开可观察变化。</narrative_beat>。`,
    buildRetryGuidanceLine: () =>
      "本轮不要求直接对白，但必须有可读正文，不要输出聊天记录格式。",
    buildEmptyContentFallback: (speaker) =>
      `${speaker.name}短暂停在原地，现场的沉默把未说出口的话压得更低。`,
  },
};

const isKnownGenerationContract = (
  value: unknown,
): value is TavernPresentationGenerationContract =>
  typeof value === "string" && value in presentationContracts;

export const getTavernPresentationContract = (
  value?: TavernPresentationGenerationContract | TavernPresentationProfile | null,
): TavernPresentationRuntimeContract => {
  const generationContract = value && typeof value === "object"
    ? value.generationContract
    : value;

  return isKnownGenerationContract(generationContract)
    ? presentationContracts[generationContract]
    : presentationContracts.character_reply_xml;
};

const contractByCharacterMessageKind: Partial<
  Record<TavernMessageKind, TavernPresentationRuntimeContract>
> = {
  character_reply: presentationContracts.character_reply_xml,
  narrative_beat: presentationContracts.character_narrative_beat,
};

export const getTavernPresentationContractForMessageKind = (
  kind?: TavernMessageKind,
): TavernPresentationRuntimeContract =>
  (kind ? contractByCharacterMessageKind[kind] : undefined) ??
    presentationContracts.character_reply_xml;
