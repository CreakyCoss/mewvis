import type { TavernQualityRule } from "../types";

export const antiAiNaturalQualityRule: TavernQualityRule = {
  id: "anti-ai-natural",
  label: "去 AI 味",
  description: "减少模板化修辞、机械对话标签和总结升华，让文字更自然。",
  bridgeAddendum: ["质量规则：去 AI 味。摘要时不要把模型化表达、修辞模板或总结升华误当作稳定剧情事实。"].join("\n"),
  directorAddendum: [
    "去 AI 味：导演不要反复安排空气安静、所有人沉默、总结升华或抽象感慨作为推进。",
    "旁白优先使用可观察动作、场面变化和具体后果，不用“这一刻”“他明白了”“命运齿轮”等总结句。",
    "避免连续排比和过度工整的调度理由；保留一点口语、停顿和不完整感。",
  ].join("\n"),
  characterAddendum: [
    "去 AI 味：减少“眼中闪过一丝”“嘴角勾起一抹”“心中涌起”“深吸一口气”“仿佛/宛若”等模板化表达。",
    "心理活动优先外化成动作、停顿、回避、打断、短句或具体细节；少直接说“他感到很紧张/愤怒/失落”。",
    "对白不必句句完整解释动机；可用动作代替“说道/问道”，结尾优先动作或可回应的话，不写总结升华。",
  ].join("\n"),
};
