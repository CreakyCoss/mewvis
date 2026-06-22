import type { TavernNarrativeStyle } from "../types";

export const emotionalPushPullNarrativeStyle: TavernNarrativeStyle = {
  id: "emotional-push-pull",
  label: "情绪拉扯",
  description: "强化甜虐交替、误会靠近、试探护短和阶段性治愈。",
  bridgeAddendum: "叙事风格：情绪拉扯。摘要保留情感拉扯、甜虐转折、误会来源、修罗场压力和阶段性治愈点。",
  directorAddendum: [
    "情绪拉扯：推进要有清晰情绪波动，甜与虐、误会与靠近、压迫与治愈交替出现。",
    "感情线优先制造可感知的拉扯：吃醋、试探、护短、误会、隐忍、追悔或选择压力。",
  ].join("\n"),
  characterAddendum: [
    "情绪拉扯：对白要让情绪张力外显，短句、反问、停顿和动作可用于制造拉扯。",
    "人物反应围绕爱、恨、愧疚、占有、隐忍或自尊展开时，要有明确触发物。",
  ].join("\n"),
};
