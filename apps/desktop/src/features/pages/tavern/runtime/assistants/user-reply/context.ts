import { formatTavernRuntimeMessagesForSummary } from "../../conversation";
import { tavernMessagesToRuntimeMessages } from "../../prompt";
import {
  formatTavernVisibleMessagesForRequestContext,
  normalizeTavernMessagesForAudience,
} from "../../../message";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../../../types";

export const SUGGESTION_COUNT = 3;
export const RECENT_MESSAGE_LIMIT = 12;

export const buildTavernUserReplySceneSections = (room: TavernRoom) => [
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
];

export const buildTavernUserReplyConversationSections = ({
  room,
  characters,
  messages,
}: {
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
}) => {
  const runtimeMessages = tavernMessagesToRuntimeMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
  });
  const recentConversation = formatTavernRuntimeMessagesForSummary(
    runtimeMessages.slice(-RECENT_MESSAGE_LIMIT),
  );

  return [
    "<recent_conversation>",
    recentConversation || "（无）",
    "</recent_conversation>",
    "",
    "<public_visible_messages>",
    formatTavernVisibleMessagesForRequestContext(
      normalizeTavernMessagesForAudience({
        messages,
        characters,
        userPersonaName: room.userPersonaName,
        audience: { type: "user_proxy" },
      }).slice(-RECENT_MESSAGE_LIMIT),
    ) || "（无）",
    "</public_visible_messages>",
  ];
};

export const formatPendingInteractionsForPrompt = (
  room: TavernRoom,
  characters: TavernCharacter[],
) => {
  const characterById = new Map(characters.map((character) => [character.id, character]));
  const openInteractions = room.pendingInteractions.filter((interaction) =>
    interaction.status === "open" && interaction.requiresResponse
  );

  if (openInteractions.length === 0) {
    return "（无）";
  }

  return openInteractions.map((interaction) => {
    const source = interaction.source.type === "character"
      ? characterById.get(interaction.source.characterId ?? "")?.name ?? "角色"
      : room.userPersonaName || "我";
    const target = interaction.target.type === "character"
      ? (interaction.target.characterIds ?? [])
          .map((characterId) => characterById.get(characterId)?.name ?? characterId)
          .join("、")
      : interaction.target.type;

    return [
      `id: ${interaction.id}`,
      `source: ${source}`,
      `target: ${target || interaction.target.type}`,
      `kind: ${interaction.kind}`,
      `text: ${interaction.text}`,
    ].join("\n");
  }).join("\n\n---\n\n");
};
