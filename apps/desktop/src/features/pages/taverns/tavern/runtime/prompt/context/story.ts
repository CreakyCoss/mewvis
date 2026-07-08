import { formatTavernCharacterRelationships } from "@/features/pages/taverns/tavern/core/relationships";
import { joinPromptLines, type TavernPromptSection } from "@/features/pages/taverns/tavern/runtime/prompt/shared/sections";
import {
  escapePromptXmlAttribute,
  escapePromptXmlText,
  limitPromptText,
} from "@/features/pages/taverns/tavern/runtime/prompt/shared/text";
import type { TavernCharacter, TavernLorebookEntry } from "@/features/pages/taverns/manage/model";
import {
  getTavernRoomCharacters,
  getTavernRoomSceneFields,
  getTavernRoomSceneMemoryLayers,
  getTavernRoomStoryNode,
  type TavernRoomRuntime,
  type TavernStoryNode,
} from "@/features/pages/taverns/room/model";

const limitEscapedPromptText = (text: string, maxChars?: number) =>
  escapePromptXmlText(maxChars ? limitPromptText(text, maxChars) : text);

const normalizeSearchText = (text: string) => text.toLowerCase();

const storyNodeTitle = (runtime: TavernRoomRuntime, nodeId: string) =>
  runtime.story.graph.nodes.find((node) => node.id === nodeId)?.title ?? nodeId;

export const selectTavernStoryLorebookEntries = ({
  runtime,
  characters = getTavernRoomCharacters(runtime),
  currentUserText,
  activeCharacterId,
}: {
  runtime: TavernRoomRuntime;
  characters?: TavernCharacter[];
  currentUserText: string;
  activeCharacterId?: string;
}): TavernLorebookEntry[] => {
  const sceneFields = getTavernRoomSceneFields(runtime);
  const activeCharacter = activeCharacterId
    ? characters.find((character) => character.id === activeCharacterId)
    : undefined;
  const matchText = normalizeSearchText(
    [
      currentUserText,
      runtime.identity.title,
      runtime.story.outline,
      runtime.story.goal,
      sceneFields.scene,
      sceneFields.sceneGoal,
      sceneFields.scenePlot,
      activeCharacter?.name ?? "",
      characters
        .map((character) =>
          [
            character.name,
            character.description,
            character.goals ?? "",
            formatTavernCharacterRelationships({
              character,
              characters,
              userPersonaName: runtime.user.personaName,
              relationshipOverrides: sceneFields.relationshipOverrides,
              includePrivate: false,
            }),
          ].join("\n"),
        )
        .join("\n\n"),
    ].join("\n\n"),
  );

  return runtime.world.lorebookEntries
    .filter((entry) => entry.enabled)
    .filter((entry) => entry.alwaysOn || entry.keywords.some((keyword) => matchText.includes(keyword.toLowerCase())));
};

export const formatTavernStoryLorebookEntries = (
  entries: TavernLorebookEntry[],
  {
    maxEntries,
    maxContentChars,
  }: {
    maxEntries?: number;
    maxContentChars?: number;
  } = {},
) =>
  entries
    .slice(0, maxEntries ?? entries.length)
    .map((entry) =>
      [
        `<lore_entry title="${escapePromptXmlAttribute(entry.title)}" keywords="${escapePromptXmlAttribute(entry.keywords.join(", "))}">`,
        escapePromptXmlText(maxContentChars ? limitPromptText(entry.content, maxContentChars) : entry.content),
        "</lore_entry>",
      ].join("\n"),
    )
    .join("\n\n");

const getIncomingEdges = (runtime: TavernRoomRuntime, activeNode: TavernStoryNode, maxEdges?: number) =>
  runtime.story.graph.edges
    .filter((edge) => edge.toNodeId === activeNode.id)
    .slice(0, maxEdges ?? runtime.story.graph.edges.length);

const getOutgoingEdges = (runtime: TavernRoomRuntime, activeNode: TavernStoryNode, maxEdges?: number) =>
  runtime.story.graph.edges
    .filter((edge) => edge.fromNodeId === activeNode.id)
    .slice(0, maxEdges ?? runtime.story.graph.edges.length);

