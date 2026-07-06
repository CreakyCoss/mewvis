import type { TavernRuleComposition } from "../types";
import { conflictHookRule } from "../hook-rules/conflict-hook";
import { topicResonanceHookRule } from "../hook-rules/topic-resonance";
import { directCommercialFlowNarrativeStyle } from "../narrative-styles/direct-commercial-flow";
import { xiaohongshuTopicStoryPlatformStyle } from "../platform-styles/xiaohongshu-topic-story";
import { antiAiNaturalQualityRule } from "../quality-rules/anti-ai-natural";
import { conciseNoSummaryQualityRule } from "../quality-rules/concise-no-summary";
import { naturalDialogueQualityRule } from "../quality-rules/natural-dialogue";
import { reduceEmptyAmbienceQualityRule } from "../quality-rules/reduce-empty-ambience";
import { longLoreOverexplainTabooRule } from "../taboo-rules/long-lore-overexplain";

export const xiaohongshuTopicStoryRuleComposition: TavernRuleComposition = {
  id: "xiaohongshu-topic-story",
  label: "小红书话题故事",
  description: "平台预期偏话题性、共鸣感和可讨论选择，组合短场景与现实话题钩子。",
  platformStyleId: xiaohongshuTopicStoryPlatformStyle.id,
  qualityRuleIds: [
    antiAiNaturalQualityRule.id,
    naturalDialogueQualityRule.id,
    conciseNoSummaryQualityRule.id,
    reduceEmptyAmbienceQualityRule.id,
  ],
  narrativeStyleIds: [directCommercialFlowNarrativeStyle.id],
  genreRuleIds: [],
  hookRuleIds: [topicResonanceHookRule.id, conflictHookRule.id],
  tabooRuleIds: [longLoreOverexplainTabooRule.id],
  selectable: true,
  order: 50,
};
