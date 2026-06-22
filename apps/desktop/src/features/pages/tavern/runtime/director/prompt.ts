import {
  appendReferencesToPrompt,
} from "@/features/ai/components/context-tools";
import type {
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
} from "../../types";
import {
  formatTavernLorebookEntries,
  selectTavernLorebookEntries,
  tavernMessagesToRuntimeMessages,
} from "../prompt";
import {
  buildTavernSchedulingSignals,
  canTavernSelectedTargetsStaySilent,
  formatTavernDirectorProfileForPrompt,
  formatTavernDirectorSchedulingInstruction,
  formatTavernSchedulingSignalsForPrompt,
  isTavernDirectorOnlyTurnAllowed,
} from "../../core";
import { getTavernPromptStylePreset } from "../../prompt-styles";
import { getTavernPresentationProfile } from "../../prompt-registry/presentation-rules";
import {
  resolveTavernSystemNarrativePreset,
} from "../../prompt-registry/system-narrative-styles";
import {
  shouldOfferTavernDirectorRandomEvent,
} from "./decision";
import { buildTavernDirectorContextSections } from "./prompt/context-sections";
import { buildTavernDirectorOutputContract } from "./prompt/contract";

export type BuildTavernDirectorPromptContextInput = {
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
  turnTrigger: {
    type: "user" | "scene_drive";
    directive?: string;
  };
  selectedTargetCharacterIds: string[];
  maxSpeakers: number;
  randomEventOpportunity?: boolean;
};

export const buildTavernDirectorPromptContext = ({
  room,
  characters,
  messages,
  references,
  currentUserText,
  turnTrigger,
  selectedTargetCharacterIds,
  maxSpeakers,
  randomEventOpportunity,
}: BuildTavernDirectorPromptContextInput) => {
  const isSceneDriveTurn = turnTrigger.type === "scene_drive";
  const sceneDriveDirective = (
    turnTrigger.directive?.trim() ||
    currentUserText.trim() ||
    "继续推进当前场景。"
  );
  const runtimeMessages = tavernMessagesToRuntimeMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
  });
  const lorebookText = formatTavernLorebookEntries(selectTavernLorebookEntries({
    room,
    characters,
    currentUserText,
  }));
  const ambientActionMax = Math.min(2, Math.max(0, characters.length - 1));
  const promptStyle = getTavernPromptStylePreset(room.promptStyleId);
  const presentationProfile = getTavernPresentationProfile(room.presentation?.profileId);
  const systemNarrative = resolveTavernSystemNarrativePreset(
    room.settings.systemNarrativePreset,
  );
  const canConsiderRandomEvent = randomEventOpportunity ?? shouldOfferTavernDirectorRandomEvent(room);
  const canRequestIllustrationHints = room.settings.illustrationHints.enabled;
  const directorOnlyAllowed = isTavernDirectorOnlyTurnAllowed(room);
  const schedulingInstruction = formatTavernDirectorSchedulingInstruction(room);
  const schedulingSignals = buildTavernSchedulingSignals({
    room,
    characters,
    messages,
    currentUserText,
    selectedTargetCharacterIds,
  });
  const directorProfileText = formatTavernDirectorProfileForPrompt({
    profile: room.settings.directorScheduling.profile,
    characters,
  });
  const schedulingSignalsText = formatTavernSchedulingSignalsForPrompt({
    signals: schedulingSignals,
    characters,
  });
  const selectedTargetsCanStaySilent = canTavernSelectedTargetsStaySilent(
    room,
    selectedTargetCharacterIds,
  );
  const directorPrompt = [
    buildTavernDirectorOutputContract({
      maxSpeakers,
      ambientActionMax,
      isSceneDriveTurn,
      directorOnlyAllowed,
      selectedTargetsCanStaySilent,
      canConsiderRandomEvent,
      canRequestIllustrationHints,
      schedulingInstruction,
    }),
    "",
    buildTavernDirectorContextSections({
      room,
      characters,
      messages,
      currentUserText,
      isSceneDriveTurn,
      sceneDriveDirective,
      runtimeMessages,
      lorebookText,
      selectedTargetCharacterIds,
      directorProfileText,
      schedulingSignalsText,
      presentationProfile,
      promptStyle,
      systemNarrative,
    }),
  ].join("\n");

  return {
    canConsiderRandomEvent,
    canRequestIllustrationHints,
    directorOnlyAllowed,
    isSceneDriveTurn,
    presentationProfile,
    promptStyle,
    requestContext: appendReferencesToPrompt(directorPrompt, references),
    schedulingInstruction,
    selectedTargetsCanStaySilent,
    systemNarrative,
  };
};
