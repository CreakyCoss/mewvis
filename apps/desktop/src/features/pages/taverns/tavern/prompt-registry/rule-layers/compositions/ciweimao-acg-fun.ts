import type { TavernRuleComposition } from "../types";
import { acgCharacterFunGenreRule } from "../genre-rules/acg-character-fun";
import { conflictHookRule } from "../hook-rules/conflict-hook";
import { expectationHookRule } from "../hook-rules/expectation-hook";
import { lightNovelBanterNarrativeStyle } from "../narrative-styles/light-novel-banter";
import { ciweimaoAcgFunPlatformStyle } from "../platform-styles/ciweimao-acg-fun";
import { conciseNoSummaryQualityRule } from "../quality-rules/concise-no-summary";
import { naturalDialogueQualityRule } from "../quality-rules/natural-dialogue";
import { longLoreOverexplainTabooRule } from "../taboo-rules/long-lore-overexplain";

export const ciweimaoAcgFunRuleComposition: TavernRuleComposition = {
  id: "ciweimao-acg-fun",
  label: "刺猬猫二次元整活",
  description: "平台预期偏二游/同人语境、人设和玩梗，组合轻小说吐槽与二次元人设规则。",
  platformStyleId: ciweimaoAcgFunPlatformStyle.id,
  qualityRuleIds: [
    naturalDialogueQualityRule.id,
    conciseNoSummaryQualityRule.id,
  ],
  narrativeStyleIds: [lightNovelBanterNarrativeStyle.id],
  genreRuleIds: [acgCharacterFunGenreRule.id],
  hookRuleIds: [
    expectationHookRule.id,
    conflictHookRule.id,
  ],
  tabooRuleIds: [longLoreOverexplainTabooRule.id],
  selectable: true,
  order: 70,
};
