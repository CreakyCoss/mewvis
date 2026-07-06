import type { TavernRuleComposition } from "../types";
import { femaleRomanceRelationshipGenreRule } from "../genre-rules/female-romance-relationship";
import { expectationHookRule } from "../hook-rules/expectation-hook";
import { reversalHealingHookRule } from "../hook-rules/reversal-healing";
import { delicateDailyNarrativeStyle } from "../narrative-styles/delicate-daily";
import { emotionalPushPullNarrativeStyle } from "../narrative-styles/emotional-push-pull";
import { jinjiangFemalePremiumPlatformStyle } from "../platform-styles/jinjiang-female-premium";
import { antiAiNaturalQualityRule } from "../quality-rules/anti-ai-natural";
import { conciseNoSummaryQualityRule } from "../quality-rules/concise-no-summary";
import { naturalDialogueQualityRule } from "../quality-rules/natural-dialogue";
import { reduceEmptyAmbienceQualityRule } from "../quality-rules/reduce-empty-ambience";
import { femaleValuesDriftTabooRule } from "../taboo-rules/female-values-drift";
import { promiseMismatchTabooRule } from "../taboo-rules/promise-mismatch";

export const jinjiangFemalePremiumRuleComposition: TavernRuleComposition = {
  id: "jinjiang-female-premium",
  label: "晋江精品女频",
  description: "平台预期偏人设关系和情感层次，组合细腻日常、女频感情线与三观边界。",
  platformStyleId: jinjiangFemalePremiumPlatformStyle.id,
  qualityRuleIds: [
    antiAiNaturalQualityRule.id,
    naturalDialogueQualityRule.id,
    conciseNoSummaryQualityRule.id,
    reduceEmptyAmbienceQualityRule.id,
  ],
  narrativeStyleIds: [
    delicateDailyNarrativeStyle.id,
    emotionalPushPullNarrativeStyle.id,
  ],
  genreRuleIds: [femaleRomanceRelationshipGenreRule.id],
  hookRuleIds: [
    expectationHookRule.id,
    reversalHealingHookRule.id,
  ],
  tabooRuleIds: [
    femaleValuesDriftTabooRule.id,
    promiseMismatchTabooRule.id,
  ],
  selectable: true,
  order: 30,
};
