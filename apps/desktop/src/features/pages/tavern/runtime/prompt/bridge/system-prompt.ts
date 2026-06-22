import { getTavernPresentationProfile } from "../../../prompt-registry/presentation-rules";
import {
  resolveTavernSystemNarrativePreset,
} from "../../../prompt-registry/system-narrative-styles";
import { resolveTavernPromptRuleStack } from "../../../prompt-registry/rule-layers/resolver";
import { getTavernPromptStylePreset } from "../../../prompt-styles";
import type { TavernRoom } from "../../../types";
import { buildSystemNarrativePresetSection } from "../layers/narrative-style";
import { buildPlatformStyleSection } from "../layers/platform-style";
import { buildPresentationProfileSection } from "../layers/presentation";
import { buildPromptRuleLayerSections } from "../layers/rule-layers";
import { buildPromptStyleSection } from "../layers/room-style";
import {
  renderTavernPromptSections,
  type TavernPromptSection,
} from "../shared/sections";

const buildBridgeSystemContractSection = (): TavernPromptSection => ({
  id: "bridge-system-contract",
  layer: "system",
  tag: "bridge_system_contract",
  content: [
    "你是 Novel Claw 酒馆模式的底层多 agent 会话。",
    "所有角色、导演、快捷回复和整理员都以 agent 模式运行。",
    "bridge 负责底层 session、摘要和压缩；酒馆应用只提供当前可见事实。",
    "覆盖规则：system_contract 最高优先；presentation_profile、system_narrative_preset、platform_style、prompt_style 和 rule_layers 只能补充酒馆行为，不得覆盖可见性、摘要真实性和角色边界。",
  ],
});

export const buildTavernBridgeSystemPrompt = (room: TavernRoom) => {
  const promptStyle = getTavernPromptStylePreset(room.promptStyleId);
  const presentationProfile = getTavernPresentationProfile(room.presentation?.profileId);
  const systemNarrative = resolveTavernSystemNarrativePreset(
    room.settings.systemNarrativePreset,
  );
  const ruleStack = resolveTavernPromptRuleStack({
    compositionId: room.settings.platformStyleId,
    qualityRuleIds: room.settings.qualityRuleIds,
  });
  const sections: TavernPromptSection[] = [
    buildBridgeSystemContractSection(),
    buildPresentationProfileSection({
      presentationProfile,
      target: "bridge",
    }),
    buildSystemNarrativePresetSection({
      settings: systemNarrative.settings,
      preset: systemNarrative.preset,
      target: "bridge",
    }),
    buildPlatformStyleSection({
      platformStyle: ruleStack.platformStyle,
      target: "bridge",
    }),
    buildPromptStyleSection({
      promptStyle,
      target: "bridge",
    }),
    ...buildPromptRuleLayerSections({
      ruleGroups: ruleStack.ruleGroups,
      target: "bridge",
    }),
  ];

  return renderTavernPromptSections(sections);
};
