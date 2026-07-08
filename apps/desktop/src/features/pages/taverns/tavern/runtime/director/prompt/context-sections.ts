import type { TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import { formatTavernRuntimeMessagesForSummary } from "../../conversation/messages";
import { buildTavernSceneDriveGuidance } from "../../../core/director-scheduling";
import { formatTavernCharacterRelationships } from "../../../core/relationships";
import {
  formatTavernVisibleMessagesForRequestContext,
  normalizeTavernMessagesForAudience,
} from "@/features/pages/taverns/room/message/domain/visibility";
import type { TavernMessage } from "../../../types";
import type { TavernCharacter, TavernPresentationProfile } from "@/features/pages/taverns/manage/model";
import type { TavernRuntimeMessage } from "../../conversation/messages";
import { escapePromptXmlAttribute, escapePromptXmlText } from "../../prompt/shared/text";
import {
  buildTavernDirectorSecretMemoryContext,
  buildTavernSecretMemoryProtocol,
} from "../../prompt/shared/secret-policy";
import {
  selectTavernRuntimeActiveSceneFields,
  selectTavernRuntimeActiveSceneInstance,
} from "@/features/pages/taverns/room/runtime/accessors";

const DIRECTOR_RECENT_MESSAGE_LIMIT = 10;

const limitDirectorContextText = (text: string, maxChars: number) => {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}...`;
};

const limitEscapedDirectorText = (text: string, maxChars: number) =>
  escapePromptXmlText(limitDirectorContextText(text, maxChars));

const formatDirectorCharacterMemory = (runtime: TavernRoomRuntime, characterId: string) => {
  const activeInstance = selectTavernRuntimeActiveSceneInstance(runtime);
  const layers = activeInstance?.characterMemoryLayers?.[characterId];

  return [layers?.required?.trim() ?? "", layers?.public?.trim() ?? "", layers?.known?.trim() ?? ""]
    .filter(Boolean)
    .join("\n\n");
};

const buildTavernDirectorCharacterList = (runtime: TavernRoomRuntime, characters: TavernCharacter[]) => {
  const sceneFields = selectTavernRuntimeActiveSceneFields(runtime);
  return characters
    .map((character) =>
      [
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
            userPersonaName: runtime.user.personaName,
            relationshipOverrides: sceneFields.relationshipOverrides,
          });
          return relationships ? `relationships: ${escapePromptXmlText(relationships)}` : "";
        })(),
        formatDirectorCharacterMemory(runtime, character.id)
          ? `memory: ${escapePromptXmlText(formatDirectorCharacterMemory(runtime, character.id))}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n---\n\n");
};

