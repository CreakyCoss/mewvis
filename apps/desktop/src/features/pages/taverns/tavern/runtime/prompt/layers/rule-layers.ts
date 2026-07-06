import type { TavernPromptRuleGroups } from "../../../prompt-registry/rule-layers/resolver";
import type { TavernPromptSection } from "../shared/sections";

type TavernPromptRuleTarget = "bridge" | "character" | "director";

type TavernPromptRuleLike = {
  id: string;
  label: string;
  description: string;
  bridgeAddendum: string;
  directorAddendum: string;
  characterAddendum: string;
};

type TavernPromptRuleGroupConfig = {
  key: keyof TavernPromptRuleGroups;
  id: string;
  tag: string;
  label: string;
};

const PROMPT_RULE_GROUP_CONFIGS: TavernPromptRuleGroupConfig[] = [
  {
    key: "qualityRules",
    id: "quality-rules",
    tag: "quality_rules",
    label: "质量规则",
  },
  {
    key: "narrativeStyles",
    id: "narrative-styles",
    tag: "narrative_styles",
    label: "叙事风格",
  },
  {
    key: "genreRules",
    id: "genre-rules",
    tag: "genre_rules",
    label: "题材规则",
  },
  {
    key: "hookRules",
    id: "hook-rules",
    tag: "hook_rules",
    label: "钩子规则",
  },
  {
    key: "tabooRules",
    id: "taboo-rules",
    tag: "taboo_rules",
    label: "雷点规则",
  },
];

const getRuleAddendum = (rule: TavernPromptRuleLike, target: TavernPromptRuleTarget) => {
  if (target === "bridge") {
    return rule.bridgeAddendum;
  }

  if (target === "director") {
    return rule.directorAddendum;
  }

  return rule.characterAddendum;
};

const formatRuleGroupContent = ({
  label,
  rules,
  target,
}: {
  label: string;
  rules: TavernPromptRuleLike[];
  target: TavernPromptRuleTarget;
}) =>
  rules
    .map((rule) =>
      [`${label}：${rule.label}。${rule.description}`, getRuleAddendum(rule, target)].filter(Boolean).join("\n"),
    )
    .join("\n\n");

export const buildPromptRuleLayerSections = ({
  ruleGroups,
  target,
}: {
  ruleGroups: TavernPromptRuleGroups;
  target: "bridge" | "character";
}): TavernPromptSection[] =>
  PROMPT_RULE_GROUP_CONFIGS.flatMap((config) => {
    const rules = ruleGroups[config.key] as TavernPromptRuleLike[];
    if (rules.length === 0) {
      return [];
    }

    return [
      {
        id: config.id,
        layer: "tavern",
        tag: config.tag,
        attributes: {
          ids: rules.map((rule) => rule.id).join(","),
          target,
        },
        content: formatRuleGroupContent({
          label: config.label,
          rules,
          target,
        }),
      },
    ];
  });

export const formatPromptRuleLayersForDirector = (ruleGroups: TavernPromptRuleGroups) =>
  PROMPT_RULE_GROUP_CONFIGS.map((config) => {
    const rules = ruleGroups[config.key] as TavernPromptRuleLike[];
    if (rules.length === 0) {
      return "";
    }

    return [
      `<${config.tag} ids="${rules.map((rule) => rule.id).join(",")}" target="director">`,
      formatRuleGroupContent({
        label: config.label,
        rules,
        target: "director",
      }),
      `</${config.tag}>`,
      "",
    ].join("\n");
  })
    .filter(Boolean)
    .join("\n");

export const formatPromptRuleLayersForCharacterStyle = (ruleGroups: TavernPromptRuleGroups) =>
  PROMPT_RULE_GROUP_CONFIGS.flatMap((config) => {
    const rules = ruleGroups[config.key] as TavernPromptRuleLike[];
    return rules.length > 0
      ? [`${config.label}：${rules.map((rule) => `${rule.label}。${rule.characterAddendum}`).join("；")}`]
      : [];
  });