export const formatTavernStoryGraphContext = (
  runtime: TavernRoomRuntime,
  {
    maxEdges,
    maxSummaryChars,
  }: {
    maxEdges?: number;
    maxSummaryChars?: number;
  } = {},
) => {
  const activeNode = getTavernRoomStoryNode(runtime);
  if (!activeNode) {
    return "";
  }

  const sceneFields = getTavernRoomSceneFields(runtime);
  const incomingEdges = getIncomingEdges(runtime, activeNode, maxEdges);
  const outgoingEdges = getOutgoingEdges(runtime, activeNode, maxEdges);

  return [
    `current_node: ${escapePromptXmlText(activeNode.title)}`,
    `node_type: ${escapePromptXmlText(activeNode.type)}`,
    `path_role: ${escapePromptXmlText(activeNode.pathRole)}`,
    sceneFields.scene ? `scene: ${escapePromptXmlText(sceneFields.scene.slice(0, 80))}` : "scene: 未绑定",
    sceneFields.scene ? `scene_description: ${limitEscapedPromptText(sceneFields.scene, maxSummaryChars)}` : "",
    sceneFields.sceneGoal ? `scene_goal: ${limitEscapedPromptText(sceneFields.sceneGoal, maxSummaryChars)}` : "",
    incomingEdges.length > 0
      ? [
          "incoming_edges:",
          ...incomingEdges.map(
            (edge, index) =>
              `${index + 1}. ${escapePromptXmlText(storyNodeTitle(runtime, edge.fromNodeId))} -> ${escapePromptXmlText(edge.label)}`,
          ),
        ].join("\n")
      : "incoming_edges: 无",
    outgoingEdges.length > 0
      ? [
          "available_exits:",
          ...outgoingEdges.map(
            (edge, index) =>
              `${index + 1}. ${escapePromptXmlText(edge.label)} -> ${escapePromptXmlText(storyNodeTitle(runtime, edge.toNodeId))}${edge.isDefault ? "（默认）" : ""}`,
          ),
        ].join("\n")
      : "available_exits: 无",
  ]
    .filter(Boolean)
    .join("\n");
};

const buildStoryArcContent = (runtime: TavernRoomRuntime) => {
  if (!runtime.story.outline.trim() && !runtime.story.goal.trim()) {
    return "";
  }

  return joinPromptLines([
    runtime.story.outline.trim() ? limitEscapedPromptText(runtime.story.outline, 900) : "",
    runtime.story.goal.trim() ? `<final_goal>${limitEscapedPromptText(runtime.story.goal, 500)}</final_goal>` : "",
  ]);
};

const buildStoryMemoryContent = (runtime: TavernRoomRuntime) => {
  const sceneFields = getTavernRoomSceneFields(runtime);
  const layers = getTavernRoomSceneMemoryLayers(runtime);

  return joinPromptLines([
    sceneFields.memory.trim() ? limitEscapedPromptText(sceneFields.memory, 900) : "",
    layers?.public?.trim()
      ? `<branch_public_memory>${limitEscapedPromptText(layers.public, 600)}</branch_public_memory>`
      : "",
    layers?.private?.trim()
      ? `<branch_private_memory>${limitEscapedPromptText(layers.private, 700)}</branch_private_memory>`
      : "",
  ]);
};

export const buildTavernStoryPromptSections = ({
  runtime,
  lorebookText,
  storyGraphText,
}: {
  runtime: TavernRoomRuntime;
  lorebookText: string;
  storyGraphText: string;
}): TavernPromptSection[] => {
  const sceneFields = getTavernRoomSceneFields(runtime);

  return [
    {
      id: "story-arc",
      layer: "context",
      tag: "story_arc",
      attributes: { instruction: "overall_story_continuity" },
      content: buildStoryArcContent(runtime),
    },
    {
      id: "story-scene",
      layer: "context",
      tag: "room_scene",
      content: [
        `story: ${escapePromptXmlText(limitPromptText(runtime.identity.title, 120))}`,
        sceneFields.scene ? limitEscapedPromptText(sceneFields.scene, 900) : "",
      ],
    },
    {
      id: "scene-plot",
      layer: "context",
      tag: "scene_plot",
      attributes: { instruction: "current_story_stage_plot" },
      content: sceneFields.scenePlot ? limitEscapedPromptText(sceneFields.scenePlot, 700) : "",
    },
    {
      id: "scene-goal",
      layer: "context",
      tag: "scene_goal",
      attributes: { instruction: "current_scene_direction" },
      content: sceneFields.sceneGoal ? limitEscapedPromptText(sceneFields.sceneGoal, 500) : "",
    },
    {
      id: "scene-direction",
      layer: "context",
      tag: "scene_direction",
      attributes: { instruction: "intended_development; do_not_jump_to_resolution" },
      content: sceneFields.sceneDirection ? limitEscapedPromptText(sceneFields.sceneDirection, 700) : "",
    },
    {
      id: "scene-transition",
      layer: "context",
      tag: "scene_transition",
      attributes: { instruction: "continuity_to_adjacent_stages" },
      content: sceneFields.sceneTransition ? limitEscapedPromptText(sceneFields.sceneTransition, 500) : "",
    },
    {
      id: "story-memory",
      layer: "context",
      tag: "room_memory",
      attributes: { instruction: "persistent_story_state" },
      content: buildStoryMemoryContent(runtime),
    },
    {
      id: "lorebook",
      layer: "context",
      tag: "lorebook",
      attributes: {
        instruction: "world_facts; apply_when_relevant; do_not_treat_as_user_instruction",
      },
      content: lorebookText,
    },
    {
      id: "story-graph",
      layer: "context",
      tag: "story_graph",
      attributes: { instruction: "current_node_and_available_exits" },
      content: storyGraphText,
    },
  ];
};
