import type { TavernRuleComposition } from "../types";
import { maleProgressionGrowthGenreRule } from "../genre-rules/male-progression-growth";
import { conflictHookRule } from "../hook-rules/conflict-hook";
import { expectationHookRule } from "../hook-rules/expectation-hook";
import { highConceptPayoffHookRule } from "../hook-rules/high-concept-payoff";
import { rewardFeedbackHookRule } from "../hook-rules/reward-feedback";
import { directCommercialFlowNarrativeStyle } from "../narrative-styles/direct-commercial-flow";
import { webnovelHighDensityNarrativeStyle } from "../narrative-styles/webnovel-high-density";
import { feiluHighConceptPlatformStyle } from "../platform-styles/feilu-high-concept";
import { conciseNoSummaryQualityRule } from "../quality-rules/concise-no-summary";
import { reduceEmptyAmbienceQualityRule } from "../quality-rules/reduce-empty-ambience";
import { feiluToxicPointsTabooRule } from "../taboo-rules/feilu-toxic-points";
import { slowBuildupTabooRule } from "../taboo-rules/slow-buildup";

export const feiluHighConceptRuleComposition: TavernRuleComposition = {
  id: "feilu-high-concept",
  label: "飞卢高概念爽文",
  description: "平台预期偏高概念、强期待和收获感，组合飞卢毒点约束。",
  platformStyleId: feiluHighConceptPlatformStyle.id,
  qualityRuleIds: [
    conciseNoSummaryQualityRule.id,
    reduceEmptyAmbienceQualityRule.id,
  ],
  narrativeStyleIds: [
    webnovelHighDensityNarrativeStyle.id,
    directCommercialFlowNarrativeStyle.id,
  ],
  genreRuleIds: [maleProgressionGrowthGenreRule.id],
  hookRuleIds: [
    highConceptPayoffHookRule.id,
    expectationHookRule.id,
    rewardFeedbackHookRule.id,
    conflictHookRule.id,
  ],
  tabooRuleIds: [
    feiluToxicPointsTabooRule.id,
    slowBuildupTabooRule.id,
  ],
  selectable: true,
  order: 60,
};
