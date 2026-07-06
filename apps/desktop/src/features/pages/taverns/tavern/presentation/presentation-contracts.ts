import type { TavernMessageKind } from "../types";
import type {
  TavernCharacter,
  TavernPresentationGenerationContract,
  TavernPresentationProfile,
} from "@/features/pages/taverns/manage/model";
import { formatTavernProtocolTagPair, TAVERN_PROTOCOL_FIELDS, wrapTavernProtocolTag } from "../message/protocol/schema";

export type TavernPresentationPublicContentTag =
  typeof TAVERN_PROTOCOL_FIELDS.publicReply.canonicalTag | typeof TAVERN_PROTOCOL_FIELDS.narrativeBeat.canonicalTag;
export type TavernPresentationHistoryContentTag =
  typeof TAVERN_PROTOCOL_FIELDS.publicReply.historyTag | typeof TAVERN_PROTOCOL_FIELDS.narrativeBeat.historyTag;
export type TavernPresentationVisibleContentTag =
  typeof TAVERN_PROTOCOL_FIELDS.publicReply.visibleTag | typeof TAVERN_PROTOCOL_FIELDS.narrativeBeat.visibleTag;
export type TavernPresentationPrivateThoughtTag = typeof TAVERN_PROTOCOL_FIELDS.privateThought.canonicalTag;

export type TavernPresentationRuntimeContract = {
  generationContract: TavernPresentationGenerationContract;
  privateThoughtTag: TavernPresentationPrivateThoughtTag;
  publicContentTag: TavernPresentationPublicContentTag;
  historyContentTag: TavernPresentationHistoryContentTag;
  visibleContentTag: TavernPresentationVisibleContentTag;
  characterMessageKind: Extract<TavernMessageKind, "character_reply" | "narrative_beat">;
  allowsContentOnlyReply: boolean;
  buildRequestActionLine: (activeCharacter: TavernCharacter) => string;
  buildRequestRequiredTagsLine: () => string;
  buildRequestContentLine: (allowNonverbalReply: boolean) => string;
  buildRetryMissingLine: (nonverbalReplyAllowed: boolean) => string;
  buildRetryTemplateLine: (speaker: TavernCharacter, nonverbalReplyAllowed: boolean) => string;
  buildRetryGuidanceLine: (nonverbalReplyAllowed: boolean) => string;
  buildEmptyContentFallback: (speaker: TavernCharacter) => string;
};

const privateThoughtTag = TAVERN_PROTOCOL_FIELDS.privateThought.canonicalTag;
const publicReplyTag = TAVERN_PROTOCOL_FIELDS.publicReply.canonicalTag;
const narrativeBeatTag = TAVERN_PROTOCOL_FIELDS.narrativeBeat.canonicalTag;

const formatRequiredTagsLine = (publicContentTag: TavernPresentationPublicContentTag) =>
  `输出必须包含 ${formatTavernProtocolTagPair(privateThoughtTag)} 和 ${formatTavernProtocolTagPair(publicContentTag)}。`;

const formatRetryTemplateLine = ({
  subject,
  publicContentTag,
  publicContent,
}: {
  subject: string;
  publicContentTag: TavernPresentationPublicContentTag;
  publicContent: string;
}) =>
  `请重新${subject}输出完整 XML：${wrapTavernProtocolTag(
    privateThoughtTag,
    "当前角色自己的心理短句",
  )}${wrapTavernProtocolTag(publicContentTag, publicContent)}。`;