export const buildTavernDirectorContextSections = ({
  room,
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
  room: TavernRoomRuntime;
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
  const sceneFields = selectTavernRuntimeActiveSceneFields(room);
  const selectedTargetCharacters = selectedTargetCharacterIds
    .map((characterId) => characters.find((character) => character.id === characterId))
    .filter((character): character is TavernCharacter => Boolean(character));
  const sceneDriveGuidance = buildTavernSceneDriveGuidance({
    settings: room.presentation.settings,
    scene: {
      sceneGoal: sceneFields.sceneGoal,
      scenePlot: sceneFields.scenePlot,
      storyGoal: room.story.goal,
      sceneStatus: sceneFields.sceneStatus,
    },
    messages,
    currentUserText,
    isSceneDriveTurn,
  });
  const directorOperationPolicy = room.presentation.settings.directorNarrativeControl;

  return [
    `<presentation_profile id="${escapePromptXmlAttribute(presentationProfile.id)}" label="${escapePromptXmlAttribute(presentationProfile.label)}" render="${escapePromptXmlAttribute(presentationProfile.renderStyle)}" contract="${escapePromptXmlAttribute(presentationProfile.generationContract)}">`,
    escapePromptXmlText(presentationProfile.directorAddendum),
    "</presentation_profile>",
    "",
    buildTavernSecretMemoryProtocol("director"),
    "",
    promptBlocksText,
    room.story.outline.trim() || room.story.goal.trim()
      ? `<story_arc>\n${[
          escapePromptXmlText(room.story.outline.trim()),
          room.story.goal.trim() ? `终局目标：${escapePromptXmlText(room.story.goal.trim())}` : "",
        ]
          .filter(Boolean)
          .join("\n\n")}\n</story_arc>`
      : "<story_arc>（无）</story_arc>",
    "",
    `<room title="${escapePromptXmlAttribute(room.identity.title)}">`,
    escapePromptXmlText(sceneFields.scene),
    "</room>",
    "",
    sceneFields.scenePlot.trim()
      ? `<scene_plot>\n${limitEscapedDirectorText(sceneFields.scenePlot, 3000)}\n</scene_plot>`
      : "<scene_plot>（无）</scene_plot>",
    "",
    sceneFields.sceneGoal.trim()
      ? `<scene_goal>\n${limitEscapedDirectorText(sceneFields.sceneGoal, 2000)}\n</scene_goal>`
      : "<scene_goal>（无）</scene_goal>",
    "",
    '<scene_status instruction="public_scene_pressure; use_for_narrator_and_scheduling_without_solving_user_choices">',
    JSON.stringify(
      {
        location: sceneFields.sceneStatus?.location ?? "",
        timeLabel: sceneFields.sceneStatus?.timeLabel ?? "",
        weather: sceneFields.sceneStatus?.weather ?? "",
        atmosphere: sceneFields.sceneStatus?.atmosphere ?? "",
        scenePhase: sceneFields.sceneStatus?.scenePhase ?? "",
        immediateThreat: sceneFields.sceneStatus?.immediateThreat ?? "",
      },
      null,
      2,
    ),
    "</scene_status>",
    "",
    '<director_operation_policy instruction="application_level_director_controls; higher_priority_than_presentation_profile">',
    JSON.stringify(directorOperationPolicy, null, 2),
    "</director_operation_policy>",
    "",
    '<scene_drive_guidance instruction="director_must_satisfy_required_moves_when_present; improve_event_interruptions_user_consequences_and_main_hooks_without_solving_user_choice">',
    JSON.stringify(sceneDriveGuidance, null, 2),
    "</scene_drive_guidance>",
    "",
    sceneFields.sceneDirection.trim()
      ? `<scene_direction>\n${limitEscapedDirectorText(sceneFields.sceneDirection, 3000)}\n</scene_direction>`
      : "<scene_direction>（无）</scene_direction>",
    "",
    sceneFields.sceneTransition.trim()
      ? `<scene_transition>\n${limitEscapedDirectorText(sceneFields.sceneTransition, 2000)}\n</scene_transition>`
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
    buildTavernDirectorSecretMemoryContext({ runtime: room, characters }),
    "",
    '<selected_reply_targets instruction="targets_addressed_by_user_or_reply_option; may_speak_or_react_nonverbally_depending_on_relationship_and_context">',
    selectedTargetCharacters.length > 0
      ? selectedTargetCharacters
          .map((character) => `id: ${character.id}\nname: ${character.name}`)
          .map(escapePromptXmlText)
          .join("\n\n---\n\n")
      : "（无）",
    "</selected_reply_targets>",
    "",
    '<director_profile instruction="stable_scheduling_profile; low_frequency; do_not_rewrite_in_this_turn">',
    directorProfileText,
    "</director_profile>",
    "",
    '<scheduling_signals instruction="dynamic_per_turn_recommendations; director_may_override_with_reason; do_not_leak_hidden_or_private_reasons">',
    schedulingSignalsText || "[]",
    "</scheduling_signals>",
    "",
    "<current_user_input>",
    isSceneDriveTurn ? "（本轮无用户输入）" : escapePromptXmlText(currentUserText),
    "</current_user_input>",
    "",
    isSceneDriveTurn
      ? [
          '<scene_drive_directive instruction="optional_director_direction; not_user_speech; do_not_quote_as_dialogue">',
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
        userPersonaName: room.user.personaName,
        audience: { type: "director" },
      }).slice(-DIRECTOR_RECENT_MESSAGE_LIMIT),
    ) || "（无）",
    "</public_visible_messages>",
  ].join("\n");
};
