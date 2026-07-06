import type { TavernCharacterStylePresetId } from "./character-style-presets";
import { createDefaultTavernPromptSettings } from "./text-blocks";
import type { TavernPlatformStyleId, TavernQualityRuleId } from "./rule-layers/types";
import type {
  TavernPresentationProfileId,
  TavernPromptStyleId,
  TavernRoomPromptSettings,
  TavernSystemNarrativePresetId,
} from "@/features/pages/taverns/manage/model";

export type TavernPromptStylePackageId =
  | "chat-character-banter"
  | "chat-grounded-roleplay"
  | "novel-default-flow"
  | "novel-cinematic-suspense"
  | "novel-fanqie-fast-hook"
  | "novel-grounded-literary"
  | "novel-qidian-longform"
  | "third-person-balanced-observer"
  | "third-person-grounded-observer";

export type TavernPromptStylePackage = {
  id: TavernPromptStylePackageId;
  label: string;
  description: string;
  presentationProfileId: TavernPresentationProfileId;
  systemNarrativePresetId: TavernSystemNarrativePresetId;
  promptStyleId: TavernPromptStyleId;
  ruleCompositionId: TavernPlatformStyleId;
  qualityRuleIds: TavernQualityRuleId[];
  immersiveDescriptionEnabled: boolean;
  characterStylePresetId: TavernCharacterStylePresetId;
  evaluationSummary: string;
  codexReviewScore: number;
  codexReviewNote: string;
  strengths: string[];
  order: number;
};

export const DEFAULT_TAVERN_PROMPT_STYLE_PACKAGE_ID: TavernPromptStylePackageId = "novel-default-flow";

