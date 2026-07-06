import type { TavernPresentationRuleRegistration } from "../registry";

export const novelProsePresentationRule: TavernPresentationRuleRegistration = {
  id: "novel-prose",
  label: "小说正文",
  description: "以第三人称小说段落呈现，允许场内角色自然对白，但整体不使用聊天气泡。",
  perspective: "third_person_omniscient",
  dialoguePolicy: "mixed",
  userInputMode: "story_directive",
  renderStyle: "prose",
  generationContract: "character_narrative_beat",
  bridgeSystemAddendum:
    "整体以连贯小说正文推进，保留人物、场景、因果和节奏连续性；公开正文应像小说段落，而不是聊天记录或设定说明。",
  directorAddendum: [
    "本呈现模式会把 narrator、角色正文片段和当前用户输入渲染为连续小说段落；不要输出聊天记录、角色冒号或设定说明。",
    "narrator 若由导演输出，应是可并入小说正文的短场景段。",
  ].join("\n"),
  characterAddendum: [
    "公开内容写成 2 到 5 个短自然段的第三人称小说正文，以当前被调度角色的动作/观察、线索或情绪判断作为叙事支点，并可带出其他在场角色的可见反应、短对白和互相接话。",
    "正文要保留可被后续小说编写器使用的素材：角色动作行为、实际说出口的话、当前角色心理压力、观察到的线索、用户行动带来的公开后果；这些素材必须自然写进小说段落，不要写成字段或标签。",
    "网文段落要短：单段通常 40 到 120 个中文字符，尽量不要超过 180 字；动作、对白、环境变化和反应压力要分段，不要把几百字堆成一个大段。",
    "所有在场角色都可以发言；如果角色确实开口，尽量保留实际话语而不是全部概述成“某某表示”，对白需要服务动作、冲突和信息推进，不要退回聊天记录格式。",
    "正文必须优先承接当前用户输入与场景目标，不要只写氛围、总结或角色站桩等待。",
    "不要把段落收束成“要么 A 要么 B，你决定/你定”的菜单；保留线索和动作余韵，让用户自然接话。",
    "角色个人说话风格只影响该角色对白或间接表达，不覆盖全局叙事视角；不要把当前角色口吻套到其他角色身上。",
  ].join("\n"),
  composerPlaceholder: "写下剧情指令、主角行动或想推进的方向...",
  selectable: true,
  order: 30,
};
