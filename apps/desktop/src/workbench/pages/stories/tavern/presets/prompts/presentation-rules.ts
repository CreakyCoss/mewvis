import type {
  TavernPresentationProfile,
  TavernPresentationProfileId,
  TavernPresentationSettings,
} from "@/workbench/pages/stories/tavern/manage/model";

const dialogueChatPresentationRule = {
  id: "dialogue-chat",
  label: "对话演绎",
  description: "角色以直接对白和少量动作回应，保留酒馆聊天体验。",
  perspective: "dialogue",
  dialoguePolicy: "direct",
  userInputMode: "speech",
  renderStyle: "chat",
  generationContract: "character_reply_xml",
  directorAddendum: [
    "本呈现模式会把角色公开输出渲染为聊天式直接对白和近景动作；不要把角色整段改写成小说正文或角色名冒号剧本。",
    "narrator 若由导演输出，应是适合聊天流阅读的短公开场景提示。",
  ].join("\n"),
  characterAddendum: [
    "角色公开部分优先写直接说出口的话，可附带 0 到 1 段可观察动作。",
    "对白必须承接当前用户问题、场景线索或关系压力，至少给出一条新信息、态度变化或下一步可选行动。",
    "不要把对白写成案情报告、线索清单或“要么 A 要么 B/你定”的二选一菜单；像真人现场回应一样短、准、有分寸。",
    "不要用纯气氛、纯等待或空泛安慰代替回应。",
  ].join("\n"),
  composerPlaceholder: "写下一句对白或行动...",
} satisfies TavernPresentationProfile;

const thirdPersonProsePresentationRule = {
  id: "third-person-prose",
  label: "第三人称旁白",
  description: "以第三人称推进，用间接叙事表达角色心理、动作和选择。",
  perspective: "third_person_limited",
  dialoguePolicy: "indirect",
  userInputMode: "intent",
  renderStyle: "prose",
  generationContract: "character_narrative_beat",
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
} satisfies TavernPresentationProfile;

const novelProsePresentationRule = {
  id: "novel-prose",
  label: "小说正文",
  description: "以第三人称小说段落呈现，允许自然对白，整体不使用聊天气泡。",
  perspective: "third_person_omniscient",
  dialoguePolicy: "mixed",
  userInputMode: "story_directive",
  renderStyle: "prose",
  generationContract: "character_narrative_beat",
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
} satisfies TavernPresentationProfile;

export const TAVERN_PRESENTATION_RULES = [
  dialogueChatPresentationRule,
  thirdPersonProsePresentationRule,
  novelProsePresentationRule,
] satisfies TavernPresentationProfile[];

export const DEFAULT_TAVERN_PRESENTATION_PROFILE_ID: TavernPresentationProfileId = dialogueChatPresentationRule.id;

const presentationRulesById = new Map(TAVERN_PRESENTATION_RULES.map((rule) => [rule.id, rule] as const));

export const normalizeTavernPresentationProfileId = (value: unknown): TavernPresentationProfileId =>
  typeof value === "string" && presentationRulesById.has(value as TavernPresentationProfileId)
    ? (value as TavernPresentationProfileId)
    : DEFAULT_TAVERN_PRESENTATION_PROFILE_ID;

export const normalizeTavernPresentation = (value: unknown): TavernPresentationSettings => {
  const candidate = value && typeof value === "object" ? (value as Partial<TavernPresentationSettings>) : {};
  return { profileId: normalizeTavernPresentationProfileId(candidate.profileId) };
};

export const getTavernPresentationProfile = (value: unknown): TavernPresentationProfile =>
  presentationRulesById.get(normalizeTavernPresentationProfileId(value))!;
