import type { TavernRuleComposition } from "../types";
import { shortEmotionalStoryGenreRule } from "../genre-rules/short-emotional-story";
import { reversalHealingHookRule } from "../hook-rules/reversal-healing";
import { emotionalPushPullNarrativeStyle } from "../narrative-styles/emotional-push-pull";
import { zhihuYanxuanShortPlatformStyle } from "../platform-styles/zhihu-yanxuan-short";
import { antiAiNaturalQualityRule } from "../quality-rules/anti-ai-natural";
import { conciseNoSummaryQualityRule } from "../quality-rules/concise-no-summary";
import { naturalDialogueQualityRule } from "../quality-rules/natural-dialogue";
import { unearnedReconciliationTabooRule } from "../taboo-rules/unearned-reconciliation";

export const zhihuYanxuanShortRuleComposition: TavernRuleComposition = {
  id: "zhihu-yanxuan-short",
  label: "知乎盐言短篇",
  description: "平台预期偏情绪拉扯、关系刺痛和反转治愈，组合短篇情绪结构。",
  platformStyleId: zhihuYanxuanShortPlatformStyle.id,
  qualityRuleIds: [antiAiNaturalQualityRule.id, naturalDialogueQualityRule.id, conciseNoSummaryQualityRule.id],
  narrativeStyleIds: [emotionalPushPullNarrativeStyle.id],
  genreRuleIds: [shortEmotionalStoryGenreRule.id],
  hookRuleIds: [reversalHealingHookRule.id],
  tabooRuleIds: [unearnedReconciliationTabooRule.id],
  selectable: true,
  order: 40,
};
