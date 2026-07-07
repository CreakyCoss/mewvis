import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import { formatTavernRuntimeMessagesForSummary } from "../../conversation";
import type { TavernStoryContextPackage } from "@/features/pages/taverns/tavern/adapters/story";
import { tavernMessagesToRuntimeMessages } from "../../prompt";
import { buildTavernStoryContextPackage } from "../../../adapters/story";
import {
  formatTavernVisibleMessagesForRequestContext,
  normalizeTavernMessagesForAudience,
} from "@/features/pages/taverns/room/message";
import type { TavernMessage } from "../../../types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";

export const SUGGESTION_COUNT = 3;
export const RECENT_MESSAGE_LIMIT = 12;

export const buildTavernUserReplySceneSections = ({
  room,
  characters,
  storyContext: inputStoryContext,
}: {
  room: TavernRoom;
  characters: TavernCharacter[];
  storyContext?: TavernStoryContextPackage;
}) => {
  const storyContext = inputStoryContext ?? buildTavernStoryContextPackage({ room, characters });
  const activeScene = storyContext.graph.activeScene;

  return [
    storyContext.story.outline.trim() || storyContext.story.goal.trim()
      ? `<story_arc>\n${[
          storyContext.story.outline.trim(),
          storyContext.story.goal.trim() ? `终局目标：${storyContext.story.goal.trim()}` : "",
        ]
          .filter(Boolean)
          .join("\n\n")}\n</story_arc>`
      : "<story_arc>（无）</story_arc>",
    "",
    `<room title="${storyContext.story.title}">`,
    activeScene?.scene ?? "",
    "</room>",
    "",
    activeScene?.plot.trim()
      ? `<scene_plot>\n${activeScene.plot.trim()}\n</scene_plot>`
      : "<scene_plot>（无）</scene_plot>",
    "",
    activeScene?.goal.trim()
      ? `<scene_goal>\n${activeScene.goal.trim()}\n</scene_goal>`
      : "<scene_goal>（无）</scene_goal>",
    "",
    activeScene?.direction.trim()
      ? `<scene_direction>\n${activeScene.direction.trim()}\n</scene_direction>`
      : "<scene_direction>（无）</scene_direction>",
    "",
    activeScene?.transition.trim()
      ? `<scene_transition>\n${activeScene.transition.trim()}\n</scene_transition>`
      : "<scene_transition>（无）</scene_transition>",
  ];
};

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
        userPersonaName: room.userPersonaName,
        audience: { type: "user_proxy" },
      }).slice(-RECENT_MESSAGE_LIMIT),
    ) || "（无）",
    "</public_visible_messages>",
  ];
};

export const formatPendingInteractionsForPrompt = (room: TavernRoom, characters: TavernCharacter[]) => {
  const characterById = new Map(characters.map((character) => [character.id, character]));
  const openInteractions = room.pendingInteractions.filter(
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
          : room.userPersonaName || "我";
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
