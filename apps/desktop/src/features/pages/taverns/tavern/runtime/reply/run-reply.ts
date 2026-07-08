import type { TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import type { RuntimeModelInput } from "@/agent-client/types";
import type { TavernMessage } from "../../types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import { cleanTavernThoughtText } from "@/features/pages/taverns/room/message/protocol/parse-reply";
import {
  formatTavernVisibleMessagesForRequestContext,
  normalizeTavernMessagesForAudience,
} from "@/features/pages/taverns/room/message/domain/visibility";
import { buildTavernBridgeSystemPrompt } from "../prompt/bridge/system-prompt";
import { tavernBridgeSessionRootDir, tavernCharacterAgentRoleId } from "../../core/agent-role";
import { formatTavernCharacterRelationships } from "../../core/relationships";
import { runTavernRuntimeAgent } from "../agent/run-agent";
import {
  selectTavernRuntimeActiveScene,
  selectTavernRuntimeActiveSceneFields,
  selectTavernRuntimeActiveSceneInstance,
} from "@/features/pages/taverns/room/runtime/accessors";
export type RunTavernInnerThoughtInput = {
  workspacePath: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoomRuntime;
  activeCharacter: TavernCharacter;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  currentUserText: string;
  replyContent: string;
};

const resolveInnerThoughtSceneText = (room: TavernRoomRuntime) => {
  const activeInstance = selectTavernRuntimeActiveSceneInstance(room);
  if (activeInstance) {
    return activeInstance.scene;
  }

  const activeScene = selectTavernRuntimeActiveScene(room);
  if (!activeScene) {
    throw new Error("当前酒馆缺少标准故事场景，无法生成角色内心想法。");
  }

  return activeScene.scene;
};

export const runTavernInnerThought = async ({
  workspacePath,
  runtimeModel,
  room,
  activeCharacter,
  characters,
  messages,
  currentUserText,
  replyContent,
}: RunTavernInnerThoughtInput) => {
  const visibleMessages = normalizeTavernMessagesForAudience({
    messages,
    characters,
    userPersonaName: room.user.personaName,
    audience: { type: "character", characterId: activeCharacter.id },
  }).slice(-8);
  const activeInstance = selectTavernRuntimeActiveSceneInstance(room);
  const sceneFields = selectTavernRuntimeActiveSceneFields(room);
  const characterMemoryLayers = activeInstance?.characterMemoryLayers?.[activeCharacter.id];
  const characterMemory = [
    characterMemoryLayers?.required?.trim() ?? "",
    characterMemoryLayers?.public?.trim() ?? "",
    characterMemoryLayers?.known?.trim() ?? "",
    characterMemoryLayers?.privateSelf?.trim() ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const relationshipText = formatTavernCharacterRelationships({
    character: activeCharacter,
    characters,
    userPersonaName: room.user.personaName,
    relationshipOverrides: sceneFields.relationshipOverrides,
  });
  const result = await runTavernRuntimeAgent({
    workspacePath,
    sessionRootDir: tavernBridgeSessionRootDir(room),
    agentRoleId: tavernCharacterAgentRoleId(room, activeCharacter),
    runtimeModel,
    systemPrompt: buildTavernBridgeSystemPrompt(room),
    userMessage: "请只输出当前角色此刻没有说出口的一句内心想法。",
    requestContext: [
      "<active_character>",
      `name: ${activeCharacter.name}`,
      `description: ${activeCharacter.description}`,
      `speakingStyle: ${activeCharacter.speakingStyle}`,
      activeCharacter.goals ? `goals: ${activeCharacter.goals}` : "",
      relationshipText ? `relationships: ${relationshipText}` : "",
      characterMemory ? `memory: ${characterMemory}` : "",
      "</active_character>",
      "",
      `<room title="${room.identity.title}">`,
      resolveInnerThoughtSceneText(room),
      "</room>",
      "",
      "<current_user_input>",
      currentUserText,
      "</current_user_input>",
      "",
      "<recent_conversation>",
      formatTavernVisibleMessagesForRequestContext(visibleMessages) || "（无）",
      "</recent_conversation>",
      "",
      "<generated_reply>",
      replyContent,
      "</generated_reply>",
    ]
      .filter(Boolean)
      .join("\n"),
    runtimeInstruction: [
      "你是酒馆模式的角色内心独白补写器。",
      "只为当前角色补一条会显示在聊天气泡里的内心想法，不是模型推理过程。",
      "只输出 12 到 80 个中文字符的一句话；不要输出标签、角色名、解释、Markdown 或代码块。",
      "内心想法必须贴合角色人设、当前公开回复和现场，不要替其他角色写心理。",
    ].join("\n"),
  });

  return cleanTavernThoughtText(result.text).slice(0, 120);
};
