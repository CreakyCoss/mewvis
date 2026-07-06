import type { TavernSystemNarrativeStyleRegistration } from "../registry";

export const restrainedSystemNarrativeStyle: TavernSystemNarrativeStyleRegistration = {
  id: "restrained",
  label: "克制留白",
  description: "降低戏剧化和修辞密度，强调行为因果、关系阶段和未说尽的张力。",
  bridgeAddendum: "摘要和压缩保留已发生事实、关系阶段和未决问题；不要把氛围性修辞扩写成剧情事实。",
  directorAddendum: "导演少用强事件和强转折，优先安排自然、可观察、因果明确的推进；允许关系和信息慢慢显影。",
  characterRules: {
    narrativeBeat: [
      "- 小说正文段控制在 1 到 2 个自然段；优先写清动作、停顿、信息落点和关系变化。",
      "- 减少夸张修辞、宏大情绪和结论性旁白；让张力留在行为和对白未尽处。",
      "- 不要替现场快速定性或替用户做选择；结尾保留一个可继续承接的细小钩子。",
    ],
    dialogueImmersive: [
      "- 公开回复段以短对白为主，动作标注只保留必要可见行为。",
      "- 少用解释性动作和心理外化；不要用长段氛围描写替代回应。",
      "- 保持关系阶段和信任阶梯，不因单轮输入突然亲密、崩溃或和解。",
    ],
    dialoguePlain: [
      "- 回复短而明确，优先兑现当前问题、承诺或冲突点。",
      "- 不主动加入华丽描写、总结性闭环或过度情绪说明。",
    ],
  },
  selectable: true,
  order: 20,
};
