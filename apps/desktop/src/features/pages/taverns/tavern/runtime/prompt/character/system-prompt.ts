import {
  getTavernRoomCharacterMemoryLayers,
  getTavernRoomPromptOverrides,
  type TavernRoomRuntime,
} from "@/features/pages/taverns/room/model";
import { appendReferencesToPrompt } from "@/features/ai/components/context-tools";
import { getTavernPresentationContract } from "../../../presentation/presentation-contracts";
import { getTavernPresentationProfile } from "../../../prompt-registry/presentation-rules";
import { formatTavernPromptBlocksForTarget } from "../../../prompt-registry/text-blocks";
import type { TavernReferencedFile } from "../../../types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import {
  buildTavernStoryPromptSections,
  formatTavernStoryGraphContext,
  formatTavernStoryLorebookEntries,
  selectTavernStoryLorebookEntries,
} from "../context/story";
import { buildCharacterContextSections, formatCompactPresentCharacters } from "../layers/character-context";
import { buildPresentationProfileSection } from "../layers/presentation";
import { buildCharacterSystemContractSection } from "../layers/system-contract";
import { renderTavernPromptSections, type TavernPromptSection } from "../shared/sections";
import { buildTavernSecretMemoryProtocol } from "../shared/secret-policy";

type BuildTavernCharacterPromptInput = {
  room: TavernRoomRuntime;
  activeCharacter: TavernCharacter;
  characters: TavernCharacter[];
  references: TavernReferencedFile[];
  currentUserText: string;
  turnInstruction?: string;
};

type TavernCharacterPromptParts = {
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
  room: TavernRoomRuntime;
  publicContentTag: string;
}): TavernPromptSection => ({
  id: "prompt-blocks",
  layer: "tavern",
  content: [
    formatTavernPromptBlocksForTarget({
      prompt: room.presentation.prompt,
      target: "character",
      publicContentTag,
    }),
    formatTavernPromptBlocksForTarget({
      prompt: getTavernRoomPromptOverrides(room),
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

export const buildTavernCharacterPromptParts = ({
  room,
  activeCharacter,
  characters,
  references,
  currentUserText,
  turnInstruction,
}: BuildTavernCharacterPromptInput): TavernCharacterPromptParts => {
  const characterLayers = getTavernRoomCharacterMemoryLayers(room, activeCharacter.id);
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
      runtime: room,
      characters,
      activeCharacterId: activeCharacter.id,
      currentUserText,
    }),
    {
      maxEntries: 4,
      maxContentChars: 700,
    },
  );
  const storyGraphText = formatTavernStoryGraphContext(room, {
    maxEdges: 8,
    maxSummaryChars: 280,
  });
  const presentationProfile = getTavernPresentationProfile(room.presentation.profile?.profileId);
  const presentationContract = getTavernPresentationContract(presentationProfile);
  const publicContentTag = presentationContract.publicContentTag;
  const usesNarrativeBeat = presentationContract.characterMessageKind === "narrative_beat";
  const compactCharacters = formatCompactPresentCharacters({
    activeCharacter,
    runtime: room,
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
      runtime: room,
      lorebookText,
      storyGraphText,
    }),
    ...buildCharacterContextSections({
      activeCharacter,
      runtime: room,
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