const tavernPromptStylePackages = [
  {
    id: "novel-default-flow",
    label: "小说正文稳态",
    description: "保留当前默认小说味道，兼顾角色对白、线索推进和用户选择权。",
    presentationProfileId: "novel-prose",
    systemNarrativePresetId: "balanced",
    promptStyleId: "novel",
    ruleCompositionId: "none",
    qualityRuleIds: [],
    immersiveDescriptionEnabled: true,
    characterStylePresetId: "cinematic-inner",
    evaluationSummary: "硬指标 0.92 / 内容裁判 0.96。小说形态、场景承接和角色边界整体最稳。",
    codexReviewScore: 91,
    codexReviewNote: "读起来像连续小说，线索和环境服务叙事；偶尔会把下一步调查方向说得稍完整。",
    strengths: ["小说段落", "线索承接", "选择留白"],
    order: 10,
  },
  {
    id: "novel-grounded-literary",
    label: "克制文学",
    description: "偏写实短篇质感，减少夸张修辞，适合现实、悬疑和情绪克制的场景。",
    presentationProfileId: "novel-prose",
    systemNarrativePresetId: "restrained",
    promptStyleId: "grounded",
    ruleCompositionId: "none",
    qualityRuleIds: [],
    immersiveDescriptionEnabled: true,
    characterStylePresetId: "restrained-realistic",
    evaluationSummary: "硬指标 0.90 / 内容裁判 0.92。写实克制，适合短篇和悬疑观察。",
    codexReviewScore: 90,
    codexReviewNote: "细节克制、动作顺序清楚，真人感好；个别收尾句略像结构化汇报。",
    strengths: ["写实克制", "短篇质感", "低解释"],
    order: 20,
  },
  {
    id: "novel-qidian-longform",
    label: "起点长篇",
    description: "偏长线升级、信息铺垫和章节推进，适合主线目标清晰的网文正文。",
    presentationProfileId: "novel-prose",
    systemNarrativePresetId: "dramatic",
    promptStyleId: "silent-law",
    ruleCompositionId: "none",
    qualityRuleIds: [],
    immersiveDescriptionEnabled: true,
    characterStylePresetId: "cinematic-inner",
    evaluationSummary: "真实场景评估均分 0.79，2/3 有效裁判判可用。短段落达标，最长约 73 字；仍需加强长线主线钩。",
    codexReviewScore: 76,
    codexReviewNote: "适合作为悬疑冒险章节开头基线；需要继续加强势力线、路线争夺和长期代价，避免停在单场问询。",
    strengths: ["长线主线", "升级铺垫", "章尾追读"],
    order: 30,
  },
  {
    id: "novel-fanqie-fast-hook",
    label: "番茄快节奏",
    description: "偏强钩子、快节奏冲突和即时反馈，适合短段高推进的网文正文。",
    presentationProfileId: "novel-prose",
    systemNarrativePresetId: "dramatic",
    promptStyleId: "dramatic",
    ruleCompositionId: "none",
    qualityRuleIds: [],
    immersiveDescriptionEnabled: true,
    characterStylePresetId: "cinematic-inner",
    evaluationSummary:
      "真实场景评估均分 0.72，2/4 裁判判可用。短段落达标，最长约 89 字；外部压力改善，但仍需更强爆点。",
    codexReviewScore: 72,
    codexReviewNote:
      "快节奏和短段落已经接近番茄读感；仍易变成室内调查纪要，需要事件打断、用户行动后果和更清晰角色差异。",
    strengths: ["强开篇", "快冲突", "爽点反馈"],
    order: 40,
  },
  {
    id: "novel-cinematic-suspense",
    label: "镜头悬疑",
    description: "更强调场面调度、线索压迫和悬疑推进，适合剧情向长线场景。",
    presentationProfileId: "novel-prose",
    systemNarrativePresetId: "dramatic",
    promptStyleId: "silent-law",
    ruleCompositionId: "none",
    qualityRuleIds: [],
    immersiveDescriptionEnabled: true,
    characterStylePresetId: "cinematic-inner",
    evaluationSummary: "硬指标 0.90 / 内容裁判 0.88。镜头和线索张力强，适合悬疑场面。",
    codexReviewScore: 88,
    codexReviewNote: "M3 样本很像侦探小说；M2.7 偶尔对白偏长、像案情报告。",
    strengths: ["镜头动作", "悬疑推进", "强场景"],
    order: 50,
  },
  {
    id: "third-person-balanced-observer",
    label: "第三人称旁白稳态",
    description: "以第三人称观察推进，减少聊天格式，适合用户以意图和行动指令参与。",
    presentationProfileId: "third-person-prose",
    systemNarrativePresetId: "balanced",
    promptStyleId: "novel",
    ruleCompositionId: "none",
    qualityRuleIds: [],
    immersiveDescriptionEnabled: true,
    characterStylePresetId: "restrained-realistic",
    evaluationSummary: "硬指标 0.96 / 内容裁判 0.88。第三人称边界稳定，但仍需防止选项菜单化。",
    codexReviewScore: 86,
    codexReviewNote: "旁白能连起来读；问题在于有时会把下一步写成菜单，第三人称体验略被削弱。",
    strengths: ["间接叙事", "边界稳定", "场景承接"],
    order: 60,
  },
  {
    id: "chat-grounded-roleplay",
    label: "写实对话",
    description: "降低夸张反应和段落推理，优先生成像真人在现场低声回应的角色对白。",
    presentationProfileId: "dialogue-chat",
    systemNarrativePresetId: "balanced",
    promptStyleId: "grounded",
    ruleCompositionId: "none",
    qualityRuleIds: [],
    immersiveDescriptionEnabled: true,
    characterStylePresetId: "natural-roleplay",
    evaluationSummary: "硬指标 0.94 / 内容裁判 0.83。比轻快对话更稳，但 M2.7 仍需防菜单式收尾。",
    codexReviewScore: 82,
    codexReviewNote: "M3 样本像现场低声回应；M2.7 偶尔出现“要么 A 要么 B，你定”，已加禁用提示。",
    strengths: ["真人对白", "克制动作", "即时回应"],
    order: 70,
  },
  {
    id: "chat-character-banter",
    label: "角色对话轻快",
    description: "保留酒馆聊天手感，让角色对白更有反应和可接话的信息量。",
    presentationProfileId: "dialogue-chat",
    systemNarrativePresetId: "balanced",
    promptStyleId: "light-novel",
    ruleCompositionId: "none",
    qualityRuleIds: [],
    immersiveDescriptionEnabled: true,
    characterStylePresetId: "light-banter",
    evaluationSummary: "硬指标 0.91 / 内容裁判 0.79。互动感强，但部分样本偏侦探报告。",
    codexReviewScore: 78,
    codexReviewNote: "不稳定：有时很现场，有时像把线索一次性讲完；适合轻快场景但不作为默认推荐。",
    strengths: ["直接对白", "互动抛接", "轻快节奏"],
    order: 80,
  },
  {
    id: "third-person-grounded-observer",
    label: "第三人称写实观察",
    description: "更克制的第三人称观察者风格，强调行动、空间和可见后果。",
    presentationProfileId: "third-person-prose",
    systemNarrativePresetId: "restrained",
    promptStyleId: "grounded",
    ruleCompositionId: "none",
    qualityRuleIds: [],
    immersiveDescriptionEnabled: true,
    characterStylePresetId: "restrained-realistic",
    evaluationSummary: "硬指标 0.97 / 内容裁判 0.79。动作和空间明确，但第三人称纯度波动更大。",
    codexReviewScore: 82,
    codexReviewNote: "环境和动作扎实；低分样本会退成直接提问或给用户侦查选项。",
    strengths: ["写实动作", "空间明确", "少对白"],
    order: 90,
  },
] satisfies TavernPromptStylePackage[];

