import type { SceneNovelizerPlatformStyleId } from "../types";

export type SceneNovelizerPlatformPackage = {
  id: SceneNovelizerPlatformStyleId;
  label: string;
  shortLabel: string;
  description: string;
  systemInstruction: string;
  writingRules: string[];
  judgeFocus: string[];
};

export const SCENE_NOVELIZER_PLATFORM_PACKAGES: SceneNovelizerPlatformPackage[] = [
  {
    id: "fanqie",
    label: "番茄快节奏",
    shortLabel: "番茄",
    description: "强冲突、短段落、即时反馈，适合把互动场景改成轻阅读章节。",
    systemInstruction: "你是中文番茄系网文改写 agent，擅长把互动记录整理成短段、强反馈、强钩子的连续正文。",
    writingRules: [
      "每 1 到 2 轮素材必须形成一次可感知升级：新压力、时间限制、外部打断、身体代价、关系冲突或线索反转。",
      "用户行动必须有可见后果，不能只让角色继续解释。",
      "单段通常 30 到 100 个中文字符，尽量不要超过 160 字。",
      "对白要短、直接、有反应；不要写成调查报告或会议纪要。",
      "结尾停在明确危险、选择压力或下一步冲突上。",
    ],
    judgeFocus: [
      "是否有快节奏冲突和即时后果。",
      "是否避免室内圆桌调查纪要感。",
      "是否有短段落、低阅读门槛和章尾钩子。",
    ],
  },
  {
    id: "qidian",
    label: "起点长篇",
    shortLabel: "起点",
    description: "主线牵引、势力线、长期代价，适合整理成长篇章节片段。",
    systemInstruction: "你是中文起点系长篇网文改写 agent，擅长把互动场景整理成有主线牵引和长期追读感的连续正文。",
    writingRules: [
      "局部谜题必须牵出更大的主线、势力、资源、身份、规则或阶段目标。",
      "用户行动要成为章节因果链的一环，不要被角色对白淹没。",
      "单段通常 40 到 120 个中文字符，尽量不要超过 180 字。",
      "可以保留较完整的动作、观察和推理链，但必须服务主线压力。",
      "结尾应留下长期代价、路线受阻、势力逼近或下一阶段目标。",
    ],
    judgeFocus: [
      "局部场景是否接到长线主线。",
      "角色是否有功能之外的情感锚点或代价。",
      "结尾是否形成章节追读而非任务交接。",
    ],
  },
];

export const DEFAULT_SCENE_NOVELIZER_PLATFORM_ID: SceneNovelizerPlatformStyleId = "fanqie";

export const getSceneNovelizerPlatformPackage = (value?: SceneNovelizerPlatformStyleId | null) =>
  SCENE_NOVELIZER_PLATFORM_PACKAGES.find((item) => item.id === value) ?? SCENE_NOVELIZER_PLATFORM_PACKAGES[0];
