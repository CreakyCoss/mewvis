import type { TavernActiveRoomView as TavernRoom } from "@/features/pages/taverns/room/model";
import { appendReferencesToPrompt } from "@/features/ai/components/context-tools";
import type { TavernStoryContextPackage } from "@/features/pages/taverns/room/story-context/context-package";
import { getTavernPresentationContract } from "../../../presentation/presentation-contracts";
import { getTavernPresentationProfile } from "../../../prompt-registry/presentation-rules";
import {
  formatTavernInteractionQualityRulesForTarget,
  formatTavernPromptBlocksForTarget,
} from "../../../prompt-registry/text-blocks";
import type { TavernReferencedFile } from "../../../types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import { buildTavernStoryContextPackage } from "@/features/pages/taverns/room/story-context/context-package";
import {
  buildTavernStoryPromptSections,
  formatTavernStoryGraphContext,
  formatTavernStoryLorebookEntries,
  selectTavernStoryLorebookEntries,
} from "@/features/pages/taverns/room/story-context/prompt-sections";
import { buildCharacterContextSections, formatCompactPresentCharacters } from "../layers/character-context";
import { buildPresentationProfileSection } from "../layers/presentation";
import { buildCharacterSystemContractSection } from "../layers/system-contract";
import { renderTavernPromptSections, type TavernPromptSection } from "../shared/sections";
import { buildTavernSecretMemoryProtocol } from "../shared/secret-policy";

export type BuildTavernSystemPromptInput = {
  room: TavernRoom;
  activeCharacter: TavernCharacter;
  characters: TavernCharacter[];
  references: TavernReferencedFile[];
  currentUserText: string;
  turnInstruction?: string;
  storyContext?: TavernStoryContextPackage;
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
    formatTavernPromptBlocksForTarget({
      prompt: room.sceneInstances.find((instance) => instance.id === room.activeSceneInstanceId)?.promptOverrides,
      target: "character",
      publicContentTag,
    }),
    formatTavernInteractionQualityRulesForTarget({
      qualityRuleIds: room.settings.interactionQualityRuleIds,
      target: "character",
      publicContentTag,
    }),
  ]
    .filter(Boolean)
    .join("\n\n"),
});

const buildSecretMemoryProtocolSection = (): TavernPromptSection => ({
  id: "secret-memory-protocol",
  layer: "system",
  content: buildTavernSecretMemoryProtocol("character"),
});

export const buildTavernSystemPrompt = ({
  room,
  activeCharacter,
  characters,
  references,
  currentUserText,
  turnInstruction,
  storyContext,
}: BuildTavernSystemPromptInput) =>
  buildTavernCharacterPromptParts({
    room,
    activeCharacter,
    characters,
    references,
    currentUserText,
    turnInstruction,
    storyContext,
  }).fullPrompt;

export const buildTavernCharacterPromptParts = ({
  room,
  activeCharacter,
  characters,
  references,
  currentUserText,
  turnInstruction,
  storyContext: inputStoryContext,
}: BuildTavernSystemPromptInput): TavernCharacterPromptParts => {
  const storyContext = inputStoryContext ?? buildTavernStoryContextPackage({ room, characters });
  const matchedStoryCharacter = storyContext.characters.find((character) => character.id === activeCharacter.id);
  const characterLayers = matchedStoryCharacter?.memory;
  const characterMemory = [
    characterLayers?.required?.trim() ?? "",
    characterLayers?.public?.trim() ?? "",
    characterLayers?.known?.trim() ?? "",
    characterLayers?.privateSelf?.trim() ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const lorebookText = formatTavernStoryLorebookEntries(
    selectTavernStoryLorebookEntries({
      storyContext,
      activeCharacterId: activeCharacter.id,
      currentUserText,
    }),
    {
      maxEntries: 4,
      maxContentChars: 700,
    },
  );
  const storyGraphText = formatTavernStoryGraphContext(storyContext, {
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
    buildSecretMemoryProtocolSection(),
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
    ...buildTavernStoryPromptSections({
      storyContext,
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
  const requestContext = appendReferencesToPrompt(renderTavernPromptSections(contextSections), references);

  return {
    runtimeInstruction,
    requestContext,
    fullPrompt: [runtimeInstruction, requestContext].filter(Boolean).join("\n\n"),
  };
};