export const TAVERN_PROMPT_STYLE_PACKAGES: TavernPromptStylePackage[] = [...tavernPromptStylePackages].sort(
  (left, right) => left.order - right.order || left.label.localeCompare(right.label),
);

export const TAVERN_PROMPT_STYLE_PACKAGE_OPTIONS = TAVERN_PROMPT_STYLE_PACKAGES;

const promptStylePackageIds = new Set(TAVERN_PROMPT_STYLE_PACKAGES.map((stylePackage) => stylePackage.id));

export const normalizeTavernPromptStylePackageId = (value: unknown): TavernPromptStylePackageId =>
  typeof value === "string" && promptStylePackageIds.has(value as TavernPromptStylePackageId)
    ? (value as TavernPromptStylePackageId)
    : DEFAULT_TAVERN_PROMPT_STYLE_PACKAGE_ID;

export const getTavernPromptStylePackage = (value: unknown): TavernPromptStylePackage => {
  const id = normalizeTavernPromptStylePackageId(value);
  return TAVERN_PROMPT_STYLE_PACKAGES.find((stylePackage) => stylePackage.id === id) ?? TAVERN_PROMPT_STYLE_PACKAGES[0];
};

export const createTavernPromptSettingsFromStylePackage = ({
  stylePackageId = DEFAULT_TAVERN_PROMPT_STYLE_PACKAGE_ID,
  presentationProfileId,
}: {
  stylePackageId?: TavernPromptStylePackageId;
  presentationProfileId?: TavernPresentationProfileId;
} = {}): TavernRoomPromptSettings => {
  const stylePackage = getTavernPromptStylePackage(stylePackageId);

  return createDefaultTavernPromptSettings({
    presentationProfileId: presentationProfileId ?? stylePackage.presentationProfileId,
    promptStyleId: stylePackage.promptStyleId,
    systemNarrativePresetId: stylePackage.systemNarrativePresetId,
    ruleCompositionId: stylePackage.ruleCompositionId,
    qualityRuleIds: stylePackage.qualityRuleIds,
    immersiveDescriptionEnabled: stylePackage.immersiveDescriptionEnabled,
  });
};
