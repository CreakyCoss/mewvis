import type { TavernQualityRule } from "../types";

export const naturalDialogueQualityRule: TavernQualityRule = {
  id: "natural-dialogue",
  label: "对白自然化",
  description: "减少机械对话标签和说明书式动机解释，让角色说话更像真人。",
  bridgeAddendum: [
    "质量规则：对白自然化。摘要时不要把口癖、语气词或临场停顿误记成稳定设定，除非反复出现且符合角色。",
  ].join("\n"),
  directorAddendum: [
    "对白自然化：导演调度时给角色留出短句、打断、试探和回避空间，不要求每个角色完整解释动机。",
    "少安排所有人轮流发表完整观点；优先制造可被接住的半句话、动作和具体问题。",
  ].join("\n"),
  characterAddendum: [
    "对白自然化：对白不必句句完整，可有停顿、反问、省略和口语，但必须符合角色口吻。",
    "减少“说道/问道/解释道”的机械标签；能用动作承接时就用动作承接。",
    "角色不要把自己的全部动机、过往和情绪一次说尽。",
  ].join("\n"),
};
