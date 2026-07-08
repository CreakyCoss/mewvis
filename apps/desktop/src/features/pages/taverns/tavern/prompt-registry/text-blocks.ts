import { cloneDeep } from "lodash-es";
import { getTavernPresentationProfile } from "./presentation-rules";
import {
  DEFAULT_TAVERN_RULE_COMPOSITION_ID,
  getTavernRuleComposition,
  normalizeTavernQualityRuleIds,
  resolveTavernPromptRuleStack,
  TAVERN_QUALITY_RULES,
} from "./rule-layers/resolver";
import type { TavernPromptRuleGroups } from "./rule-layers/resolver";
import {
  DEFAULT_TAVERN_SYSTEM_NARRATIVE_PRESET_ID,
  formatTavernSystemNarrativeCharacterRules,
  formatTavernSystemNarrativePresetForPrompt,
  getTavernSystemNarrativePreset,
} from "./system-narrative-styles";
import { DEFAULT_TAVERN_PROMPT_STYLE_ID, getTavernPromptStylePreset } from "../presentation/prompt-styles";
import type {
  TavernPresentationProfileId,
  TavernPromptBlock,
  TavernPromptBlockSourceType,
  TavernPromptBlockTarget,
  TavernRoomPromptSettings,
  TavernPromptStyleId,
  TavernSystemNarrativePresetId,
} from "@/features/pages/taverns/manage/model";
import type { TavernPlatformStyleId, TavernQualityRuleId } from "./rule-layers/types";

type CreatePromptBlockInput = {
  target: TavernPromptBlockTarget;
  label: string;
  text: string;
  order: number;
  source: NonNullable<TavernPromptBlock["source"]>;
};

type PromptRuleLike = {
  id: string;
  label: string;
  bridgeAddendum: string;
  directorAddendum: string;
  characterAddendum: string;
};

