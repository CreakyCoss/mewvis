import {
  buildTavernBridgeSystemPrompt,
  readTavernBridgeSession,
  rebuildTavernBridgeSessionFromMessages,
  summarizeTavernBridgeSession,
} from "../conversation";
import {
  tavernBridgeSessionRootDir,
  tavernQuickNovelAgentRoleId,
} from "../../core";
import { runTavernRuntimeAgent } from "../agent";
import { buildTavernQuickNovelPrompt } from "./quick-summary/prompt";
import type { TavernQuickSummaryInput } from "./quick-summary/types";

export type { TavernQuickSummaryInput } from "./quick-summary/types";

export const runTavernQuickSummary = async ({
  workspacePath,
  runtimeAgentId,
  runtimeModel,
  room,
  characters,
  messages,
}: TavernQuickSummaryInput) => {
  let shouldRebuildBridgeSession = true;
  try {
    const currentSession = await readTavernBridgeSession({
      workspacePath,
      room,
    });
    shouldRebuildBridgeSession = !currentSession || currentSession.messages.length <= 1;
  } catch {
    shouldRebuildBridgeSession = true;
  }

  if (shouldRebuildBridgeSession) {
    await rebuildTavernBridgeSessionFromMessages({
      workspacePath,
      room,
      characters,
      messages,
    });
  }

  const result = await summarizeTavernBridgeSession({
    workspacePath,
    room,
    runtimeAgentId,
    runtimeModel,
    maxSummaryChars: 4200,
    summaryInstruction: [
      "总结当前酒馆故事进展，供用户快速回到现场。",
      "只基于 bridge session 中已有消息、房间记忆、剧情结构、世界书和角色设定。",
      "不要续写剧情，不要新增事实，不要替任何角色安排新的行动。",
      "优先写清：当前局面、已经确认的线索/事实、人物状态与关系变化、未解决的问题、下一步可跟进的方向。",
      "输出中文 Markdown，使用简短小标题和列表；通常 4 到 8 条要点，内容很多时最多 10 条。",
      "如果进展很少，用 2 到 4 条说明当前只建立了哪些基础信息，不要为了凑条目重复内容。",
    ].join("\n"),
  });

  return result?.displaySummary?.summary?.trim() || "当前还没有足够内容可总结。";
};

export const runTavernQuickNovel = async ({
  workspacePath,
  runtimeAgentId,
  runtimeModel,
  room,
  characters,
  messages,
  storyContext,
}: TavernQuickSummaryInput) => {
  const prompt = buildTavernQuickNovelPrompt({ room, characters, messages, storyContext });

  const result = await runTavernRuntimeAgent({
    agentId: runtimeAgentId,
    workspacePath,
    sessionRootDir: tavernBridgeSessionRootDir(room),
    agentRoleId: tavernQuickNovelAgentRoleId(room),
    runtimeModel,
    systemPrompt: buildTavernBridgeSystemPrompt(room),
    userMessage: "请把当前酒馆内容整理成一章小说正文。",
    requestContext: prompt,
    runtimeInstruction: [
      "你是酒馆模式的小说化写作助手。",
      "你的任务是把已有剧情整理成自然、有画面感的小说正文。",
      "你可以润色和重组表达，但不能续写未来剧情、不能编造关键事实、不能输出解释过程。",
    ].join("\n"),
  });

  return result.text.trim() || "当前还没有足够内容可写成小说。";
};
