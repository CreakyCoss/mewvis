import {
  appendReferencesToPrompt,
} from "@/features/ai/components/context-tools";
import { getTavernPresentationContract } from "../../../presentation-contracts";
import { getTavernPresentationProfile } from "../../../prompt-registry/presentation-rules";
import {
  formatTavernInteractionQualityRulesForTarget,
  formatTavernPromptBlocksForTarget,
} from "../../../prompt-registry/text-blocks";
import type {
  TavernCharacter,
  TavernReferencedFile,
  TavernRoom,
} from "../../../types";
import {
  formatTavernLorebookEntries,
  selectTavernLorebookEntries,
} from "../context/lorebook";
import { formatTavernStoryGraphContext } from "../context/story-graph";
import {
  buildCharacterContextSections,
  formatCompactPresentCharacters,
} from "../layers/character-context";
import { buildPresentationProfileSection } from "../layers/presentation";
import { buildCharacterSystemContractSection } from "../layers/system-contract";
import { buildTavernContextSections } from "../layers/tavern-context";
import {
  renderTavernPromptSections,
  type TavernPromptSection,
} from "../shared/sections";

export type BuildTavernSystemPromptInput = {
  room: TavernRoom;
  activeCharacter: TavernCharacter;
  characters: TavernCharacter[];
  references: TavernReferencedFile[];
  currentUserText: string;
  turnInstruction?: string;
};

export type TavernCharacterPromptParts = {
  runtimeInstruction: string;
  requestContext: string;
  fullPrompt: string;
};

const buildTurnInstructionSection = (turnInstruction?: string): TavernPromptSection => ({
  id: "turn-instruction",
  layer: "turn",
  tag: "turn_instruction",
  content: turnInstruction ?? "",
});

const buildSavedPromptBlocksSection = ({
  room,
  publicContentTag,
}: {
  room: TavernRoom;
  publicContentTag: string;
}): TavernPromptSection => ({
  id: "prompt-blocks",
  layer: "tavern",
  content: [
    formatTavernPromptBlocksForTarget({
      prompt: room.prompt,
      target: "character",
      publicContentTag,
    }),
    formatTavernInteractionQualityRulesForTarget({
      qualityRuleIds: room.settings.interactionQualityRuleIds,
      target: "character",
      publicContentTag,
    }),
  ].filter(Boolean).join("\n\n"),
});

export const buildTavernSystemPrompt = ({
  room,
  activeCharacter,
  characters,
  references,
  currentUserText,
  turnInstruction,
}: BuildTavernSystemPromptInput) =>
  buildTavernCharacterPromptParts({
    room,
    activeCharacter,
    characters,
    references,
    currentUserText,
    turnInstruction,
  }).fullPrompt;

export const buildTavernCharacterPromptParts = ({
  room,
  activeCharacter,
  characters,
  references,
  currentUserText,
  turnInstruction,
}: BuildTavernSystemPromptInput): TavernCharacterPromptParts => {
  const characterMemory = room.characterMemories[activeCharacter.id]?.trim() ?? "";
  const lorebookText = formatTavernLorebookEntries(selectTavernLorebookEntries({
    room,
    activeCharacter,
    characters,
    currentUserText,
  }), {
    maxEntries: 4,
    maxContentChars: 700,
  });
  const storyGraphText = formatTavernStoryGraphContext(room, {
    maxEdges: 8,
    maxSummaryChars: 280,
  });
  const presentationProfile = getTavernPresentationProfile(room.presentation?.profileId);
  const presentationContract = getTavernPresentationContract(presentationProfile);
  const publicContentTag = presentationContract.publicContentTag;
  const usesNarrativeBeat = presentationContract.characterMessageKind === "narrative_beat";
  const compactCharacters = formatCompactPresentCharacters({
    activeCharacter,
    room,
    characters,
  });

  const instructionSections: TavernPromptSection[] = [
    buildCharacterSystemContractSection({
      activeCharacter,
      privateThoughtTag: presentationContract.privateThoughtTag,
      publicContentTag,
      usesNarrativeBeat,
      dialoguePolicy: presentationProfile.dialoguePolicy,
    }),
    buildPresentationProfileSection({
      presentationProfile,
      target: "character",
    }),
    buildSavedPromptBlocksSection({
      room,
      publicContentTag,
    }),
    buildTurnInstructionSection(turnInstruction),
  ];
  const contextSections: TavernPromptSection[] = [
    ...buildTavernContextSections({
      room,
      lorebookText,
      storyGraphText,
    }),
    ...buildCharacterContextSections({
      activeCharacter,
      room,
      characters,
      characterMemory,
      compactCharacters,
    }),
  ];
  const runtimeInstruction = renderTavernPromptSections(instructionSections);
  const requestContext = appendReferencesToPrompt(
    renderTavernPromptSections(contextSections),
    references,
  );

  return {
    runtimeInstruction,
    requestContext,
    fullPrompt: [
      runtimeInstruction,
      requestContext,
    ].filter(Boolean).join("\n\n"),
  };
};
