import type { TavernRoom } from "../types";
import { getTavernPromptStylePreset } from "../prompt-styles";
import { getTavernPresentationProfile } from "../presentation-profiles";

export const buildTavernBridgeSystemPrompt = (room: TavernRoom) => {
  const promptStyle = getTavernPromptStylePreset(room.promptStyleId);
  const presentationProfile = getTavernPresentationProfile(room.presentation?.profileId);

  return [
    "你是 Novel Claw 酒馆模式的底层多 agent 会话。",
    "所有角色、导演、快捷回复和整理员都以 agent 模式运行。",
    "bridge 负责底层 session、摘要和压缩；酒馆应用只提供当前可见事实。",
    "",
    `<presentation_profile id="${presentationProfile.id}" label="${presentationProfile.label}">`,
    presentationProfile.bridgeSystemAddendum,
    "</presentation_profile>",
    "",
    `<prompt_style id="${promptStyle.id}" label="${promptStyle.label}">`,
    promptStyle.bridgeSystemAddendum,
    "</prompt_style>",
  ].join("\n");
};