const presentationContracts: Record<TavernPresentationGenerationContract, TavernPresentationRuntimeContract> = {
  character_reply_xml: {
    generationContract: "character_reply_xml",
    privateThoughtTag,
    publicContentTag: publicReplyTag,
    historyContentTag: TAVERN_PROTOCOL_FIELDS.publicReply.historyTag,
    visibleContentTag: TAVERN_PROTOCOL_FIELDS.publicReply.visibleTag,
    characterMessageKind: "character_reply",
    allowsContentOnlyReply: false,
    buildRequestActionLine: (activeCharacter) => `请以「${activeCharacter.name}」的身份生成本轮回复。`,
    buildRequestRequiredTagsLine: () => formatRequiredTagsLine(publicReplyTag),
    buildRequestContentLine: (allowNonverbalReply) =>
      allowNonverbalReply
        ? `${formatTavernProtocolTagPair(publicReplyTag)} 可以只包含当前角色可被观察到的动作，也可以没有直接对白；不要为了格式强行开口。`
        : `${formatTavernProtocolTagPair(publicReplyTag)} 必须非空；即使没有新信息，也要用当前角色口吻说一句简短公开状态。`,
    buildRetryMissingLine: (nonverbalReplyAllowed) =>
      nonverbalReplyAllowed
        ? "上一次输出没有可展示的公开动作。"
        : `上一次输出的 ${formatTavernProtocolTagPair(publicReplyTag)} 为空或只有动作标注，不能作为公开回复。`,
    buildRetryTemplateLine: (speaker, nonverbalReplyAllowed) =>
      nonverbalReplyAllowed
        ? formatRetryTemplateLine({
            subject: `以${speaker.name}身份`,
            publicContentTag: publicReplyTag,
            publicContent: "*一个可被观察到的动作，不写直接对白。*",
          })
        : formatRetryTemplateLine({
            subject: `以${speaker.name}身份`,
            publicContentTag: publicReplyTag,
            publicContent: "一句非空直接对白，可选一个动作。",
          }),
    buildRetryGuidanceLine: (nonverbalReplyAllowed) =>
      nonverbalReplyAllowed
        ? "本轮允许不开口，但必须给出用户能看到的动作或神态。"
        : "不能只点头、沉默、看向某处或只写动作；如果角色只想确认，也要先说一句短对白。",
    buildEmptyContentFallback: (speaker) => `*${speaker.name}短暂沉默，没有开口。*`,
  },
  character_narrative_beat: {
    generationContract: "character_narrative_beat",
    privateThoughtTag,
    publicContentTag: narrativeBeatTag,
    historyContentTag: TAVERN_PROTOCOL_FIELDS.narrativeBeat.historyTag,
    visibleContentTag: TAVERN_PROTOCOL_FIELDS.narrativeBeat.visibleTag,
    characterMessageKind: "narrative_beat",
    allowsContentOnlyReply: true,
    buildRequestActionLine: (activeCharacter) => `请围绕「${activeCharacter.name}」生成本轮第三人称叙事片段。`,
    buildRequestRequiredTagsLine: () => formatRequiredTagsLine(narrativeBeatTag),
    buildRequestContentLine: () =>
      `${formatTavernProtocolTagPair(narrativeBeatTag)} 必须逐字使用 <${narrativeBeatTag}> 标签输出一段可展示的第三人称正文；可以没有直接对白，但不要使用标签别名或聊天记录格式。`,
    buildRetryMissingLine: () => "上一次输出没有可展示的第三人称正文。",
    buildRetryTemplateLine: (speaker) =>
      formatRetryTemplateLine({
        subject: `以${speaker.name}为中心`,
        publicContentTag: narrativeBeatTag,
        publicContent: `一段第三人称小说正文，包含${speaker.name}的动作、心理压强、间接表达或公开可观察变化。`,
      }),
    buildRetryGuidanceLine: () => "本轮不要求直接对白，但必须有可读正文，不要输出聊天记录格式。",
    buildEmptyContentFallback: (speaker) => `${speaker.name}短暂停在原地，现场的沉默把未说出口的话压得更低。`,
  },
};

const isKnownGenerationContract = (value: unknown): value is TavernPresentationGenerationContract =>
  typeof value === "string" && value in presentationContracts;

export const getTavernPresentationContract = (
  value?: TavernPresentationGenerationContract | TavernPresentationProfile | null,
): TavernPresentationRuntimeContract => {
  const generationContract = value && typeof value === "object" ? value.generationContract : value;

  return isKnownGenerationContract(generationContract)
    ? presentationContracts[generationContract]
    : presentationContracts.character_reply_xml;
};

const contractByCharacterMessageKind: Partial<Record<TavernMessageKind, TavernPresentationRuntimeContract>> = {
  character_reply: presentationContracts.character_reply_xml,
  narrative_beat: presentationContracts.character_narrative_beat,
};

export const getTavernPresentationContractForMessageKind = (
  kind?: TavernMessageKind,
): TavernPresentationRuntimeContract =>
  (kind ? contractByCharacterMessageKind[kind] : undefined) ?? presentationContracts.character_reply_xml;
