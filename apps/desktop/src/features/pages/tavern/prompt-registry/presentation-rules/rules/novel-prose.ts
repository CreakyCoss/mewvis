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
  bridgeSystemAddendum: "整体以连贯小说正文推进，保留人物、场景、因果和节奏连续性。",
  directorAddendum: "导演调度下一段最有推进价值的小说片段；可以安排对白、动作和环境转场，但不跳过用户关键选择。",
  characterAddendum: [
    "公开内容写成第三人称小说正文，可包含少量自然对白。",
    "对白需要服务动作和冲突，不要退回聊天记录格式。",
    "角色个人说话风格只影响该角色对白或间接表达，不覆盖全局叙事视角。",
  ].join("\n"),
  composerPlaceholder: "写下剧情指令、主角行动或想推进的方向...",
  selectable: true,
  order: 30,
};
