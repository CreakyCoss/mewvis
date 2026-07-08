import type { TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import type { TavernMessage, TavernReferencedFile } from "@/features/pages/taverns/tavern/types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import { buildTavernBridgeSystemPrompt } from "../prompt/bridge/system-prompt";
import { buildTavernCharacterPromptParts } from "../prompt/character/system-prompt";
import { getTavernPresentationProfile } from "@/features/pages/taverns/tavern/prompt-registry/presentation-rules";
import { getTavernPresentationContract } from "@/features/pages/taverns/room/turn/presentation-contract";
import {
  formatTavernVisibleMessagesForRequestContext,
  normalizeTavernMessagesForAudience,
} from "@/features/pages/taverns/room/message/domain/visibility";
import { tavernBridgeSessionRootDir, tavernCharacterAgentRoleId } from "@/features/pages/taverns/room/turn/agent-role";

export type TavernReplyAgentRequestInput = {
  room: TavernRoomRuntime;
  activeCharacter: TavernCharacter;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
  turnInstruction?: string;
  allowNonverbalReply?: boolean;
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
}: TavernReplyAgentRequestInput) => {
  const presentationProfile = getTavernPresentationProfile(room.presentation.profile?.profileId);
  const presentationContract = getTavernPresentationContract(presentationProfile);
  const promptParts = buildTavernCharacterPromptParts({
    room,
    activeCharacter,
    characters,
    references,
    currentUserText,
    turnInstruction,
  });
  const visibleMessages = normalizeTavernMessagesForAudience({
    messages,
    characters,
    userPersonaName: room.user.personaName,
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
