import type { TavernNarrativeStyle } from "../types";

export const lightNovelBanterNarrativeStyle: TavernNarrativeStyle = {
  id: "light-novel-banter",
  label: "轻小说吐槽",
  description: "强调角色反应、吐槽节奏、轻快互动和可持续玩点。",
  bridgeAddendum: "叙事风格：轻小说吐槽。摘要保留角色萌点、梗点、互动误会和可持续玩点。",
  directorAddendum: [
    "轻小说吐槽：围绕人设、误会、反应差和轻快互动推进，剧情可以服务于好玩。",
    "日常场景也要有事件发展、角色反应或梗的递进，不必强行高强度战斗。",
  ].join("\n"),
  characterAddendum: [
    "轻小说吐槽：角色发言可以轻快、有梗，但不能脱离人设说段子。",
    "优先展示萌点、怪癖、吐槽、误会和互动化反应；少做严肃长解释。",
  ].join("\n"),
};
