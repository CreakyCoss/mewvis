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
  bridgeSystemAddendum: "整体以第三人称间接叙事呈现；公开内容应像小说正文，而不是聊天记录、剧本台词或第一人称自述。",
  directorAddendum: [
    "本呈现模式会把角色输出渲染为第三人称间接叙事；不要输出聊天记录、角色冒号、引号对白或第一人称自述。",
    "narrator 若由导演输出，应是可并入第三人称正文的短公开承接。",
  ].join("\n"),
  characterAddendum: [
    "将角色说话风格转译为第三人称间接表达、动作、停顿和可见反应。",
    "不要输出角色名冒号、聊天气泡式对白、引号对白或第一人称自述。",
    "公开正文使用角色名或他/她称谓推进；表达说话内容时写成“某某低声表示/追问/提醒...”，不要让角色直接说“我”。",
    "只写当前角色可知和可观察内容，不写其他角色未公开心理。",
    "历史里的直接对白只作为前文事实；本轮输出不要继承引号对白，也不要把结尾写成“要么 A 要么 B/你定”的选择菜单。",
  ].join("\n"),
  composerPlaceholder: "写下主角意图、观察或下一步行动...",
  selectable: true,
  order: 20,
};
