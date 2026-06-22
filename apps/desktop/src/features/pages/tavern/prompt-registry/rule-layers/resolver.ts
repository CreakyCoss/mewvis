import { ciweimaoAcgFunRuleComposition } from "./compositions/ciweimao-acg-fun";
import { fanqieFastHookRuleComposition } from "./compositions/fanqie-fast-hook";
import { feiluHighConceptRuleComposition } from "./compositions/feilu-high-concept";
import { jinjiangFemalePremiumRuleComposition } from "./compositions/jinjiang-female-premium";
import { noneRuleComposition } from "./compositions/none";
import { qidianLongformRuleComposition } from "./compositions/qidian-longform";
import { xiaohongshuTopicStoryRuleComposition } from "./compositions/xiaohongshu-topic-story";
import { zhihuYanxuanShortRuleComposition } from "./compositions/zhihu-yanxuan-short";
import { acgCharacterFunGenreRule } from "./genre-rules/acg-character-fun";
import { femaleRomanceRelationshipGenreRule } from "./genre-rules/female-romance-relationship";
import { maleProgressionGrowthGenreRule } from "./genre-rules/male-progression-growth";
import { shortEmotionalStoryGenreRule } from "./genre-rules/short-emotional-story";
import { conflictHookRule } from "./hook-rules/conflict-hook";
import { expectationHookRule } from "./hook-rules/expectation-hook";
import { highConceptPayoffHookRule } from "./hook-rules/high-concept-payoff";
import { reversalHealingHookRule } from "./hook-rules/reversal-healing";
import { rewardFeedbackHookRule } from "./hook-rules/reward-feedback";
import { topicResonanceHookRule } from "./hook-rules/topic-resonance";
import { delicateDailyNarrativeStyle } from "./narrative-styles/delicate-daily";
import { directCommercialFlowNarrativeStyle } from "./narrative-styles/direct-commercial-flow";
import { emotionalPushPullNarrativeStyle } from "./narrative-styles/emotional-push-pull";
import { lightNovelBanterNarrativeStyle } from "./narrative-styles/light-novel-banter";
import { webnovelHighDensityNarrativeStyle } from "./narrative-styles/webnovel-high-density";
import { ciweimaoAcgFunPlatformStyle } from "./platform-styles/ciweimao-acg-fun";
import { fanqieFastHookPlatformStyle } from "./platform-styles/fanqie-fast-hook";
import { feiluHighConceptPlatformStyle } from "./platform-styles/feilu-high-concept";
import { jinjiangFemalePremiumPlatformStyle } from "./platform-styles/jinjiang-female-premium";
import { nonePlatformStyle } from "./platform-styles/none";
import { qidianLongformPlatformStyle } from "./platform-styles/qidian-longform";
import { xiaohongshuTopicStoryPlatformStyle } from "./platform-styles/xiaohongshu-topic-story";
import { zhihuYanxuanShortPlatformStyle } from "./platform-styles/zhihu-yanxuan-short";
import { antiAiNaturalQualityRule } from "./quality-rules/anti-ai-natural";
import { conciseNoSummaryQualityRule } from "./quality-rules/concise-no-summary";
import { naturalDialogueQualityRule } from "./quality-rules/natural-dialogue";
import { reduceEmptyAmbienceQualityRule } from "./quality-rules/reduce-empty-ambience";
import { feiluToxicPointsTabooRule } from "./taboo-rules/feilu-toxic-points";
import { femaleValuesDriftTabooRule } from "./taboo-rules/female-values-drift";
import { longLoreOverexplainTabooRule } from "./taboo-rules/long-lore-overexplain";
import { promiseMismatchTabooRule } from "./taboo-rules/promise-mismatch";
import { slowBuildupTabooRule } from "./taboo-rules/slow-buildup";
import { unearnedReconciliationTabooRule } from "./taboo-rules/unearned-reconciliation";
import type {
  TavernGenreRule,
  TavernGenreRuleId,
  TavernHookRule,
  TavernHookRuleId,
  TavernNarrativeStyle,
  TavernNarrativeStyleId,
  TavernPlatformStyle,
  TavernPlatformStyleId,
  TavernQualityRule,
  TavernQualityRuleId,
  TavernRuleComposition,
  TavernTabooRule,
  TavernTabooRuleId,
} from "./types";

