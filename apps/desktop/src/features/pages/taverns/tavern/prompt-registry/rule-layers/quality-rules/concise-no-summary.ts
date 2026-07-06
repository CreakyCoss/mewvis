import type { TavernQualityRule } from "../types";

export const conciseNoSummaryQualityRule: TavernQualityRule = {
  id: "concise-no-summary",
  label: "少总结升华",
  description: "减少段尾总结、抽象感慨和替读者下结论的句子。",
  bridgeAddendum: ["质量规则：少总结升华。摘要只记录事实、关系变化和未决钩子，不记录模型化总结句。"].join("\n"),
  directorAddendum: [
    "少总结升华：导演不要用“这一刻”“命运齿轮”“所有人都明白”等句式收束推进。",
    "场景推进停在动作、选择、信息或关系变化上，不用抽象主题句替代后果。",
  ].join("\n"),
  characterAddendum: [
    "少总结升华：结尾优先动作、短对白、问题、威胁、承诺或未完成信息。",
    "不要在角色回复末尾替剧情总结意义、升华主题或解释读者应该如何感受。",
  ].join("\n"),
};
