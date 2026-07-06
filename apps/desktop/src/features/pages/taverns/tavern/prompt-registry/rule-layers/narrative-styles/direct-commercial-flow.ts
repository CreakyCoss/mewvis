import type { TavernNarrativeStyle } from "../types";

export const directCommercialFlowNarrativeStyle: TavernNarrativeStyle = {
  id: "direct-commercial-flow",
  label: "商业直给",
  description: "卖点直接、反馈明确、节奏偏快，减少慢铺垫和绕行解释。",
  bridgeAddendum: "叙事风格：商业直给。摘要保留热点卖点、身份差、关系钩子、阶段任务和即时反馈。",
  directorAddendum: [
    "商业直给：每轮尽量让读者看到明确卖点推进，如身份揭示、感情进展、任务突破或关系反转。",
    "节奏偏快，少做大段心理铺垫；用事件、对话和短动作呈现人物关系。",
  ].join("\n"),
  characterAddendum: [
    "商业直给：角色表达直接有效，情绪、目标和关系立场要能快速被读者理解。",
    "对白可带强标签和强关系感，但不要把角色写成只会解释设定。",
  ].join("\n"),
};