const escapePromptXmlText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapePromptXmlAttribute = (text: string) => escapePromptXmlText(text).replace(/"/g, "&quot;");

const getTargetText = (rule: PromptRuleLike, target: TavernPromptBlockTarget) => {
  if (target === "bridge") {
    return rule.bridgeAddendum;
  }

  if (target === "director") {
    return rule.directorAddendum;
  }

  return rule.characterAddendum;
};

const createBlock = ({ target, label, text, order, source }: CreatePromptBlockInput): TavernPromptBlock => ({
  id: `${source.type}:${source.id}:${target}`,
  target,
  label,
  text: text.trim(),
  enabled: true,
  order,
  source,
});

const createTargetBlocks = ({
  sourceType,
  sourceId,
  sourceLabel,
  label,
  order,
  getText,
}: {
  sourceType: TavernPromptBlockSourceType;
  sourceId: string;
  sourceLabel: string;
  label: string;
  order: number;
  getText: (target: TavernPromptBlockTarget) => string;
}): TavernPromptBlock[] =>
  (["bridge", "director", "character"] as const).flatMap((target, targetIndex) => {
    const text = getText(target);
    return text.trim()
      ? [
          createBlock({
            target,
            label,
            text,
            order: order + targetIndex,
            source: {
              type: sourceType,
              id: sourceId,
              label: sourceLabel,
            },
          }),
        ]
      : [];
  });

export const createSystemNarrativePromptBlocks = ({
  presetId = DEFAULT_TAVERN_SYSTEM_NARRATIVE_PRESET_ID,
  presentationProfileId,
  immersiveDescriptionEnabled = true,
  order = 100,
}: {
  presetId?: TavernSystemNarrativePresetId;
  presentationProfileId: TavernPresentationProfileId;
  immersiveDescriptionEnabled?: boolean;
  order?: number;
}): TavernPromptBlock[] => {
  const preset = getTavernSystemNarrativePreset(presetId);
  const presentationProfile = getTavernPresentationProfile(presentationProfileId);
  const usesNarrativeBeat = presentationProfile.generationContract === "character_narrative_beat";
  const publicContentLabel = usesNarrativeBeat ? "小说正文段" : "公开回复段";

  return createTargetBlocks({
    sourceType: "system_narrative",
    sourceId: preset.id,
    sourceLabel: preset.label,
    label: `系统叙事：${preset.label}`,
    order,
    getText: (target) => {
      if (target === "character") {
        return [
          formatTavernSystemNarrativePresetForPrompt({
            settings: { presetId: preset.id },
            preset,
            target,
          }),
          ...formatTavernSystemNarrativeCharacterRules({
            preset,
            publicContentTag: publicContentLabel,
            usesNarrativeBeat,
            immersiveDescriptionEnabled,
          }),
        ]
          .filter(Boolean)
          .join("\n");
      }

      return formatTavernSystemNarrativePresetForPrompt({
        settings: { presetId: preset.id },
        preset,
        target,
      });
    },
  });
};

export const createRoomStylePromptBlocks = ({
  promptStyleId = DEFAULT_TAVERN_PROMPT_STYLE_ID,
  order = 200,
}: {
  promptStyleId?: TavernPromptStyleId;
  order?: number;
}): TavernPromptBlock[] => {
  const preset = getTavernPromptStylePreset(promptStyleId);

  return createTargetBlocks({
    sourceType: "room_style",
    sourceId: preset.id,
    sourceLabel: preset.label,
    label: `酒馆风格：${preset.label}`,
    order,
    getText: (target) => {
      if (target === "bridge") {
        return preset.bridgeSystemAddendum;
      }

      if (target === "director") {
        return preset.directorAddendum;
      }

      return preset.characterAddendum;
    },
  });
};

const appendRuleBlocks = ({
  blocks,
  rules,
  sourceType,
  orderStart,
}: {
  blocks: TavernPromptBlock[];
  rules: PromptRuleLike[];
  sourceType: TavernPromptBlockSourceType;
  orderStart: number;
}) => {
  rules.forEach((rule, ruleIndex) => {
    blocks.push(
      ...createTargetBlocks({
        sourceType,
        sourceId: rule.id,
        sourceLabel: rule.label,
        label: rule.label,
        order: orderStart + ruleIndex * 10,
        getText: (target) => getTargetText(rule, target),
      }),
    );
  });
};

const createRuleGroupPromptBlocks = ({
  ruleGroups,
  order = 400,
}: {
  ruleGroups: TavernPromptRuleGroups;
  order?: number;
}) => {
  const blocks: TavernPromptBlock[] = [];
  appendRuleBlocks({
    blocks,
    rules: ruleGroups.qualityRules,
    sourceType: "quality_rule",
    orderStart: order,
  });
  appendRuleBlocks({
    blocks,
    rules: ruleGroups.narrativeStyles,
    sourceType: "narrative_style",
    orderStart: order + 100,
  });
  appendRuleBlocks({
    blocks,
    rules: ruleGroups.genreRules,
    sourceType: "genre_rule",
    orderStart: order + 200,
  });
  appendRuleBlocks({
    blocks,
    rules: ruleGroups.hookRules,
    sourceType: "hook_rule",
    orderStart: order + 300,
  });
  appendRuleBlocks({
    blocks,
    rules: ruleGroups.tabooRules,
    sourceType: "taboo_rule",
    orderStart: order + 400,
  });
  return blocks;
};

export const createRuleCompositionPromptBlocks = ({
  compositionId = DEFAULT_TAVERN_RULE_COMPOSITION_ID,
  qualityRuleIds = [],
  order = 300,
}: {
  compositionId?: TavernPlatformStyleId;
  qualityRuleIds?: TavernQualityRuleId[];
  order?: number;
}): TavernPromptBlock[] => {
  const composition = getTavernRuleComposition(compositionId);
  const ruleStack = resolveTavernPromptRuleStack({
    compositionId,
    qualityRuleIds,
  });
  const platformBlocks = createTargetBlocks({
    sourceType: "platform_style",
    sourceId: ruleStack.platformStyle.id,
    sourceLabel: ruleStack.platformStyle.label,
    label: `平台偏好：${ruleStack.platformStyle.label}`,
    order,
    getText: (target) => getTargetText(ruleStack.platformStyle, target),
  });

  return [
    ...platformBlocks.map((block) => ({
      ...block,
      label: `${composition.label} / ${block.label}`,
    })),
    ...createRuleGroupPromptBlocks({
      ruleGroups: ruleStack.ruleGroups,
      order: order + 100,
    }),
  ];
};

export const createDefaultTavernPromptSettings = ({
  presentationProfileId,
  promptStyleId = DEFAULT_TAVERN_PROMPT_STYLE_ID,
  systemNarrativePresetId = DEFAULT_TAVERN_SYSTEM_NARRATIVE_PRESET_ID,
  ruleCompositionId = DEFAULT_TAVERN_RULE_COMPOSITION_ID,
  qualityRuleIds = [],
  immersiveDescriptionEnabled = true,
}: {
  presentationProfileId: TavernPresentationProfileId;
  promptStyleId?: TavernPromptStyleId;
  systemNarrativePresetId?: TavernSystemNarrativePresetId;
  ruleCompositionId?: TavernPlatformStyleId;
  qualityRuleIds?: TavernQualityRuleId[];
  immersiveDescriptionEnabled?: boolean;
}): TavernRoomPromptSettings => ({
  version: 1,
  blocks: [
    ...createSystemNarrativePromptBlocks({
      presetId: systemNarrativePresetId,
      presentationProfileId,
      immersiveDescriptionEnabled,
    }),
    ...createRoomStylePromptBlocks({
      promptStyleId,
    }),
    ...createRuleCompositionPromptBlocks({
      compositionId: ruleCompositionId,
      qualityRuleIds,
    }),
  ].sort((left, right) => left.order - right.order || left.label.localeCompare(right.label)),
});

export const normalizeTavernPromptSettings = (
  value: unknown,
  fallback: TavernRoomPromptSettings,
): TavernRoomPromptSettings => {
  const candidate = value && typeof value === "object" ? (value as Partial<TavernRoomPromptSettings>) : {};
  const sourceBlocks = Array.isArray(candidate.blocks) ? candidate.blocks : null;
  const hasBlockArray = Boolean(sourceBlocks);
  const blocks = hasBlockArray
    ? sourceBlocks!.flatMap((block, index) => {
        if (!block || typeof block !== "object") {
          return [];
        }
        const item = block as Partial<TavernPromptBlock>;
        const target =
          item.target === "bridge" || item.target === "director" || item.target === "character"
            ? item.target
            : undefined;
        const label = typeof item.label === "string" ? item.label.trim() : "";
        const text = typeof item.text === "string" ? item.text.trim() : "";
        if (!target || !label || !text) {
          return [];
        }
        const source =
          item.source &&
          typeof item.source === "object" &&
          typeof item.source.type === "string" &&
          typeof item.source.id === "string" &&
          typeof item.source.label === "string"
            ? {
                type: item.source.type as TavernPromptBlockSourceType,
                id: item.source.id,
                label: item.source.label,
              }
            : undefined;
        return [
          {
            id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `custom:${target}:${index + 1}`,
            target,
            label,
            text,
            enabled: item.enabled !== false,
            order: typeof item.order === "number" && Number.isFinite(item.order) ? item.order : index,
            source,
          },
        ];
      })
    : [];

  return {
    version: 1,
    blocks: hasBlockArray
      ? blocks.sort((left, right) => left.order - right.order || left.label.localeCompare(right.label))
      : cloneDeep(fallback.blocks),
  };
};

export const formatTavernPromptBlocksForTarget = ({
  prompt,
  target,
  publicContentTag,
}: {
  prompt?: TavernRoomPromptSettings | null;
  target: TavernPromptBlockTarget;
  publicContentTag?: string;
}) =>
  (prompt?.blocks ?? [])
    .filter((block) => block.enabled && block.target === target && block.text.trim())
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label))
    .map((block) =>
      [
        `<prompt_block id="${escapePromptXmlAttribute(block.id)}" label="${escapePromptXmlAttribute(block.label)}" target="${escapePromptXmlAttribute(block.target)}">`,
        escapePromptXmlText(block.text.split("{publicContentTag}").join(publicContentTag ?? "reply")),
        "</prompt_block>",
      ].join("\n"),
    )
    .join("\n\n");

export const formatTavernInteractionQualityRulesForTarget = ({
  qualityRuleIds,
  target,
  publicContentTag,
}: {
  qualityRuleIds?: unknown;
  target: TavernPromptBlockTarget;
  publicContentTag?: string;
}) => {
  const enabledIds = new Set(normalizeTavernQualityRuleIds(qualityRuleIds));
  return TAVERN_QUALITY_RULES.filter((rule) => enabledIds.has(rule.id))
    .map((rule) => {
      const text = getTargetText(rule, target)
        .split("{publicContentTag}")
        .join(publicContentTag ?? "reply");
      if (!text.trim()) {
        return "";
      }

      return [
        `<interaction_quality_rule id="${escapePromptXmlAttribute(rule.id)}" label="${escapePromptXmlAttribute(rule.label)}" target="${escapePromptXmlAttribute(target)}">`,
        escapePromptXmlText(text.trim()),
        "</interaction_quality_rule>",
      ].join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
};
