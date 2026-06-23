import {
  appendReferencesToPrompt,
} from "@/features/ai/components/context-tools";
import { getTavernPresentationContract } from "../../../presentation-contracts";
import { getTavernPresentationProfile } from "../../../prompt-registry/presentation-rules";
import {
  resolveTavernSystemNarrativePreset,
} from "../../../prompt-registry/system-narrative-styles";
import { resolveTavernPromptRuleStack } from "../../../prompt-registry/rule-layers/resolver";
import { getTavernPromptStylePreset } from "../../../prompt-styles";
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
import { buildSystemNarrativePresetSection } from "../layers/narrative-style";
import { buildPlatformStyleSection } from "../layers/platform-style";
import { buildPresentationProfileSection } from "../layers/presentation";
import { buildPromptRuleLayerSections } from "../layers/rule-layers";
import { buildPromptStyleSection } from "../layers/room-style";
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

const buildTurnInstructionSection = (turnInstruction?: string): TavernPromptSection => ({
  id: "turn-instruction",
  layer: "turn",
  tag: "turn_instruction",
  content: turnInstruction ?? "",
});

export const buildTavernSystemPrompt = ({
  room,
  activeCharacter,
  characters,
  references,
  currentUserText,
  turnInstruction,
}: BuildTavernSystemPromptInput) => {
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
  const immersiveDescriptionEnabled = room.settings.immersiveDescriptionEnabled !== false;
  const promptStyle = getTavernPromptStylePreset(room.promptStyleId);
  const presentationProfile = getTavernPresentationProfile(room.presentation?.profileId);
  const presentationContract = getTavernPresentationContract(presentationProfile);
  const systemNarrative = resolveTavernSystemNarrativePreset(
    room.settings.systemNarrativePreset,
  );
  const ruleStack = resolveTavernPromptRuleStack({
    compositionId: room.settings.platformStyleId,
    qualityRuleIds: room.settings.qualityRuleIds,
  });
  const publicContentTag = presentationContract.publicContentTag;
  const usesNarrativeBeat = presentationContract.characterMessageKind === "narrative_beat";
  const compactCharacters = formatCompactPresentCharacters({
    activeCharacter,
    room,
    characters,
  });

  const sections: TavernPromptSection[] = [
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
    buildSystemNarrativePresetSection({
      settings: systemNarrative.settings,
      preset: systemNarrative.preset,
      target: "character",
      publicContentTag,
      usesNarrativeBeat,
      immersiveDescriptionEnabled,
    }),
    buildPromptStyleSection({
      promptStyle,
      target: "character",
    }),
    buildPlatformStyleSection({
      platformStyle: ruleStack.platformStyle,
      target: "character",
    }),
    ...buildPromptRuleLayerSections({
      ruleGroups: ruleStack.ruleGroups,
      target: "character",
    }),
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
    buildTurnInstructionSection(turnInstruction),
  ];

  return appendReferencesToPrompt(
    renderTavernPromptSections(sections),
    references,
  );
};
