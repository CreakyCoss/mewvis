import type {
  TavernMessage,
  TavernPresentationProfile,
  TavernPresentationProfileId,
  TavernPresentationSettings,
} from "./types";

export const DEFAULT_TAVERN_PRESENTATION_PROFILE_ID: TavernPresentationProfileId =
  "dialogue-chat";

export const TAVERN_PRESENTATION_PROFILES: TavernPresentationProfile[] = [
  {
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
  },
  {
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
  },
  {
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
  },
];

const presentationProfileIds = new Set(
  TAVERN_PRESENTATION_PROFILES.map((profile) => profile.id),
);

export const normalizeTavernPresentationProfileId = (
  value: unknown,
): TavernPresentationProfileId =>
  typeof value === "string" && presentationProfileIds.has(value as TavernPresentationProfileId)
    ? value as TavernPresentationProfileId
    : DEFAULT_TAVERN_PRESENTATION_PROFILE_ID;

export const createDefaultTavernPresentation = (): TavernPresentationSettings => ({
  profileId: DEFAULT_TAVERN_PRESENTATION_PROFILE_ID,
  profileVersion: 1,
});

export const normalizeTavernPresentation = (
  value: unknown,
): TavernPresentationSettings => {
  const candidate = value && typeof value === "object"
    ? value as Partial<TavernPresentationSettings>
    : {};

  return {
    profileId: normalizeTavernPresentationProfileId(candidate.profileId),
    profileVersion: 1,
    lockedAt: typeof candidate.lockedAt === "number" ? candidate.lockedAt : undefined,
    lockedSceneId: typeof candidate.lockedSceneId === "string" && candidate.lockedSceneId.trim()
      ? candidate.lockedSceneId
      : undefined,
  };
};

export const getTavernPresentationProfile = (
  value: unknown,
): TavernPresentationProfile => {
  const id = normalizeTavernPresentationProfileId(value);
  return TAVERN_PRESENTATION_PROFILES.find((profile) => profile.id === id) ??
    TAVERN_PRESENTATION_PROFILES[0];
};

export const hasTavernPresentationStarted = (
  messages: Array<Pick<TavernMessage, "role">>,
) => messages.some((message) => message.role === "user" || message.role === "character");

export const isTavernPresentationLocked = ({
  presentation,
  messages,
}: {
  presentation?: TavernPresentationSettings | null;
  messages: Array<Pick<TavernMessage, "role">>;
}) => {
  const normalizedPresentation = normalizeTavernPresentation(presentation);
  return Boolean(normalizedPresentation.lockedAt) || hasTavernPresentationStarted(messages);
};
