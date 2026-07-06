import type { TavernRuleComposition } from "../types";
import { conflictHookRule } from "../hook-rules/conflict-hook";
import { expectationHookRule } from "../hook-rules/expectation-hook";
import { rewardFeedbackHookRule } from "../hook-rules/reward-feedback";
import { maleProgressionGrowthGenreRule } from "../genre-rules/male-progression-growth";
import { webnovelHighDensityNarrativeStyle } from "../narrative-styles/webnovel-high-density";
import { qidianLongformPlatformStyle } from "../platform-styles/qidian-longform";
import { antiAiNaturalQualityRule } from "../quality-rules/anti-ai-natural";
import { conciseNoSummaryQualityRule } from "../quality-rules/concise-no-summary";
import { naturalDialogueQualityRule } from "../quality-rules/natural-dialogue";
import { reduceEmptyAmbienceQualityRule } from "../quality-rules/reduce-empty-ambience";
import { promiseMismatchTabooRule } from "../taboo-rules/promise-mismatch";

export const qidianLongformRuleComposition: TavernRuleComposition = {
  id: "qidian-longform",
  label: "起点长篇",
  description: "平台预期偏长线追读，组合主线期待、升级成长、收获反馈和承诺兑现。",
  platformStyleId: qidianLongformPlatformStyle.id,
  qualityRuleIds: [
    antiAiNaturalQualityRule.id,
    naturalDialogueQualityRule.id,
    conciseNoSummaryQualityRule.id,
    reduceEmptyAmbienceQualityRule.id,
  ],
  narrativeStyleIds: [webnovelHighDensityNarrativeStyle.id],
  genreRuleIds: [maleProgressionGrowthGenreRule.id],
  hookRuleIds: [expectationHookRule.id, rewardFeedbackHookRule.id, conflictHookRule.id],
  tabooRuleIds: [promiseMismatchTabooRule.id],
  selectable: true,
  order: 10,
};
