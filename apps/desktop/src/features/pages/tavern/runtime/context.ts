import {
  countTextTokens,
  formatReferencesForPrompt,
  type MemoryBackedRuntimeContextStats,
  prepareMemoryBackedRuntimeContext,
  resolveAppContextWindow,
} from "@/features/ai/runtime";
import type { RuntimeModelInput } from "@/ai/runtime-protocol";
import {
  requireRuntimeModelInput as requireLlmRuntimeModelInput,
  type RuntimeModelOption,
} from "@/features/pages/settings/llm/store";
import { runSharedConversationSummary } from "@/features/ai/runtime";
import type {
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
} from "../types";
import {
  formatTavernLorebookEntries,
  formatTavernTimelineEvents,
  TAVERN_REFERENCE_PROMPT_LIMITS,
  tavernMessagesToRuntimeMessages,
} from "./prompt";
import type { TavernReplyModel } from "./model-selection";

const TAVERN_MEMORY_OVERFLOW_NOTICE = "（更早的自动记忆已按上下文预算裁剪，保留较新的剧情状态。）";

export type PreparedTavernContext = {
  room: TavernRoom;
  messages: TavernMessage[];
  didCompress: boolean;
  warning?: string;
  stats: MemoryBackedRuntimeContextStats;
};

export type PrepareTavernRuntimeContextInput = {
  runtimeAgentId: string;
  runtimeModel: RuntimeModelOption;
  room: TavernRoom;
  messages: TavernMessage[];
  characters: TavernCharacter[];
  references: TavernReferencedFile[];
  currentUserText: string;
  replyModels: TavernReplyModel[];
};

const requireRuntimeModelInput = (runtimeModel: RuntimeModelOption) => {
  return requireLlmRuntimeModelInput(
    runtimeModel,
    "当前模型配置已不可用，请重新选择模型。",
  );
};

const characterBrief = (characters: TavernCharacter[]) =>
  characters
    .map((character) => [
      `- ${character.name}`,
      `设定：${character.description}`,
      `说话方式：${character.speakingStyle}`,
      character.goals ? `目标：${character.goals}` : "",
      character.relationships ? `关系：${character.relationships}` : "",
    ].filter(Boolean).join("\n"))
    .join("\n\n");

const estimateStaticTokens = ({
  room,
  characters,
  references,
  currentUserText,
}: Pick<
  PrepareTavernRuntimeContextInput,
  "room" | "characters" | "references" | "currentUserText"
>) => countTextTokens([
  room.title,
  room.scene,
  room.sceneGoal,
  room.memory,
  room.autoMemory,
  Object.values(room.characterMemories).join("\n\n"),
  formatTavernLorebookEntries(room.lorebookEntries.filter((entry) => entry.enabled)),
  formatTavernTimelineEvents(room),
  characterBrief(characters),
  currentUserText,
  formatReferencesForPrompt(references, {
    query: currentUserText,
    ...TAVERN_REFERENCE_PROMPT_LIMITS,
  }),
].join("\n\n"));

