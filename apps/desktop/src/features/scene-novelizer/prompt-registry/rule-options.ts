import {
  TAVERN_GENRE_RULES,
  TAVERN_HOOK_RULES,
  TAVERN_NARRATIVE_STYLES,
  TAVERN_QUALITY_RULES,
  TAVERN_TABOO_RULES,
} from "@/features/pages/tavern/prompt-registry/rule-layers/resolver";
import type {
  SceneNovelizerPlatformStyleId,
  SceneNovelizerRuleCategory,
  SceneNovelizerRuleOptionId,
} from "../types";

type RuleLike = {
  id: string;
  label: string;
  description: string;
  directorAddendum: string;
  characterAddendum: string;
};

export type SceneNovelizerRuleOption = {
  id: SceneNovelizerRuleOptionId;
  category: SceneNovelizerRuleCategory;
  label: string;
  description: string;
  writingRules: string[];
  judgeFocus: string[];
  defaultForPlatforms: SceneNovelizerPlatformStyleId[];
};

export const SCENE_NOVELIZER_RULE_CATEGORY_LABELS = {
  quality: "质量",
  narrative: "叙事",
  genre: "题材",
  hook: "钩子",
  taboo: "避雷",
} satisfies Record<SceneNovelizerRuleCategory, string>;

const DEFAULT_RULE_IDS_BY_PLATFORM: Record<SceneNovelizerPlatformStyleId, string[]> = {
  fanqie: [
    "anti-ai-natural",
    "natural-dialogue",
    "concise-no-summary",
    "reduce-empty-ambience",
    "direct-commercial-flow",
    "webnovel-high-density",
    "male-progression-growth",
    "conflict-hook",
    "reward-feedback",
    "high-concept-payoff",
    "slow-buildup",
    "long-lore-overexplain",
  ],
  qidian: [
    "anti-ai-natural",
    "natural-dialogue",
    "concise-no-summary",
    "reduce-empty-ambience",
    "webnovel-high-density",
    "male-progression-growth",
    "expectation-hook",
    "reward-feedback",
    "conflict-hook",
    "promise-mismatch",
  ],
};

const splitPromptLines = (text: string) =>
  text
    .split(/\n+/u)
    .map((line) => line.trim().replace(/^[-\s]+/u, ""))
    .filter(Boolean);

const defaultPlatformsForRule = (ruleId: string): SceneNovelizerPlatformStyleId[] =>
  (Object.entries(DEFAULT_RULE_IDS_BY_PLATFORM) as Array<[SceneNovelizerPlatformStyleId, string[]]>)
    .flatMap(([platformStyleId, ruleIds]) =>
      ruleIds.includes(ruleId) ? [platformStyleId] : []
    );

const createRuleOption = (
  category: SceneNovelizerRuleCategory,
  rule: RuleLike,
): SceneNovelizerRuleOption => ({
  id: rule.id,
  category,
  label: rule.label,
  description: rule.description,
  writingRules: [
    ...splitPromptLines(rule.directorAddendum),
    ...splitPromptLines(rule.characterAddendum),
  ],
  judgeFocus: [rule.description],
  defaultForPlatforms: defaultPlatformsForRule(rule.id),
});

export const SCENE_NOVELIZER_RULE_OPTIONS: SceneNovelizerRuleOption[] = [
  ...TAVERN_QUALITY_RULES.map((rule) => createRuleOption("quality", rule)),
  ...TAVERN_NARRATIVE_STYLES.map((rule) => createRuleOption("narrative", rule)),
  ...TAVERN_GENRE_RULES.map((rule) => createRuleOption("genre", rule)),
  ...TAVERN_HOOK_RULES.map((rule) => createRuleOption("hook", rule)),
  ...TAVERN_TABOO_RULES.map((rule) => createRuleOption("taboo", rule)),
];

const SCENE_NOVELIZER_RULE_OPTION_BY_ID = new Map(
  SCENE_NOVELIZER_RULE_OPTIONS.map((option) => [option.id, option] as const),
);

export const normalizeSceneNovelizerRuleOptionIds = (
  value: unknown,
): SceneNovelizerRuleOptionId[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.flatMap((item) =>
    typeof item === "string" && SCENE_NOVELIZER_RULE_OPTION_BY_ID.has(item)
      ? [item]
      : []
  )));
};

export const getSceneNovelizerRuleOptions = (
  value: unknown,
): SceneNovelizerRuleOption[] =>
  normalizeSceneNovelizerRuleOptionIds(value)
    .map((id) => SCENE_NOVELIZER_RULE_OPTION_BY_ID.get(id))
    .filter((option): option is SceneNovelizerRuleOption => Boolean(option));

export const getDefaultSceneNovelizerRuleOptionIds = (
  platformStyleId: SceneNovelizerPlatformStyleId,
): SceneNovelizerRuleOptionId[] =>
  normalizeSceneNovelizerRuleOptionIds(DEFAULT_RULE_IDS_BY_PLATFORM[platformStyleId]);
