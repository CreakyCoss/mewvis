import type { TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import type { RuntimeModelInput } from "@/agent-client/types";
import type { TavernMessage } from "../../types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import { buildTavernBridgeSystemPrompt } from "../prompt/bridge/system-prompt";
import { tavernBridgeSessionRootDir, tavernQuickReplyAgentRoleId } from "../../core/agent-role";
import { runTavernRuntimeAgent } from "../agent/run-agent";
import { parseSuggestions } from "./user-reply/parsing";
import { buildTavernUserReplySuggestionPrompt } from "./user-reply/suggestion-prompt";

export type TavernUserReplySuggestionInput = {
  workspacePath: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoomRuntime;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  currentDraft?: string;
};

export const runTavernUserReplySuggestions = async ({
  workspacePath,
  runtimeModel,
  room,
  characters,
  messages,
  currentDraft,
}: TavernUserReplySuggestionInput) => {
  const { prompt, suggestionCount } = buildTavernUserReplySuggestionPrompt({
    room,
    characters,
    messages,
    currentDraft,
  });

  const result = await runTavernRuntimeAgent({
    workspacePath,
    sessionRootDir: tavernBridgeSessionRootDir(room),
    agentRoleId: tavernQuickReplyAgentRoleId(room),
    runtimeModel,
    systemPrompt: buildTavernBridgeSystemPrompt(room),
    userMessage: `为酒馆用户「${room.user.personaName || "我"}」生成 ${suggestionCount} 个下一句回复候选。`,
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
