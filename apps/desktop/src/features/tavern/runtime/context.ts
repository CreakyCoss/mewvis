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
import { toAgentRuntimeModelConfig } from "@/ai/agent-runtime/config";
import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
import { runSharedConversationSummary } from "@/features/shared-chat-runtime";
import type {
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
} from "../types";
import {
  TAVERN_REFERENCE_PROMPT_LIMITS,
  tavernMessagesToRuntimeMessages,
} from "./prompt";

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
  provider: LlmProvider;
  model: ProviderModel;
  room: TavernRoom;
  messages: TavernMessage[];
  characters: TavernCharacter[];
  references: TavernReferencedFile[];
  currentUserText: string;
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
  room.memory,
  room.autoMemory,
  characterBrief(characters),
  currentUserText,
  formatReferencesForPrompt(references, {
    query: currentUserText,
    ...TAVERN_REFERENCE_PROMPT_LIMITS,
  }),
].join("\n\n"));

const resolveTavernHistoryBudget = ({
  contextWindow,
  model,
  staticTokens,
}: {
  contextWindow: number;
  model: ReturnType<typeof toAgentRuntimeModelConfig>;
  staticTokens: number;
}) => {
  const baseBudget = createConversationTokenBudget({
    contextWindow,
    maxTokens: model.maxTokens,
  });
  const staticAwareBudget = Math.floor(Math.max(
    MIN_RECENT_HISTORY_TOKENS,
    (contextWindow - staticTokens - (model.maxTokens ?? 4096) - 4096) * 0.55,
  ));

  return Math.max(
    MIN_RECENT_HISTORY_TOKENS,
    Math.min(baseBudget, staticAwareBudget),
  );
};

const summarizeTavernMessages = async ({
  runtimeAgentId,
  provider,
  model,
  room,
  characters,
  messages,
}: Pick<
  PrepareTavernRuntimeContextInput,
  "runtimeAgentId" | "provider" | "model" | "room" | "characters"
> & {
  messages: TavernMessage[];
}) => {
  const conversation = tavernMessagesToRuntimeMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
  });
  return limitAutoMemory(await runSharedConversationSummary({
    agentId: runtimeAgentId,
    provider,
    model,
    systemPrompt: [
      "你是酒馆长期剧情记忆整理器。",
      "请把旧对话压缩成中文剧情状态，用于后续角色扮演。",
      "保留：已发生事件、人物关系变化、承诺、伏笔、重要物品/地点、未解决冲突、用户明确设定。",
      "不要覆盖或改写用户手动房间记忆；只整理对话中新增的事实和状态。",
      "不要输出寒暄，不要写分析过程。",
    ].join("\n"),
    previousSummary: room.autoMemory,
    messages: conversation,
    fallbackSummary: room.autoMemory,
    buildUserPrompt: ({ formattedConversation }) => [
      `<room title="${room.title}">`,
      room.scene,
      "</room>",
      "",
      room.memory.trim()
        ? `<manual_memory instruction="do_not_rewrite">\n${room.memory.trim()}\n</manual_memory>`
        : "<manual_memory>（无）</manual_memory>",
      "",
      room.autoMemory.trim()
        ? `<existing_auto_memory>\n${room.autoMemory.trim()}\n</existing_auto_memory>`
        : "<existing_auto_memory>（无）</existing_auto_memory>",
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
  provider,
  model,
  room,
  messages,
  characters,
  references,
  currentUserText,
}: PrepareTavernRuntimeContextInput): Promise<PreparedTavernContext> => {
  const runtimeModel = toAgentRuntimeModelConfig(provider, model);
  const contextWindow = resolveAppContextWindow("auto", runtimeModel);
  const historyTokenBudget = resolveTavernHistoryBudget({
    contextWindow,
    model: runtimeModel,
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
      provider,
      model,
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
