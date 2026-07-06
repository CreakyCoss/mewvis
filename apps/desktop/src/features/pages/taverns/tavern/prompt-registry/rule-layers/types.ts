export type TavernPlatformStyleId =
  | "none"
  | "qidian-longform"
  | "fanqie-fast-hook"
  | "jinjiang-female-premium"
  | "zhihu-yanxuan-short"
  | "xiaohongshu-topic-story"
  | "feilu-high-concept"
  | "ciweimao-acg-fun";

export type TavernQualityRuleId =
  "anti-ai-natural" | "natural-dialogue" | "concise-no-summary" | "reduce-empty-ambience";

export type TavernNarrativeStyleId =
  "webnovel-high-density" | "emotional-push-pull" | "light-novel-banter" | "delicate-daily" | "direct-commercial-flow";

export type TavernGenreRuleId =
  "female-romance-relationship" | "male-progression-growth" | "short-emotional-story" | "acg-character-fun";

export type TavernHookRuleId =
  | "conflict-hook"
  | "expectation-hook"
  | "reward-feedback"
  | "reversal-healing"
  | "topic-resonance"
  | "high-concept-payoff";

export type TavernTabooRuleId =
  | "feilu-toxic-points"
  | "female-values-drift"
  | "promise-mismatch"
  | "slow-buildup"
  | "long-lore-overexplain"
  | "unearned-reconciliation";

export type TavernPromptRuleDefinition<TId extends string> = {
  id: TId;
  label: string;
  description: string;
  bridgeAddendum: string;
  directorAddendum: string;
  characterAddendum: string;
};

export type TavernPlatformStyle = TavernPromptRuleDefinition<TavernPlatformStyleId>;

export type TavernQualityRule = TavernPromptRuleDefinition<TavernQualityRuleId>;

export type TavernNarrativeStyle = TavernPromptRuleDefinition<TavernNarrativeStyleId>;

export type TavernGenreRule = TavernPromptRuleDefinition<TavernGenreRuleId>;

export type TavernHookRule = TavernPromptRuleDefinition<TavernHookRuleId>;

export type TavernTabooRule = TavernPromptRuleDefinition<TavernTabooRuleId>;

export type TavernRuleComposition = {
  id: TavernPlatformStyleId;
  label: string;
  description: string;
  platformStyleId: TavernPlatformStyleId;
  qualityRuleIds?: TavernQualityRuleId[];
  narrativeStyleIds?: TavernNarrativeStyleId[];
  genreRuleIds?: TavernGenreRuleId[];
  hookRuleIds?: TavernHookRuleId[];
  tabooRuleIds?: TavernTabooRuleId[];
  selectable?: boolean;
  order?: number;
};
