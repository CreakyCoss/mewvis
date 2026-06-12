import {
  countConversationTokens,
  countTextTokens,
  createConversationTokenBudget,
  findConversationTailStartByTokenBudget,
  formatReferencesForPrompt,
  resolveAppContextWindow,
  SUMMARY_TARGET_RATIO,
  SUMMARY_TRIGGER_RATIO,
} from "@/ai/agent-context";
import type { AgentRuntimeModelInput } from "@/ai/agent-runtime/contracts";
import {
  requireRuntimeModelInput as requireLlmRuntimeModelInput,
  type RuntimeModelOption,
} from "@/features/llm-settings";
import { runSharedConversationSummary } from "@/features/shared-chat-runtime";
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

const MIN_RECENT_HISTORY_TOKENS = 1600;
const AUTO_MEMORY_MAX_CHARS = 12000;

export type PreparedTavernContext = {
  room: TavernRoom;
  messages: TavernMessage[];
  didCompress: boolean;
  warning?: string;
  stats: {
    contextWindow: number;
    historyTokenBudget: number;
    historyTokensBefore: number;
    historyTokensAfter: number;
    summarizedMessageCount: number;
  };
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

const limitAutoMemory = (memory: string) => {
  const trimmed = memory.trim();
  if (trimmed.length <= AUTO_MEMORY_MAX_CHARS) {
    return trimmed;
  }

  return [
    "（更早的自动记忆已按上下文预算裁剪，保留较新的剧情状态。）",
    trimmed.slice(-AUTO_MEMORY_MAX_CHARS),
  ].join("\n");
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

const resolveTavernHistoryBudget = ({
  contextWindow,
  maxTokens,
  staticTokens,
}: {
  contextWindow: number;
  maxTokens: number;
  staticTokens: number;
}) => {
  const baseBudget = createConversationTokenBudget({
    contextWindow,
    maxTokens,
  });
  const staticAwareBudget = Math.floor(Math.max(
    MIN_RECENT_HISTORY_TOKENS,
    (contextWindow - staticTokens - maxTokens - 4096) * 0.55,
  ));

  return Math.max(
    MIN_RECENT_HISTORY_TOKENS,
    Math.min(baseBudget, staticAwareBudget),
  );
};

const summarizeTavernMessages = async ({
  runtimeAgentId,
  runtimeModel,
  room,
  characters,
  messages,
}: {
  runtimeAgentId: string;
  runtimeModel: AgentRuntimeModelInput;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
}) => {
  const conversation = tavernMessagesToRuntimeMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
  });
  return limitAutoMemory(await runSharedConversationSummary({
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
    previousSummary: room.autoMemory,
    messages: conversation,
    fallbackSummary: room.autoMemory,
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
        room.autoMemory.trim()
          ? `<existing_auto_memory>\n${room.autoMemory.trim()}\n</existing_auto_memory>`
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
  }));
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
  const historyTokenBudget = resolveTavernHistoryBudget({
    contextWindow,
    maxTokens,
    staticTokens: estimateStaticTokens({
      room,
      characters,
      references,
      currentUserText,
    }),
  });
  const runtimeMessages = tavernMessagesToRuntimeMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
  });
  const historyTokensBefore = countConversationTokens(runtimeMessages);
  const triggerTokens = Math.floor(historyTokenBudget * SUMMARY_TRIGGER_RATIO);

  if (historyTokensBefore <= triggerTokens) {
    return {
      room,
      messages,
      didCompress: false,
      stats: {
        contextWindow,
        historyTokenBudget,
        historyTokensBefore,
        historyTokensAfter: historyTokensBefore,
        summarizedMessageCount: 0,
      },
    };
  }

  const targetTokens = Math.floor(historyTokenBudget * SUMMARY_TARGET_RATIO);
  const tailStart = findConversationTailStartByTokenBudget(runtimeMessages, targetTokens);
  const recentMessages = messages.slice(tailStart);
  const summarizedMessageIds = new Set(room.summarizedMessageIds ?? []);
  const messagesToSummarize = messages
    .slice(0, tailStart)
    .filter((message) => !summarizedMessageIds.has(message.id));

  if (messagesToSummarize.length === 0) {
    const historyTokensAfter = countConversationTokens(tavernMessagesToRuntimeMessages({
      messages: recentMessages,
      characters,
      userPersonaName: room.userPersonaName,
    }));

    return {
      room,
      messages: recentMessages,
      didCompress: false,
      stats: {
        contextWindow,
        historyTokenBudget,
        historyTokensBefore,
        historyTokensAfter,
        summarizedMessageCount: 0,
      },
    };
  }

  try {
    const autoMemory = await summarizeTavernMessages({
      runtimeAgentId,
      runtimeModel: summaryModelInput,
      room,
      characters,
      messages: messagesToSummarize,
    });
    const nextRoom: TavernRoom = {
      ...room,
      autoMemory,
      autoMemoryUpdatedAt: Date.now(),
      summarizedMessageIds: [
        ...summarizedMessageIds,
        ...messagesToSummarize.map((message) => message.id),
      ],
      updatedAt: Date.now(),
    };
    const historyTokensAfter = countConversationTokens(tavernMessagesToRuntimeMessages({
      messages: recentMessages,
      characters,
      userPersonaName: nextRoom.userPersonaName,
    }));

    return {
      room: nextRoom,
      messages: recentMessages,
      didCompress: true,
      stats: {
        contextWindow,
        historyTokenBudget,
        historyTokensBefore,
        historyTokensAfter,
        summarizedMessageCount: messagesToSummarize.length,
      },
    };
  } catch (caught) {
    const historyTokensAfter = countConversationTokens(tavernMessagesToRuntimeMessages({
      messages: recentMessages,
      characters,
      userPersonaName: room.userPersonaName,
    }));

    return {
      room,
      messages: recentMessages,
      didCompress: false,
      warning: caught instanceof Error ? caught.message : String(caught),
      stats: {
        contextWindow,
        historyTokenBudget,
        historyTokensBefore,
        historyTokensAfter,
        summarizedMessageCount: 0,
      },
    };
  }
};
