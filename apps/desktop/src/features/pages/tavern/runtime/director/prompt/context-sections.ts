import { formatTavernRuntimeMessagesForSummary } from "../../conversation";
import { formatTavernStoryGraphContext } from "../../prompt";
import {
  filterTavernFactEventsForAudience,
  formatTavernCharacterRelationships,
} from "../../../core";
import {
  formatTavernVisibleMessagesForRequestContext,
  normalizeTavernMessagesForAudience,
} from "../../../message";
import type {
  TavernCharacter,
  TavernMessage,
  TavernPresentationProfile,
  TavernRoom,
} from "../../../types";
import type { TavernRuntimeMessage } from "../../conversation";

const DIRECTOR_RECENT_MESSAGE_LIMIT = 10;

const limitDirectorContextText = (text: string, maxChars: number) => {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}...`;
};

const formatDirectorProgressContext = (room: TavernRoom) => JSON.stringify({
  statusSnapshot: room.statusSnapshot,
  tasks: room.taskDefinitions.map((task) => ({
    id: task.id,
    title: task.title,
    owner: task.owner,
    participants: task.participants ?? [],
    visibility: task.visibility,
    lifecycle: task.lifecycle,
    currentStatus: room.taskSnapshot[task.id]?.status ?? task.lifecycle.initialStatus,
  })),
  outcomes: room.sceneOutcomes.map((outcome) => ({
    id: outcome.id,
    label: outcome.label,
    condition: outcome.condition,
    winner: outcome.winner ?? [],
    loser: outcome.loser ?? [],
    priority: outcome.priority,
  })),
  recentFacts: filterTavernFactEventsForAudience({
    factEvents: room.factEvents,
    room,
    audience: { type: "director" },
  }).slice(-16).map((fact) => ({
    id: fact.id,
    type: fact.type,
    actor: fact.actor,
    target: fact.target,
    evidence: fact.evidence,
    visibility: fact.visibility,
    visibleToUser: fact.visibleToUser,
    visibleToCharacterIds: fact.visibleToCharacterIds ?? [],
    visibleToFactionIds: fact.visibleToFactionIds ?? [],
  })),
}, null, 2);

const buildTavernDirectorCharacterList = (
  room: TavernRoom,
  characters: TavernCharacter[],
) => characters.map((character) => [
  `id: ${character.id}`,
  `name: ${character.name}`,
  `description: ${character.description}`,
  character.writingStyle ? `writingStyle: ${character.writingStyle}` : "",
  character.replyStylePrompt ? `replyStylePrompt: ${character.replyStylePrompt}` : "",
  character.goals ? `goals: ${character.goals}` : "",
  (() => {
    const relationships = formatTavernCharacterRelationships({
      character,
      characters,
      userPersonaName: room.userPersonaName,
      relationshipOverrides: room.relationshipOverrides,
      statusSnapshot: room.statusSnapshot,
    });
    return relationships ? `relationships: ${relationships}` : "";
  })(),
  room.characterMemories[character.id]?.trim()
    ? `memory: ${room.characterMemories[character.id]?.trim()}`
    : "",
].filter(Boolean).join("\n")).join("\n\n---\n\n");

export const buildTavernDirectorContextSections = ({
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
  promptBlocksText,
}: {
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  currentUserText: string;
  isSceneDriveTurn: boolean;
  sceneDriveDirective: string;
  runtimeMessages: TavernRuntimeMessage[];
  lorebookText: string;
  selectedTargetCharacterIds: string[];
  directorProfileText: string;
  schedulingSignalsText: string;
  presentationProfile: TavernPresentationProfile;
  promptBlocksText: string;
}) => {
  const selectedTargetCharacters = selectedTargetCharacterIds
    .map((characterId) => characters.find((character) => character.id === characterId))
    .filter((character): character is TavernCharacter => Boolean(character));

  return [
    `<presentation_profile id="${presentationProfile.id}" label="${presentationProfile.label}" render="${presentationProfile.renderStyle}" contract="${presentationProfile.generationContract}">`,
    presentationProfile.directorAddendum,
    "</presentation_profile>",
    "",
    promptBlocksText,
    room.storyOutline.trim() || room.storyGoal.trim()
      ? `<story_arc>\n${[
          room.storyOutline.trim(),
          room.storyGoal.trim() ? `终局目标：${room.storyGoal.trim()}` : "",
        ].filter(Boolean).join("\n\n")}\n</story_arc>`
      : "<story_arc>（无）</story_arc>",
    "",
    `<room title="${room.title}">`,
    room.scene,
    "</room>",
    "",
    room.scenePlot.trim()
      ? `<scene_plot>\n${room.scenePlot.trim()}\n</scene_plot>`
      : "<scene_plot>（无）</scene_plot>",
    "",
    room.sceneGoal.trim()
      ? `<scene_goal>\n${room.sceneGoal.trim()}\n</scene_goal>`
      : "<scene_goal>（无）</scene_goal>",
    "",
    room.sceneDirection.trim()
      ? `<scene_direction>\n${room.sceneDirection.trim()}\n</scene_direction>`
      : "<scene_direction>（无）</scene_direction>",
    "",
    room.sceneTransition.trim()
      ? `<scene_transition>\n${room.sceneTransition.trim()}\n</scene_transition>`
      : "<scene_transition>（无）</scene_transition>",
    "",
    "<story_graph>",
    formatTavernStoryGraphContext(room) || "（无）",
    "</story_graph>",
    "",
    "<lorebook>",
    lorebookText || "（无）",
    "</lorebook>",
    "",
    "<characters>",
    buildTavernDirectorCharacterList(room, characters),
    "</characters>",
    "",
    "<selected_reply_targets instruction=\"targets_addressed_by_user_or_reply_option; may_speak_or_react_nonverbally_depending_on_relationship_and_context\">",
    selectedTargetCharacters.length > 0
      ? selectedTargetCharacters
          .map((character) => `id: ${character.id}\nname: ${character.name}`)
          .join("\n\n---\n\n")
      : "（无）",
    "</selected_reply_targets>",
    "",
    "<director_profile instruction=\"stable_scheduling_profile; low_frequency; do_not_rewrite_in_this_turn\">",
    directorProfileText,
    "</director_profile>",
    "",
    "<scheduling_signals instruction=\"dynamic_per_turn_recommendations; director_may_override_with_reason; do_not_leak_hidden_or_private_reasons\">",
    schedulingSignalsText || "[]",
    "</scheduling_signals>",
    "",
    "<progress_context instruction=\"director_only; use_for_scheduling_motivation_without_leaking_hidden_facts\">",
    limitDirectorContextText(formatDirectorProgressContext(room), 6000),
    "</progress_context>",
    "",
    "<current_user_input>",
    isSceneDriveTurn ? "（本轮无用户输入）" : currentUserText,
    "</current_user_input>",
    "",
    isSceneDriveTurn
      ? [
          "<scene_drive_directive instruction=\"optional_director_direction; not_user_speech; do_not_quote_as_dialogue\">",
          sceneDriveDirective,
          "</scene_drive_directive>",
          "",
        ].join("\n")
      : "",
    "<recent_conversation>",
    formatTavernRuntimeMessagesForSummary(runtimeMessages.slice(-DIRECTOR_RECENT_MESSAGE_LIMIT)),
    "</recent_conversation>",
    "",
    "<public_visible_messages>",
    formatTavernVisibleMessagesForRequestContext(
      normalizeTavernMessagesForAudience({
        messages,
        characters,
        userPersonaName: room.userPersonaName,
        audience: { type: "director" },
      }).slice(-DIRECTOR_RECENT_MESSAGE_LIMIT),
    ) || "（无）",
    "</public_visible_messages>",
  ].join("\n");
};
