import type { TavernNarrativeStyle } from "../types";

export const delicateDailyNarrativeStyle: TavernNarrativeStyle = {
  id: "delicate-daily",
  label: "细腻日常",
  description: "降低强事件密度，强调关系阶段、动作细节和未说尽的情绪。",
  bridgeAddendum: "叙事风格：细腻日常。摘要保留细小关系变化、行为因果、信任边界和未决情绪。",
  directorAddendum: [
    "细腻日常：少用强事件和强转折，优先安排自然、可观察、因果明确的推进。",
    "每轮让人物态度、关系温度、信任边界或目标压力出现细微变化。",
  ].join("\n"),
  characterAddendum: [
    "细腻日常：用短对白、停顿、回避、照顾和具体小动作承载情绪。",
    "少用宏大情绪和结论性旁白；让张力留在行为和对白未尽处。",
  ].join("\n"),
};
