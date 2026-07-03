import { formatTavernRuntimeMessagesForSummary } from "../../conversation";
import {
  buildTavernSceneDriveGuidance,
  filterTavernFactEventsForAudience,
  formatTavernCharacterRelationships,
} from "../../../core";
import type { TavernStoryContextPackage } from "@/features/pages/tavern/adapters/story";
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
import {
  escapePromptXmlAttribute,
  escapePromptXmlText,
} from "../../prompt/shared/text";
import {
  buildTavernDirectorSecretMemoryContext,
  buildTavernSecretMemoryProtocol,
} from "../../prompt/shared/secret-policy";

const DIRECTOR_RECENT_MESSAGE_LIMIT = 10;

const limitDirectorContextText = (text: string, maxChars: number) => {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}...`;
};

const limitEscapedDirectorText = (text: string, maxChars: number) =>
  escapePromptXmlText(limitDirectorContextText(text, maxChars));

const formatDirectorCharacterMemory = (
  room: TavernRoom,
  characterId: string,
) => {
  const activeInstance = room.sceneInstances.find((instance) =>
    instance.id === room.activeSceneInstanceId
  ) ?? room.sceneInstances[0];
  const layers = activeInstance?.characterMemoryLayers?.[characterId];

  return [
    layers?.required?.trim() ?? "",
    layers?.public?.trim() ?? "",
    layers?.known?.trim() ?? "",
  ].filter(Boolean).join("\n\n");
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
  `id: ${escapePromptXmlText(character.id)}`,
  `name: ${escapePromptXmlText(character.name)}`,
  `description: ${escapePromptXmlText(character.description)}`,
  character.writingStyle ? `writingStyle: ${escapePromptXmlText(character.writingStyle)}` : "",
  character.replyStylePrompt ? `replyStylePrompt: ${escapePromptXmlText(character.replyStylePrompt)}` : "",
  character.goals ? `goals: ${escapePromptXmlText(character.goals)}` : "",
  (() => {
    const relationships = formatTavernCharacterRelationships({
      character,
      characters,
      userPersonaName: room.userPersonaName,
      relationshipOverrides: room.relationshipOverrides,
      statusSnapshot: room.statusSnapshot,
    });
    return relationships ? `relationships: ${escapePromptXmlText(relationships)}` : "";
  })(),
  formatDirectorCharacterMemory(room, character.id)
    ? `memory: ${escapePromptXmlText(formatDirectorCharacterMemory(room, character.id))}`
    : "",
].filter(Boolean).join("\n")).join("\n\n---\n\n");

export const buildTavernDirectorContextSections = ({
  room,
  storyContext,
  characters,
  messages,
  currentUserText,
  isSceneDriveTurn,
  sceneDriveDirective,
  runtimeMessages,
  lorebookText,
  storyGraphText,
  selectedTargetCharacterIds,
  directorProfileText,
  schedulingSignalsText,
  presentationProfile,
  promptBlocksText,
}: {
  room: TavernRoom;
  storyContext: TavernStoryContextPackage;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  currentUserText: string;
  isSceneDriveTurn: boolean;
  sceneDriveDirective: string;
  runtimeMessages: TavernRuntimeMessage[];
  lorebookText: string;
  storyGraphText: string;
  selectedTargetCharacterIds: string[];
  directorProfileText: string;
  schedulingSignalsText: string;
  presentationProfile: TavernPresentationProfile;
  promptBlocksText: string;
}) => {
  const selectedTargetCharacters = selectedTargetCharacterIds
    .map((characterId) => characters.find((character) => character.id === characterId))
    .filter((character): character is TavernCharacter => Boolean(character));
  const sceneDriveGuidance = buildTavernSceneDriveGuidance({
    room,
    messages,
    currentUserText,
    isSceneDriveTurn,
  });
  const directorOperationPolicy = room.settings.directorNarrativeControl;
  const activeScene = storyContext.graph.activeScene;

  return [
    `<presentation_profile id="${escapePromptXmlAttribute(presentationProfile.id)}" label="${escapePromptXmlAttribute(presentationProfile.label)}" render="${escapePromptXmlAttribute(presentationProfile.renderStyle)}" contract="${escapePromptXmlAttribute(presentationProfile.generationContract)}">`,
    escapePromptXmlText(presentationProfile.directorAddendum),
    "</presentation_profile>",
    "",
    buildTavernSecretMemoryProtocol("director"),
    "",
    promptBlocksText,
    storyContext.story.outline.trim() || storyContext.story.goal.trim()
      ? `<story_arc>\n${[
          escapePromptXmlText(storyContext.story.outline.trim()),
          storyContext.story.goal.trim() ? `终局目标：${escapePromptXmlText(storyContext.story.goal.trim())}` : "",
        ].filter(Boolean).join("\n\n")}\n</story_arc>`
      : "<story_arc>（无）</story_arc>",
    "",
    `<room title="${escapePromptXmlAttribute(storyContext.story.title)}">`,
    escapePromptXmlText(activeScene?.scene ?? ""),
    "</room>",
    "",
    activeScene?.plot.trim()
      ? `<scene_plot>\n${limitEscapedDirectorText(activeScene.plot, 3000)}\n</scene_plot>`
      : "<scene_plot>（无）</scene_plot>",
    "",
    activeScene?.goal.trim()
      ? `<scene_goal>\n${limitEscapedDirectorText(activeScene.goal, 2000)}\n</scene_goal>`
      : "<scene_goal>（无）</scene_goal>",
    "",
    "<scene_status instruction=\"public_scene_pressure; use_for_narrator_and_scheduling_without_solving_user_choices\">",
    JSON.stringify({
      location: activeScene?.status?.location ?? "",
      timeLabel: activeScene?.status?.timeLabel ?? "",
      weather: activeScene?.status?.weather ?? "",
      atmosphere: activeScene?.status?.atmosphere ?? "",
      scenePhase: activeScene?.status?.scenePhase ?? "",
      immediateThreat: activeScene?.status?.immediateThreat ?? "",
    }, null, 2),
    "</scene_status>",
    "",
    "<director_operation_policy instruction=\"application_level_director_controls; higher_priority_than_presentation_profile\">",
    JSON.stringify(directorOperationPolicy, null, 2),
    "</director_operation_policy>",
    "",
    "<scene_drive_guidance instruction=\"director_must_satisfy_required_moves_when_present; improve_event_interruptions_user_consequences_and_main_hooks_without_solving_user_choice\">",
    JSON.stringify(sceneDriveGuidance, null, 2),
    "</scene_drive_guidance>",
    "",
    activeScene?.direction.trim()
      ? `<scene_direction>\n${limitEscapedDirectorText(activeScene.direction, 3000)}\n</scene_direction>`
      : "<scene_direction>（无）</scene_direction>",
    "",
    activeScene?.transition.trim()
      ? `<scene_transition>\n${limitEscapedDirectorText(activeScene.transition, 2000)}\n</scene_transition>`
      : "<scene_transition>（无）</scene_transition>",
    "",
    "<story_graph>",
    storyGraphText || "（无）",
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
    buildTavernDirectorSecretMemoryContext({ room, characters }),
    "",
    "<selected_reply_targets instruction=\"targets_addressed_by_user_or_reply_option; may_speak_or_react_nonverbally_depending_on_relationship_and_context\">",
    selectedTargetCharacters.length > 0
      ? selectedTargetCharacters
          .map((character) => `id: ${character.id}\nname: ${character.name}`)
          .map(escapePromptXmlText)
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
    isSceneDriveTurn ? "（本轮无用户输入）" : escapePromptXmlText(currentUserText),
    "</current_user_input>",
    "",
    isSceneDriveTurn
      ? [
          "<scene_drive_directive instruction=\"optional_director_direction; not_user_speech; do_not_quote_as_dialogue\">",
          escapePromptXmlText(sceneDriveDirective),
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