const summarizeTavernMessages = async ({
  runtimeAgentId,
  runtimeModel,
  room,
  characters,
  previousMemory,
  messages,
}: {
  runtimeAgentId: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoom;
  characters: TavernCharacter[];
  previousMemory: string;
  messages: TavernMessage[];
}) => {
  const conversation = tavernMessagesToRuntimeMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
  });

  return runSharedConversationSummary({
    agentId: runtimeAgentId,
    runtimeModel,
    systemPrompt: [
      "你是酒馆长期剧情记忆整理器。",
      "请把旧对话压缩成中文剧情状态，用于后续角色扮演。",
      "保留：已发生事件、人物关系变化、承诺、伏笔、重要物品/地点、未解决冲突、用户明确设定。",
      "不要覆盖或改写用户手动房间记忆；只整理对话中新增的事实和状态。",
      "不要续写剧情，不要新增事实，不要把纯气氛描写、修辞或一次性寒暄写入长期记忆。",
      "不要输出寒暄，不要写分析过程。",
    ].join("\n"),
    previousSummary: previousMemory,
    messages: conversation,
    fallbackSummary: previousMemory,
    buildUserPrompt: ({ formattedConversation }) => [
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
        ? `<scene_plot instruction="do_not_rewrite">\n${room.scenePlot.trim()}\n</scene_plot>`
        : "<scene_plot>（无）</scene_plot>",
      "",
      room.sceneGoal.trim()
        ? `<scene_goal instruction="do_not_rewrite">\n${room.sceneGoal.trim()}\n</scene_goal>`
        : "<scene_goal>（无）</scene_goal>",
      "",
      room.sceneDirection.trim()
        ? `<scene_direction instruction="do_not_rewrite">\n${room.sceneDirection.trim()}\n</scene_direction>`
        : "<scene_direction>（无）</scene_direction>",
      "",
      room.sceneTransition.trim()
        ? `<scene_transition instruction="do_not_rewrite">\n${room.sceneTransition.trim()}\n</scene_transition>`
        : "<scene_transition>（无）</scene_transition>",
      "",
      room.memory.trim()
        ? `<manual_memory instruction="do_not_rewrite">\n${room.memory.trim()}\n</manual_memory>`
        : "<manual_memory>（无）</manual_memory>",
      "",
      previousMemory.trim()
        ? `<existing_auto_memory>\n${previousMemory.trim()}\n</existing_auto_memory>`
        : "<existing_auto_memory>（无）</existing_auto_memory>",
      "",
      "<character_memories instruction=\"manual_room_scoped_memory; do_not_rewrite\">",
      Object.entries(room.characterMemories)
        .map(([characterId, memory]) => {
          const characterName = characters.find((character) => character.id === characterId)?.name ?? characterId;
          return memory.trim() ? `## ${characterName}\n${memory.trim()}` : "";
        })
        .filter(Boolean)
        .join("\n\n") || "（无）",
      "</character_memories>",
      "",
      "<lorebook instruction=\"world_facts; do_not_rewrite\">",
      formatTavernLorebookEntries(room.lorebookEntries.filter((entry) => entry.enabled)) || "（无）",
      "</lorebook>",
      "",
      "<story_timeline instruction=\"manual_events; do_not_rewrite\">",
      formatTavernTimelineEvents(room) || "（无）",
      "</story_timeline>",
      "",
      "<characters>",
      characterBrief(characters),
      "</characters>",
      "",
      "<new_old_conversation_to_merge>",
      formattedConversation,
      "</new_old_conversation_to_merge>",
      "",
      "请输出合并后的自动剧情记忆。",
    ].join("\n"),
  });
};

export const prepareTavernRuntimeContext = async ({
  runtimeAgentId,
  runtimeModel,
  room,
  messages,
  characters,
  references,
  currentUserText,
  replyModels,
}: PrepareTavernRuntimeContextInput): Promise<PreparedTavernContext> => {
  const summaryModelInput = requireRuntimeModelInput(runtimeModel);
  const replyModelInputs = replyModels.map((replyModel) =>
    requireRuntimeModelInput(replyModel.runtimeModel)
  );
  const budgetingModelInputs = [
    summaryModelInput,
    ...(replyModelInputs.length > 0 ? replyModelInputs : [summaryModelInput]),
  ];
  const contextWindow = Math.min(
    ...budgetingModelInputs.map((modelInput) =>
      resolveAppContextWindow(modelInput)
    ),
  );
  const maxTokens = Math.max(
    ...budgetingModelInputs.map((modelInput) => modelInput.maxTokens ?? 4096),
  );
  const runtimeMessages = tavernMessagesToRuntimeMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
  });
  const preparedContext = await prepareMemoryBackedRuntimeContext({
    state: room,
    messages,
    runtimeMessages,
    currentMemory: room.autoMemory,
    summarizedMessageIds: room.summarizedMessageIds,
    contextWindow,
    maxTokens,
    staticTokens: estimateStaticTokens({
      room,
      characters,
      references,
      currentUserText,
    }),
    overflowNotice: TAVERN_MEMORY_OVERFLOW_NOTICE,
    getMessageId: (message) => message.id,
    summarizeMessages: ({ previousMemory, messages: messagesToSummarize }) =>
      summarizeTavernMessages({
        runtimeAgentId,
        runtimeModel: summaryModelInput,
        room,
        characters,
        previousMemory,
        messages: messagesToSummarize,
      }),
    applyMemoryUpdate: (currentRoom, update) => ({
      ...currentRoom,
      autoMemory: update.memory,
      autoMemoryUpdatedAt: update.updatedAt,
      summarizedMessageIds: update.summarizedMessageIds,
      updatedAt: update.updatedAt,
    }),
  });

  return {
    room: preparedContext.state,
    messages: preparedContext.messages,
    didCompress: preparedContext.didCompress,
    warning: preparedContext.warning,
    stats: preparedContext.stats,
  };
};
