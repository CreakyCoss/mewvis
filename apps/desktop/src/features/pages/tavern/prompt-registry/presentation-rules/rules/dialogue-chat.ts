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
  bridgeSystemAddendum: "整体以多角色对话演绎为主，角色公开回复以直接对白承接现场；每轮优先回应用户点名、问题和当前场景目标。",
  directorAddendum: "导演调度角色发言、非语言回应和少量公开旁白；优先安排能回答当前具体线索或推进目标的角色，不要把角色整段改写成小说正文。",
  characterAddendum: [
    "角色公开部分优先写直接说出口的话，可附带 0 到 1 段可观察动作。",
    "对白必须承接当前用户问题、场景线索或关系压力，至少给出一条新信息、态度变化或下一步可选行动。",
    "不要把对白写成案情报告、线索清单或“要么 A 要么 B/你定”的二选一菜单；像真人现场回应一样短、准、有分寸。",
    "不要用纯气氛、纯等待或空泛安慰代替回应。",
  ].join("\n"),
  composerPlaceholder: "写下一句对白或行动...",
  selectable: true,
  order: 10,
};
