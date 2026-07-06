import type { TavernGenreRule } from "../types";

export const maleProgressionGrowthGenreRule: TavernGenreRule = {
  id: "male-progression-growth",
  label: "男频升级成长",
  description: "围绕目标、阻力、能力成长、资源收益和阶段压迫推进。",
  bridgeAddendum: "题材规则：男频升级成长。摘要保留主线目标、能力体系、资源收益、阻力层级和阶段性对手。",
  directorAddendum: [
    "男频升级成长：每轮尽量保持主线目标、能力成长、资源收益或对手压力中的至少一项可见。",
    "爽点释放前先建立期待、阻力和反差；释放后给出奖励、代价或更高层级问题。",
  ].join("\n"),
  characterAddendum: [
    "男频升级成长：对白要让读者看懂目标、阻力和收益。",
    "能力、资源和身份反馈要具体，不用空泛地说角色变强。",
  ].join("\n"),
};
