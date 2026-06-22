import type { TavernPlatformStyle } from "../types";

export const nonePlatformStyle: TavernPlatformStyle = {
  id: "none",
  label: "不指定平台",
  description: "不额外套用发布平台偏好，仅使用呈现规则、叙事预设和酒馆风格。",
  bridgeAddendum: "不附加平台化写作偏好。",
  directorAddendum: "不附加平台化调度偏好；按房间目标和角色动机推进。",
  characterAddendum: "不附加平台化文风约束；按角色设定与当前叙事预设输出。",
};
