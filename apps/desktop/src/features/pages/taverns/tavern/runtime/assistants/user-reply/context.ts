import type { TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import { formatTavernRuntimeMessagesForSummary } from "../../conversation/messages";
import { tavernMessagesToRuntimeMessages } from "../../prompt/context/history";
import {
  formatTavernVisibleMessagesForRequestContext,
  normalizeTavernMessagesForAudience,
} from "@/features/pages/taverns/room/message/domain/visibility";
import type { TavernMessage } from "../../../types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import { selectTavernRuntimeActiveSceneFields } from "@/features/pages/taverns/room/runtime/accessors";

export const SUGGESTION_COUNT = 3;
export const RECENT_MESSAGE_LIMIT = 12;

export const buildTavernUserReplySceneSections = ({
  room,
}: {
  room: TavernRoomRuntime;
  characters: TavernCharacter[];
}) => {
  const sceneFields = selectTavernRuntimeActiveSceneFields(room);

  return [
    room.story.outline.trim() || room.story.goal.trim()
      ? `<story_arc>\n${[room.story.outline.trim(), room.story.goal.trim() ? `终局目标：${room.story.goal.trim()}` : ""]
          .filter(Boolean)
          .join("\n\n")}\n</story_arc>`
      : "<story_arc>（无）</story_arc>",
    "",
    `<room title="${room.identity.title}">`,
    sceneFields.scene,
    "</room>",
    "",
    sceneFields.scenePlot.trim()
      ? `<scene_plot>\n${sceneFields.scenePlot.trim()}\n</scene_plot>`
      : "<scene_plot>（无）</scene_plot>",
    "",
    sceneFields.sceneGoal.trim()
      ? `<scene_goal>\n${sceneFields.sceneGoal.trim()}\n</scene_goal>`
      : "<scene_goal>（无）</scene_goal>",
    "",
    sceneFields.sceneDirection.trim()
      ? `<scene_direction>\n${sceneFields.sceneDirection.trim()}\n</scene_direction>`
      : "<scene_direction>（无）</scene_direction>",
    "",
    sceneFields.sceneTransition.trim()
      ? `<scene_transition>\n${sceneFields.sceneTransition.trim()}\n</scene_transition>`
      : "<scene_transition>（无）</scene_transition>",
  ];
};

export const buildTavernUserReplyConversationSections = ({
  room,
  characters,
  messages,
}: {
  room: TavernRoomRuntime;
  characters: TavernCharacter[];
  messages: TavernMessage[];
}) => {
  const runtimeMessages = tavernMessagesToRuntimeMessages({
    messages,
    characters,
    userPersonaName: room.user.personaName,
  });
  const recentConversation = formatTavernRuntimeMessagesForSummary(runtimeMessages.slice(-RECENT_MESSAGE_LIMIT));

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
        userPersonaName: room.user.personaName,
        audience: { type: "user_proxy" },
      }).slice(-RECENT_MESSAGE_LIMIT),
    ) || "（无）",
    "</public_visible_messages>",
  ];
};

export const formatPendingInteractionsForPrompt = (room: TavernRoomRuntime, characters: TavernCharacter[]) => {
  const characterById = new Map(characters.map((character) => [character.id, character]));
  const openInteractions = selectTavernRuntimeActiveSceneFields(room).pendingInteractions.filter(
    (interaction) => interaction.status === "open" && interaction.requiresResponse,
  );

  if (openInteractions.length === 0) {
    return "（无）";
  }

  return openInteractions
    .map((interaction) => {
      const source =
        interaction.source.type === "character"
          ? (characterById.get(interaction.source.characterId ?? "")?.name ?? "角色")
          : room.user.personaName || "我";
      const target =
        interaction.target.type === "character"
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
    })
    .join("\n\n---\n\n");
};
