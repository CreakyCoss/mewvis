import type { TavernRuleComposition } from "../types";
import { nonePlatformStyle } from "../platform-styles/none";

export const noneRuleComposition: TavernRuleComposition = {
  id: "none",
  label: "不指定平台",
  description: "不额外组合平台化写作规则，仅使用呈现规则、叙事预设和酒馆风格。",
  platformStyleId: nonePlatformStyle.id,
  qualityRuleIds: [],
  narrativeStyleIds: [],
  genreRuleIds: [],
  hookRuleIds: [],
  tabooRuleIds: [],
  selectable: true,
  order: 0,
};
