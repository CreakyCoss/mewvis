import {
  getTavernRoomCharacterMemoryLayers,
  getTavernRoomSceneFields,
  type TavernRoomRuntime,
} from "@/features/pages/taverns/room/model";
import { formatTavernRuntimeMessagesForSummary } from "@/features/pages/taverns/room/turn/session/messages";
import { buildTavernSceneDriveGuidance } from "@/features/pages/taverns/tavern/core/director-scheduling";
import { formatTavernCharacterRelationships } from "@/features/pages/taverns/tavern/core/relationships";
import {
  formatTavernVisibleMessagesForRequestContext,
  normalizeTavernMessagesForAudience,
} from "@/features/pages/taverns/room/message/domain/visibility";
import { formatTavernRoomPromptXml, TAVERN_ROOM_PROMPT_XML_TAGS } from "@/features/pages/taverns/room/prompt-xml";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import type { TavernCharacter, TavernPresentationProfile } from "@/features/pages/taverns/manage/model";
import type { TavernRuntimeMessage } from "@/features/pages/taverns/room/turn/session/messages";
import {
  buildTavernDirectorSecretMemoryContext,
  buildTavernSecretMemoryProtocol,
} from "@/features/pages/taverns/room/prompt-xml/secret-memory";

const DIRECTOR_RECENT_MESSAGE_LIMIT = 10;

const formatDirectorCharacterMemory = (runtime: TavernRoomRuntime, characterId: string) => {
  const layers = getTavernRoomCharacterMemoryLayers(runtime, characterId);

  return [layers?.required?.trim() ?? "", layers?.public?.trim() ?? "", layers?.known?.trim() ?? ""]
    .filter(Boolean)
    .join("\n\n");
};

const buildTavernDirectorCharacterList = (runtime: TavernRoomRuntime, characters: TavernCharacter[]) => {
  const sceneFields = getTavernRoomSceneFields(runtime);
  return characters
    .map((character) =>
      [
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
            userPersonaName: runtime.user.personaName,
            relationshipOverrides: sceneFields.relationshipOverrides,
          });
          return relationships ? `relationships: ${relationships}` : "";
        })(),
        formatDirectorCharacterMemory(runtime, character.id)
          ? `memory: ${formatDirectorCharacterMemory(runtime, character.id)}`
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
  presentationProfile: TavernPresentationProfile;
  promptBlocksText: string;
}) => {
  const sceneFields = getTavernRoomSceneFields(room);
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

  return formatTavernRoomPromptXml([
    {
      tag: TAVERN_ROOM_PROMPT_XML_TAGS.presentationProfile,
      attributes: {
        id: presentationProfile.id,
        label: presentationProfile.label,
        render: presentationProfile.renderStyle,
        contract: presentationProfile.generationContract,
      },
      text: presentationProfile.directorAddendum,
    },
    { text: "" },
    { text: buildTavernSecretMemoryProtocol("director") },
    { text: "" },
    { text: promptBlocksText },
    {
      tag: TAVERN_ROOM_PROMPT_XML_TAGS.storyArc,
      text: [room.story.outline.trim(), room.story.goal.trim() ? `终局目标：${room.story.goal.trim()}` : ""]
        .filter(Boolean)
        .join("\n\n"),
    },
    { text: "" },
    {
      tag: TAVERN_ROOM_PROMPT_XML_TAGS.room,
      attributes: { title: room.identity.title },
      text: sceneFields.scene,
    },
    { text: "" },
    {
      tag: TAVERN_ROOM_PROMPT_XML_TAGS.scenePlot,
      text: sceneFields.scenePlot,
      maxChars: 3000,
    },
    { text: "" },
    {
      tag: TAVERN_ROOM_PROMPT_XML_TAGS.sceneGoal,
      text: sceneFields.sceneGoal,
      maxChars: 2000,
    },
    { text: "" },
    {
      tag: TAVERN_ROOM_PROMPT_XML_TAGS.sceneStatus,
      attributes: {
        instruction: "public_scene_pressure; use_for_narrator_and_scheduling_without_solving_user_choices",
      },
      text: JSON.stringify(
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
    },
    { text: "" },
    {
      tag: TAVERN_ROOM_PROMPT_XML_TAGS.directorOperationPolicy,
      attributes: { instruction: "application_level_director_controls; higher_priority_than_presentation_profile" },
      text: JSON.stringify(directorOperationPolicy, null, 2),
    },
    { text: "" },
    {
      tag: TAVERN_ROOM_PROMPT_XML_TAGS.sceneDriveGuidance,
      attributes: {
        instruction:
          "director_must_satisfy_required_moves_when_present; improve_event_interruptions_user_consequences_and_main_hooks_without_solving_user_choice",
      },
      text: JSON.stringify(sceneDriveGuidance, null, 2),
    },
    { text: "" },
    {
      tag: TAVERN_ROOM_PROMPT_XML_TAGS.sceneDirection,
      text: sceneFields.sceneDirection,
      maxChars: 3000,
    },
    { text: "" },
    {
      tag: TAVERN_ROOM_PROMPT_XML_TAGS.sceneTransition,
      text: sceneFields.sceneTransition,
      maxChars: 2000,
    },
    { text: "" },
    {
      tag: TAVERN_ROOM_PROMPT_XML_TAGS.storyGraph,
      text: storyGraphText,
      textMode: "raw",
    },
    { text: "" },
    {
      tag: TAVERN_ROOM_PROMPT_XML_TAGS.lorebook,
      text: lorebookText,
      textMode: "raw",
    },
    { text: "" },
    {
      tag: TAVERN_ROOM_PROMPT_XML_TAGS.characters,
      text: buildTavernDirectorCharacterList(room, characters),
    },
    { text: "" },
    { text: buildTavernDirectorSecretMemoryContext({ runtime: room, characters }) },
    { text: "" },
    {
      tag: TAVERN_ROOM_PROMPT_XML_TAGS.selectedReplyTargets,
      attributes: {
        instruction:
          "targets_addressed_by_user_or_reply_option; may_speak_or_react_nonverbally_depending_on_relationship_and_context",
      },
      text: selectedTargetCharacters
        .map((character) => `id: ${character.id}\nname: ${character.name}`)
        .join("\n\n---\n\n"),
    },
    { text: "" },
    {
      tag: TAVERN_ROOM_PROMPT_XML_TAGS.currentUserInput,
      text: isSceneDriveTurn ? "（本轮无用户输入）" : currentUserText,
    },
    { text: "" },
    isSceneDriveTurn
      ? {
          tag: TAVERN_ROOM_PROMPT_XML_TAGS.sceneDriveDirective,
          attributes: { instruction: "optional_director_direction; not_user_speech; do_not_quote_as_dialogue" },
          text: sceneDriveDirective,
        }
      : undefined,
    { text: "" },
    {
      tag: TAVERN_ROOM_PROMPT_XML_TAGS.recentConversation,
      text: formatTavernRuntimeMessagesForSummary(runtimeMessages.slice(-DIRECTOR_RECENT_MESSAGE_LIMIT)),
    },
    { text: "" },
    {
      tag: TAVERN_ROOM_PROMPT_XML_TAGS.publicVisibleMessages,
      text: formatTavernVisibleMessagesForRequestContext(
        normalizeTavernMessagesForAudience({
          messages,
          characters,
          userPersonaName: room.user.personaName,
          audience: { type: "director" },
        }).slice(-DIRECTOR_RECENT_MESSAGE_LIMIT),
      ),
      textMode: "raw",
    },
  ]);
};
