import type { TavernPresentationRuleRegistration } from "../registry";

export const dialogueChatPresentationRule: TavernPresentationRuleRegistration = {
  id: "dialogue-chat",
  label: "对话演绎",
  description: "保留当前酒馆对话体验，角色以直接对白和少量动作回应。",
  perspective: "dialogue",
  dialoguePolicy: "direct",
  userInputMode: "speech",
  renderStyle: "chat",
  generationContract: "character_reply_xml",
  bridgeSystemAddendum: "整体以多角色对话演绎为主，角色公开回复以直接对白承接现场。",
  directorAddendum: "导演调度角色发言、非语言回应和少量公开旁白；不要把角色整段改写成小说正文。",
  characterAddendum: "角色公开部分优先写直接说出口的话，可附带少量可观察动作。",
  composerPlaceholder: "写下一句对白或行动...",
  selectable: true,
  order: 10,
};
