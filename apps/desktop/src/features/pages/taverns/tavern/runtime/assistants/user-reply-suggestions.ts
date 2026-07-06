import type { RuntimeModelInput } from "@/agent-client/types";
import type { TavernStoryContextPackage } from "@/features/pages/taverns/tavern/adapters/story";
import type { TavernMessage } from "../../types";
import type { TavernCharacter, TavernRoom } from "@/features/pages/taverns/manage/model";
import { buildTavernBridgeSystemPrompt } from "../conversation";
import { tavernBridgeSessionRootDir, tavernManagedUserAgentRoleId, tavernQuickReplyAgentRoleId } from "../../core";
import { runTavernRuntimeAgent } from "../agent";
import { createManagedReplyFallback, parseManagedReply, parseSuggestions } from "./user-reply/parsing";
import {
  buildTavernManagedUserReplyPrompt,
  buildTavernManagedUserReplySystemPrompt,
  buildTavernUserReplySuggestionPrompt,
} from "./user-reply/prompt";

export type TavernUserReplySuggestionInput = {
  workspacePath: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  currentDraft?: string;
  storyContext?: TavernStoryContextPackage;
};

export const runTavernUserReplySuggestions = async ({
  workspacePath,
  runtimeModel,
  room,
  characters,
  messages,
  currentDraft,
  storyContext,
}: TavernUserReplySuggestionInput) => {
  const { prompt, suggestionCount } = buildTavernUserReplySuggestionPrompt({
    room,
    characters,
    messages,
    currentDraft,
    storyContext,
  });

  const result = await runTavernRuntimeAgent({
    workspacePath,
    sessionRootDir: tavernBridgeSessionRootDir(room),
    agentRoleId: tavernQuickReplyAgentRoleId(room),
    runtimeModel,
    systemPrompt: buildTavernBridgeSystemPrompt(room),
    userMessage: `为酒馆用户「${room.userPersonaName || "我"}」生成 ${suggestionCount} 个下一句回复候选。`,
    requestContext: prompt,
    runtimeInstruction: [
      "你是酒馆模式的用户回复建议助手。",
      "你只为用户生成可点击发送的中文回复候选。",
      "只输出符合 schema 的严格合法 JSON 对象，不要代码块。",
    ].join("\n"),
  });

  const seenTexts = new Set<string>();
  return parseSuggestions(result.text, { characters, room })
    .filter((option) => {
      if (seenTexts.has(option.text)) {
        return false;
      }
      seenTexts.add(option.text);
      return true;
    })
    .slice(0, suggestionCount);
};

export const runTavernManagedUserReply = async ({
  workspacePath,
  runtimeModel,
  room,
  characters,
  messages,
  currentDraft,
  storyContext,
}: TavernUserReplySuggestionInput) => {
  const prompt = buildTavernManagedUserReplyPrompt({
    room,
    characters,
    messages,
    currentDraft,
    storyContext,
  });
  const systemPrompt = buildTavernManagedUserReplySystemPrompt();

  const runManagedReplyRequest = async (content: string) => {
    const result = await runTavernRuntimeAgent({
      workspacePath,
      sessionRootDir: tavernBridgeSessionRootDir(room),
      agentRoleId: tavernManagedUserAgentRoleId(room),
      runtimeModel,
      systemPrompt: buildTavernBridgeSystemPrompt(room),
      userMessage: `以导演身份，为酒馆用户「${room.userPersonaName || "我"}」生成本轮要发送的回复。`,
      requestContext: content,
      runtimeInstruction: systemPrompt,
    });

    return parseManagedReply(result.text, room.userPersonaName);
  };

  const firstReply = await runManagedReplyRequest(prompt);
  if (firstReply) {
    return firstReply;
  }

  const retryReply = await runManagedReplyRequest(
    [
      prompt,
      "",
      "<retry_instruction>",
      "上一次输出没有可发送的 reply。现在必须生成一个非空 reply 字符串；只输出 JSON，不要解释。",
      "</retry_instruction>",
    ].join("\n"),
  );
  if (retryReply) {
    return retryReply;
  }

  return createManagedReplyFallback(room);
};