export const DEFAULT_TAVERN_RULE_COMPOSITION_ID: TavernPlatformStyleId = "none";

export const TAVERN_PLATFORM_STYLES: TavernPlatformStyle[] = [
  nonePlatformStyle,
  qidianLongformPlatformStyle,
  fanqieFastHookPlatformStyle,
  jinjiangFemalePremiumPlatformStyle,
  zhihuYanxuanShortPlatformStyle,
  xiaohongshuTopicStoryPlatformStyle,
  feiluHighConceptPlatformStyle,
  ciweimaoAcgFunPlatformStyle,
];

export const TAVERN_QUALITY_RULES: TavernQualityRule[] = [
  antiAiNaturalQualityRule,
  naturalDialogueQualityRule,
  conciseNoSummaryQualityRule,
  reduceEmptyAmbienceQualityRule,
];

export const TAVERN_NARRATIVE_STYLES: TavernNarrativeStyle[] = [
  webnovelHighDensityNarrativeStyle,
  emotionalPushPullNarrativeStyle,
  lightNovelBanterNarrativeStyle,
  delicateDailyNarrativeStyle,
  directCommercialFlowNarrativeStyle,
];

export const TAVERN_GENRE_RULES: TavernGenreRule[] = [
  femaleRomanceRelationshipGenreRule,
  maleProgressionGrowthGenreRule,
  shortEmotionalStoryGenreRule,
  acgCharacterFunGenreRule,
];

export const TAVERN_HOOK_RULES: TavernHookRule[] = [
  conflictHookRule,
  expectationHookRule,
  rewardFeedbackHookRule,
  reversalHealingHookRule,
  topicResonanceHookRule,
  highConceptPayoffHookRule,
];

export const TAVERN_TABOO_RULES: TavernTabooRule[] = [
  feiluToxicPointsTabooRule,
  femaleValuesDriftTabooRule,
  promiseMismatchTabooRule,
  slowBuildupTabooRule,
  longLoreOverexplainTabooRule,
  unearnedReconciliationTabooRule,
];

export const TAVERN_RULE_COMPOSITIONS: TavernRuleComposition[] = [
  noneRuleComposition,
  qidianLongformRuleComposition,
  fanqieFastHookRuleComposition,
  jinjiangFemalePremiumRuleComposition,
  zhihuYanxuanShortRuleComposition,
  xiaohongshuTopicStoryRuleComposition,
  feiluHighConceptRuleComposition,
  ciweimaoAcgFunRuleComposition,
].sort((left, right) =>
  (left.order ?? 0) - (right.order ?? 0)
  || left.label.localeCompare(right.label)
);

export const TAVERN_RULE_COMPOSITION_OPTIONS = TAVERN_RULE_COMPOSITIONS
  .filter((composition) => composition.selectable !== false);

const flattenValues = (value: unknown): unknown[] => Array.isArray(value)
  ? value.flatMap(flattenValues)
  : [value];

const createDefinitionMap = <TDefinition extends { id: string }>(
  definitions: TDefinition[],
): Map<TDefinition["id"], TDefinition> => new Map(
  definitions.map((definition) => [definition.id, definition] as const),
);

const TAVERN_PLATFORM_STYLE_BY_ID = createDefinitionMap(TAVERN_PLATFORM_STYLES);
const TAVERN_QUALITY_RULE_BY_ID = createDefinitionMap(TAVERN_QUALITY_RULES);
const TAVERN_NARRATIVE_STYLE_BY_ID = createDefinitionMap(TAVERN_NARRATIVE_STYLES);
const TAVERN_GENRE_RULE_BY_ID = createDefinitionMap(TAVERN_GENRE_RULES);
const TAVERN_HOOK_RULE_BY_ID = createDefinitionMap(TAVERN_HOOK_RULES);
const TAVERN_TABOO_RULE_BY_ID = createDefinitionMap(TAVERN_TABOO_RULES);
const TAVERN_RULE_COMPOSITION_BY_ID = createDefinitionMap(TAVERN_RULE_COMPOSITIONS);

