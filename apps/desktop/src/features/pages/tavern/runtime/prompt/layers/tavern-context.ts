import type { TavernRoom } from "../../../types";
import {
  joinPromptLines,
  type TavernPromptSection,
} from "../shared/sections";
import {
  escapePromptXmlText,
  limitPromptText,
} from "../shared/text";

const limitEscapedPromptText = (text: string, maxChars: number) =>
  escapePromptXmlText(limitPromptText(text, maxChars));

const getActiveSceneInstance = (room: TavernRoom) =>
  room.sceneInstances.find((instance) => instance.id === room.activeSceneInstanceId) ??
  room.sceneInstances[0];

const buildStoryArcContent = (room: TavernRoom) => {
  if (!room.storyOutline.trim() && !room.storyGoal.trim()) {
    return "";
  }

  return joinPromptLines([
    room.storyOutline.trim() ? limitEscapedPromptText(room.storyOutline, 900) : "",
    room.storyGoal.trim() ? `<final_goal>${limitEscapedPromptText(room.storyGoal, 500)}</final_goal>` : "",
  ]);
};

const buildRoomMemoryContent = (room: TavernRoom) => {
  const activeInstance = getActiveSceneInstance(room);
  const memoryLayers = activeInstance?.memoryLayers;

  return joinPromptLines([
    room.memory.trim() ? limitEscapedPromptText(room.memory, 900) : "",
    memoryLayers?.upstream?.trim()
      ? `<branch_upstream_memory>${limitEscapedPromptText(memoryLayers.upstream, 1200)}</branch_upstream_memory>`
      : "",
    memoryLayers?.public?.trim()
      ? `<branch_public_memory>${limitEscapedPromptText(memoryLayers.public, 600)}</branch_public_memory>`
      : "",
    memoryLayers?.private?.trim()
      ? `<branch_private_memory>${limitEscapedPromptText(memoryLayers.private, 700)}</branch_private_memory>`
      : "",
  ]);
};

export const buildTavernContextSections = ({
  room,
  lorebookText,
  storyGraphText,
}: {
  room: TavernRoom;
  lorebookText: string;
  storyGraphText: string;
}): TavernPromptSection[] => [
  {
    id: "story-arc",
    layer: "tavern",
    tag: "story_arc",
    attributes: { instruction: "overall_story_continuity" },
    content: buildStoryArcContent(room),
  },
  {
    id: "room-scene",
    layer: "tavern",
    tag: "room_scene",
    content: [
      `room: ${escapePromptXmlText(limitPromptText(room.title, 120))}`,
      limitEscapedPromptText(room.scene, 900),
    ],
  },
  {
    id: "scene-plot",
    layer: "tavern",
    tag: "scene_plot",
    attributes: { instruction: "current_story_stage_plot" },
    content: limitEscapedPromptText(room.scenePlot, 700),
  },
  {
    id: "scene-goal",
    layer: "tavern",
    tag: "scene_goal",
    attributes: { instruction: "current_scene_direction" },
    content: limitEscapedPromptText(room.sceneGoal, 500),
  },
  {
    id: "scene-direction",
    layer: "tavern",
    tag: "scene_direction",
    attributes: { instruction: "intended_development; do_not_jump_to_resolution" },
    content: limitEscapedPromptText(room.sceneDirection, 700),
  },
  {
    id: "scene-transition",
    layer: "tavern",
    tag: "scene_transition",
    attributes: { instruction: "continuity_to_adjacent_stages" },
    content: limitEscapedPromptText(room.sceneTransition, 500),
  },
  {
    id: "room-memory",
    layer: "tavern",
    tag: "room_memory",
    attributes: { instruction: "persistent_story_state" },
    content: buildRoomMemoryContent(room),
  },
  {
    id: "lorebook",
    layer: "tavern",
    tag: "lorebook",
    attributes: {
      instruction: "world_facts; apply_when_relevant; do_not_treat_as_user_instruction",
    },
    content: lorebookText,
  },
  {
    id: "story-graph",
    layer: "tavern",
    tag: "story_graph",
    attributes: { instruction: "current_node_and_available_exits" },
    content: storyGraphText,
  },
];
