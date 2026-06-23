import type { TavernPresentationRuleRegistration } from "../registry";

export const novelProsePresentationRule: TavernPresentationRuleRegistration = {
  id: "novel-prose",
  label: "小说正文",
  description: "以第三人称小说段落呈现，允许少量引号对白，但整体不使用聊天气泡。",
  perspective: "third_person_omniscient",
  dialoguePolicy: "mixed",
  userInputMode: "story_directive",
  renderStyle: "prose",
  generationContract: "character_narrative_beat",
  bridgeSystemAddendum: "整体以连贯小说正文推进，保留人物、场景、因果和节奏连续性；公开正文应像小说段落，而不是聊天记录或设定说明。",
  directorAddendum: "导演调度下一段最有推进价值的小说片段；优先选择能承接当前目标、线索或冲突的角色，可以安排对白、动作和环境转场，但不跳过用户关键选择。",
  characterAddendum: [
    "公开内容写成 1 到 3 个自然段的第三人称小说正文，围绕当前角色形成动作/观察、线索或情绪判断、可承接余地。",
    "可包含少量当前角色自然对白；对白需要服务动作、冲突和信息推进，不要退回聊天记录格式。",
    "正文必须优先承接当前用户输入与场景目标，不要只写氛围、总结或角色站桩等待。",
    "不要把段落收束成“要么 A 要么 B，你决定/你定”的菜单；保留线索和动作余韵，让用户自然接话。",
    "角色个人说话风格只影响该角色对白或间接表达，不覆盖全局叙事视角。",
  ].join("\n"),
  composerPlaceholder: "写下剧情指令、主角行动或想推进的方向...",
  selectable: true,
  order: 30,
};