const normalizeDefinitionIds = <TId extends string>(
  value: unknown,
  definitions: Map<TId, unknown>,
): TId[] => Array.from(new Set(flattenValues(value).flatMap((candidate) =>
  typeof candidate === "string" && definitions.has(candidate as TId)
    ? [candidate as TId]
    : []
)));

const resolveDefinitions = <TId extends string, TDefinition extends { id: TId }>(
  value: unknown,
  definitions: Map<TId, TDefinition>,
): TDefinition[] => normalizeDefinitionIds(value, definitions)
  .map((id) => definitions.get(id))
  .filter((definition): definition is TDefinition => Boolean(definition));

export const normalizeTavernRuleCompositionId = (
  value: unknown,
): TavernPlatformStyleId => typeof value === "string"
  && TAVERN_RULE_COMPOSITION_BY_ID.has(value as TavernPlatformStyleId)
  ? value as TavernPlatformStyleId
  : DEFAULT_TAVERN_RULE_COMPOSITION_ID;

export const normalizeTavernQualityRuleIds = (
  value: unknown,
): TavernQualityRuleId[] => normalizeDefinitionIds(
  value,
  TAVERN_QUALITY_RULE_BY_ID,
);

export const getTavernRuleComposition = (
  value: unknown,
): TavernRuleComposition => TAVERN_RULE_COMPOSITION_BY_ID.get(
  normalizeTavernRuleCompositionId(value),
) ?? noneRuleComposition;

export const getTavernPlatformStyle = (
  value: unknown,
): TavernPlatformStyle => typeof value === "string"
  ? TAVERN_PLATFORM_STYLE_BY_ID.get(value as TavernPlatformStyleId) ?? nonePlatformStyle
  : nonePlatformStyle;

export type TavernPromptRuleGroups = {
  qualityRules: TavernQualityRule[];
  narrativeStyles: TavernNarrativeStyle[];
  genreRules: TavernGenreRule[];
  hookRules: TavernHookRule[];
  tabooRules: TavernTabooRule[];
};

export type TavernPromptRuleStack = {
  composition: TavernRuleComposition;
  platformStyle: TavernPlatformStyle;
  ruleGroups: TavernPromptRuleGroups;
};

export const resolveTavernPromptRuleStack = ({
  compositionId,
  qualityRuleIds,
}: {
  compositionId: unknown;
  qualityRuleIds?: unknown;
}): TavernPromptRuleStack => {
  const composition = getTavernRuleComposition(compositionId);

  return {
    composition,
    platformStyle: getTavernPlatformStyle(composition.platformStyleId),
    ruleGroups: {
      qualityRules: resolveDefinitions<TavernQualityRuleId, TavernQualityRule>([
        composition.qualityRuleIds,
        qualityRuleIds,
      ], TAVERN_QUALITY_RULE_BY_ID),
      narrativeStyles: resolveDefinitions<TavernNarrativeStyleId, TavernNarrativeStyle>(
        composition.narrativeStyleIds,
        TAVERN_NARRATIVE_STYLE_BY_ID,
      ),
      genreRules: resolveDefinitions<TavernGenreRuleId, TavernGenreRule>(
        composition.genreRuleIds,
        TAVERN_GENRE_RULE_BY_ID,
      ),
      hookRules: resolveDefinitions<TavernHookRuleId, TavernHookRule>(
        composition.hookRuleIds,
        TAVERN_HOOK_RULE_BY_ID,
      ),
      tabooRules: resolveDefinitions<TavernTabooRuleId, TavernTabooRule>(
        composition.tabooRuleIds,
        TAVERN_TABOO_RULE_BY_ID,
      ),
    },
  };
};
