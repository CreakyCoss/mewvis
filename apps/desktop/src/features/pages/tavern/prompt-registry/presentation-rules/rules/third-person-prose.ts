import type { TavernPresentationRuleRegistration } from "../registry";

export const thirdPersonProsePresentationRule: TavernPresentationRuleRegistration = {
  id: "third-person-prose",
  label: "第三人称旁白",
  description: "以纯第三人称推进，角色不直接说“我”，用旁白转述心理、动作和选择。",
  perspective: "third_person_limited",
  dialoguePolicy: "indirect",
  userInputMode: "intent",
  renderStyle: "prose",
  generationContract: "character_narrative_beat",
  bridgeSystemAddendum: "整体以第三人称叙事推进；公开内容应像小说正文，而不是聊天记录。",
  directorAddendum: "导演选择应贡献下一段叙事推进的角色；旁白可承接环境和公开后果，但不要直接替用户做关键选择。",
  characterAddendum: [
    "将角色说话风格转译为第三人称间接表达、动作和心理描写。",
    "不要输出角色名冒号、聊天气泡式对白或第一人称自述。",
    "公开正文使用角色名或他/她称谓推进，必要时写“某某心里意识到...”。",
  ].join("\n"),
  composerPlaceholder: "写下主角意图、观察或下一步行动...",
  selectable: true,
  order: 20,
};
