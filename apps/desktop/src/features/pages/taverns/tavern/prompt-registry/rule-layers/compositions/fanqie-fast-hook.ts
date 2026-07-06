import type { TavernRuleComposition } from "../types";
import { maleProgressionGrowthGenreRule } from "../genre-rules/male-progression-growth";
import { conflictHookRule } from "../hook-rules/conflict-hook";
import { highConceptPayoffHookRule } from "../hook-rules/high-concept-payoff";
import { rewardFeedbackHookRule } from "../hook-rules/reward-feedback";
import { directCommercialFlowNarrativeStyle } from "../narrative-styles/direct-commercial-flow";
import { webnovelHighDensityNarrativeStyle } from "../narrative-styles/webnovel-high-density";
import { fanqieFastHookPlatformStyle } from "../platform-styles/fanqie-fast-hook";
import { antiAiNaturalQualityRule } from "../quality-rules/anti-ai-natural";
import { conciseNoSummaryQualityRule } from "../quality-rules/concise-no-summary";
import { naturalDialogueQualityRule } from "../quality-rules/natural-dialogue";
import { reduceEmptyAmbienceQualityRule } from "../quality-rules/reduce-empty-ambience";
import { longLoreOverexplainTabooRule } from "../taboo-rules/long-lore-overexplain";
import { slowBuildupTabooRule } from "../taboo-rules/slow-buildup";

export const fanqieFastHookRuleComposition: TavernRuleComposition = {
  id: "fanqie-fast-hook",
  label: "番茄快节奏",
  description: "平台预期偏强钩子、快反馈和爽点直给，组合商业节奏与高概念兑现。",
  platformStyleId: fanqieFastHookPlatformStyle.id,
  qualityRuleIds: [
    antiAiNaturalQualityRule.id,
    naturalDialogueQualityRule.id,
    conciseNoSummaryQualityRule.id,
    reduceEmptyAmbienceQualityRule.id,
  ],
  narrativeStyleIds: [directCommercialFlowNarrativeStyle.id, webnovelHighDensityNarrativeStyle.id],
  genreRuleIds: [maleProgressionGrowthGenreRule.id],
  hookRuleIds: [conflictHookRule.id, rewardFeedbackHookRule.id, highConceptPayoffHookRule.id],
  tabooRuleIds: [slowBuildupTabooRule.id, longLoreOverexplainTabooRule.id],
  selectable: true,
  order: 20,
};
