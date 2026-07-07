import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { TavernMessage, TavernReferencedFile } from "../../types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import type { TavernStoryContextPackage } from "@/features/pages/taverns/room/story-context";
import { buildTavernBridgeSystemPrompt, buildTavernCharacterPromptParts } from "../prompt";
import { getTavernPresentationProfile } from "../../prompt-registry/presentation-rules";
import { getTavernPresentationContract } from "../../presentation/presentation-contracts";
import {
  formatTavernVisibleMessagesForRequestContext,
  normalizeTavernMessagesForAudience,
} from "@/features/pages/taverns/room/message";
import { tavernBridgeSessionRootDir, tavernCharacterAgentRoleId } from "../../core";

export type TavernReplyAgentRequestInput = {
  room: TavernRoom;
  activeCharacter: TavernCharacter;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
  turnInstruction?: string;
  allowNonverbalReply?: boolean;
  storyContext?: TavernStoryContextPackage;
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
    ].join("\n"),
    runtimeInstruction: promptParts.runtimeInstruction || turnInstruction || null,
  };
};
