import type { TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import {
  selectTavernRuntimeActivePromptOverrides,
  selectTavernRuntimeRoomConfig,
} from "@/features/pages/taverns/room/runtime/accessors";
import { getTavernPresentationProfile } from "../../../prompt-registry/presentation-rules";
import {
  formatTavernInteractionQualityRulesForTarget,
  formatTavernPromptBlocksForTarget,
} from "../../../prompt-registry/text-blocks";

import { buildPresentationProfileSection } from "../layers/presentation";
import { renderTavernPromptSections, type TavernPromptSection } from "../shared/sections";

const buildBridgeSystemContractSection = (): TavernPromptSection => ({
  id: "bridge-system-contract",
  layer: "system",
  tag: "bridge_system_contract",
  content: [
    "你是 Novel Claw 酒馆模式的底层多 agent 会话。",
    "所有角色、导演、快捷回复和整理员都以 agent 模式运行。",
    "bridge 负责底层 session、摘要和压缩；酒馆应用只提供当前可见事实。",
    "覆盖规则：system_contract 最高优先；presentation_profile 由系统控制；saved prompt_block 只能补充酒馆行为，不得覆盖可见性、摘要真实性和角色边界。",
  ],
});

export const buildTavernBridgeSystemPrompt = (room: TavernRoomRuntime) => {
  const roomConfig = selectTavernRuntimeRoomConfig(room);
  const presentationProfile = getTavernPresentationProfile(room.presentation.profile?.profileId);
  const activePromptOverrides = selectTavernRuntimeActivePromptOverrides(room);
  const sections: TavernPromptSection[] = [
    buildBridgeSystemContractSection(),
    buildPresentationProfileSection({
      presentationProfile,
      target: "bridge",
    }),
    {
      id: "prompt-blocks",
      layer: "tavern",
      content: [
        formatTavernPromptBlocksForTarget({
          prompt: roomConfig.prompt,
          target: "bridge",
        }),
        formatTavernPromptBlocksForTarget({
          prompt: activePromptOverrides,
          target: "bridge",
        }),
        formatTavernInteractionQualityRulesForTarget({
          qualityRuleIds: room.presentation.settings.interactionQualityRuleIds,
          target: "bridge",
        }),
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];

  return renderTavernPromptSections(sections);
};
