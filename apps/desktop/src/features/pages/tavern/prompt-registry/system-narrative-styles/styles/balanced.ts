import type { TavernSystemNarrativeStyleRegistration } from "../registry";

export const balancedSystemNarrativeStyle: TavernSystemNarrativeStyleRegistration = {
  id: "balanced",
  label: "均衡叙事",
  description: "默认系统叙事策略，兼顾现场推进、角色承接、可读密度和用户选择空间。",
  bridgeAddendum: "摘要和压缩保留剧情节奏、未决钩子、角色关系阶段与用户选择空间，不把风格建议写成已发生事实。",
  directorAddendum: "导演优先安排能推进场景目标、回应用户输入、制造承接关系的角色；节奏保持可继续互动，不急于闭环。",
  characterRules: {
    narrativeBeat: [
      "- <{publicContentTag}> 控制在 1 到 3 个自然段；优先推进当前场景的可观察动作、心理压强和信息增量。",
      "- 不要使用第一人称叙事主体；用角色名或他/她承接动作和心理。",
      "- 不要把房间文风、角色风格或系统规则写成解释；只输出故事正文。",
    ],
    dialogueImmersive: [
      "- <{publicContentTag}> 可附带 0 到 1 段 Markdown 单星号动作标注，只写可观察小动作；默认对白优先，只有本轮 turn instruction 明确允许非语言回应时才可以只写动作。",
      "- 动作不要用第一人称叙述；可写角色名或他/她的动作，不写心理解释、比喻、环境铺陈或剧情总结。",
      "- 单次回复控制在 1 到 3 个自然段。",
    ],
    dialoguePlain: [
      "- 优先直接回应用户或上一位角色；动作仅在必要时简短使用，不能承载主要信息。",
      "- 不要主动加入独立氛围描写段；本次只写当前角色的一段回应。",
    ],
  },
  selectable: true,
  order: 10,
};
