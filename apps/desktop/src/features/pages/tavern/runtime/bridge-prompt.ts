import type { TavernRoom } from "../types";

export const buildTavernBridgeSystemPrompt = (_room: TavernRoom) => [
  "你是 Novel Claw 酒馆模式的底层多 agent 会话。",
  "所有角色、导演、快捷回复和整理员都以 agent 模式运行。",
  "bridge 负责底层 session、摘要和压缩；酒馆应用只提供当前可见事实。",
].join("\n");
