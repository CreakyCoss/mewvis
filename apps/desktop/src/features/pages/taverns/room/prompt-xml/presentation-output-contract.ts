import type { TavernMessageKind } from "@/features/pages/taverns/tavern/types";
import type {
  TavernPresentationGenerationContract,
  TavernPresentationProfile,
} from "@/features/pages/taverns/manage/model";
import { TAVERN_PROTOCOL_FIELDS } from "@/features/pages/taverns/room/message/protocol/schema";

export type TavernPresentationPublicContentTag =
  typeof TAVERN_PROTOCOL_FIELDS.publicReply.canonicalTag | typeof TAVERN_PROTOCOL_FIELDS.narrativeBeat.canonicalTag;

export type TavernPresentationHistoryContentTag =
  typeof TAVERN_PROTOCOL_FIELDS.publicReply.historyTag | typeof TAVERN_PROTOCOL_FIELDS.narrativeBeat.historyTag;

export type TavernPresentationVisibleContentTag =
  typeof TAVERN_PROTOCOL_FIELDS.publicReply.visibleTag | typeof TAVERN_PROTOCOL_FIELDS.narrativeBeat.visibleTag;

export type TavernPresentationPrivateThoughtTag = typeof TAVERN_PROTOCOL_FIELDS.privateThought.canonicalTag;

export type TavernPresentationOutputContract = {
  generationContract: TavernPresentationGenerationContract;
  privateThoughtTag: TavernPresentationPrivateThoughtTag;
  publicContentTag: TavernPresentationPublicContentTag;
  historyContentTag: TavernPresentationHistoryContentTag;
  visibleContentTag: TavernPresentationVisibleContentTag;
  characterMessageKind: Extract<TavernMessageKind, "character_reply" | "narrative_beat">;
  allowsContentOnlyReply: boolean;
};

const privateThoughtTag = TAVERN_PROTOCOL_FIELDS.privateThought.canonicalTag;
const publicReplyTag = TAVERN_PROTOCOL_FIELDS.publicReply.canonicalTag;
const narrativeBeatTag = TAVERN_PROTOCOL_FIELDS.narrativeBeat.canonicalTag;

export const TAVERN_PRESENTATION_OUTPUT_CONTRACTS = {
  character_reply_xml: {
    generationContract: "character_reply_xml",
    privateThoughtTag,
    publicContentTag: publicReplyTag,
    historyContentTag: TAVERN_PROTOCOL_FIELDS.publicReply.historyTag,
    visibleContentTag: TAVERN_PROTOCOL_FIELDS.publicReply.visibleTag,
    characterMessageKind: "character_reply",
    allowsContentOnlyReply: false,
  },
  character_narrative_beat: {
    generationContract: "character_narrative_beat",
    privateThoughtTag,
    publicContentTag: narrativeBeatTag,
    historyContentTag: TAVERN_PROTOCOL_FIELDS.narrativeBeat.historyTag,
    visibleContentTag: TAVERN_PROTOCOL_FIELDS.narrativeBeat.visibleTag,
    characterMessageKind: "narrative_beat",
    allowsContentOnlyReply: true,
  },
} as const satisfies Record<TavernPresentationGenerationContract, TavernPresentationOutputContract>;

const isKnownGenerationContract = (value: unknown): value is TavernPresentationGenerationContract =>
  typeof value === "string" && value in TAVERN_PRESENTATION_OUTPUT_CONTRACTS;

export const getTavernPresentationOutputContract = (
  value?: TavernPresentationGenerationContract | TavernPresentationProfile | null,
): TavernPresentationOutputContract => {
  const generationContract = value && typeof value === "object" ? value.generationContract : value;

  return isKnownGenerationContract(generationContract)
    ? TAVERN_PRESENTATION_OUTPUT_CONTRACTS[generationContract]
    : TAVERN_PRESENTATION_OUTPUT_CONTRACTS.character_reply_xml;
};

const contractByCharacterMessageKind: Partial<Record<TavernMessageKind, TavernPresentationOutputContract>> = {
  character_reply: TAVERN_PRESENTATION_OUTPUT_CONTRACTS.character_reply_xml,
  narrative_beat: TAVERN_PRESENTATION_OUTPUT_CONTRACTS.character_narrative_beat,
};

export const getTavernPresentationOutputContractForMessageKind = (
  kind?: TavernMessageKind,
): TavernPresentationOutputContract =>
  (kind ? contractByCharacterMessageKind[kind] : undefined) ?? TAVERN_PRESENTATION_OUTPUT_CONTRACTS.character_reply_xml;
