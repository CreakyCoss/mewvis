import type {
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
} from "../../types";
import type { StoryContextPackage } from "@/features/story";
import {
  buildTavernBridgeSystemPrompt,
  buildTavernCharacterPromptParts,
} from "../prompt";
import { getTavernPresentationProfile } from "../../prompt-registry/presentation-rules";
import { getTavernPresentationContract } from "../../presentation-contracts";
import {
  formatTavernVisibleMessagesForRequestContext,
  normalizeTavernMessagesForAudience,
} from "../../message";
import {
  filterTavernFactEventsForAudience,
  tavernBridgeSessionRootDir,
  tavernCharacterAgentRoleId,
} from "../../core";

export type TavernReplyAgentRequestInput = {
  room: TavernRoom;
  activeCharacter: TavernCharacter;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
  turnInstruction?: string;
  allowNonverbalReply?: boolean;
  storyContext?: StoryContextPackage;
};

const escapePromptXmlText = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const escapePromptXmlAttribute = (text: string) =>
  escapePromptXmlText(text).replace(/"/g, "&quot;");

const inferCharacterFactionIds = (
  room: TavernRoom,
  characterId: string,
) => Array.from(new Set(room.factEvents.flatMap((factEvent) => {
  const isCharacterFact =
    (factEvent.actor?.type === "character" && factEvent.actor.characterId === characterId) ||
    (factEvent.target?.type === "character" && factEvent.target.characterId === characterId) ||
    factEvent.visibleToCharacterIds?.includes(characterId);
  return isCharacterFact ? factEvent.visibleToFactionIds ?? [] : [];
})));

const formatVisibleFactEventsForRequestContext = (
  room: TavernRoom,
  activeCharacter: TavernCharacter,
) => {
  const visibleFactEvents = filterTavernFactEventsForAudience({
    factEvents: room.factEvents,
    room,
    audience: {
      type: "character",
      characterId: activeCharacter.id,
      factionIds: inferCharacterFactionIds(room, activeCharacter.id),
    },
  });

  if (visibleFactEvents.length === 0) {
    return "";
  }

  return visibleFactEvents.slice(-24).map((factEvent) => [
    `<fact_event id="${escapePromptXmlAttribute(factEvent.id)}" type="${escapePromptXmlAttribute(factEvent.type)}" visibility="${escapePromptXmlAttribute(factEvent.visibility ?? "public")}">`,
    `<evidence>${escapePromptXmlText(factEvent.evidence)}</evidence>`,
    factEvent.visibleToCharacterIds?.length
      ? `<visible_to_characters>${escapePromptXmlText(factEvent.visibleToCharacterIds.join(", "))}</visible_to_characters>`
      : "",
    factEvent.visibleToFactionIds?.length
      ? `<visible_to_factions>${escapePromptXmlText(factEvent.visibleToFactionIds.join(", "))}</visible_to_factions>`
      : "",
    "</fact_event>",
  ].filter(Boolean).join("\n")).join("\n\n");
};

export const buildTavernReplyAgentRequest = ({
  room,
  activeCharacter,
  characters,
  messages,
  references,
  currentUserText,
  turnInstruction,
  allowNonverbalReply = false,
  storyContext,
}: TavernReplyAgentRequestInput) => {
  const presentationProfile = getTavernPresentationProfile(room.presentation?.profileId);
  const presentationContract = getTavernPresentationContract(presentationProfile);
  const promptParts = buildTavernCharacterPromptParts({
    room,
    activeCharacter,
    characters,
    references,
    currentUserText,
    turnInstruction,
    storyContext,
  });
  const visibleMessages = normalizeTavernMessagesForAudience({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
    audience: { type: "character", characterId: activeCharacter.id },
  });
  const visibleFactEventsText = formatVisibleFactEventsForRequestContext(room, activeCharacter);

  return {
    sessionRootDir: tavernBridgeSessionRootDir(room),
    agentRoleId: tavernCharacterAgentRoleId(room, activeCharacter),
    systemPrompt: buildTavernBridgeSystemPrompt(room),
    userMessage: [
      presentationContract.buildRequestActionLine(activeCharacter),
      presentationContract.buildRequestRequiredTagsLine(),
      presentationContract.buildRequestContentLine(allowNonverbalReply),
    ].join("\n"),
    requestContext: [
      promptParts.requestContext,
      "",
      "<visible_turn_messages>",
      formatTavernVisibleMessagesForRequestContext(visibleMessages),
      "</visible_turn_messages>",
      visibleFactEventsText
        ? [
            "",
            "<visible_fact_events instruction=\"facts_known_to_current_character; do_not_reveal_private_facts_unless_role_would_say_it\">",
            visibleFactEventsText,
            "</visible_fact_events>",
          ].join("\n")
        : "",
    ].join("\n"),
    runtimeInstruction: promptParts.runtimeInstruction || turnInstruction || null,
  };
};
