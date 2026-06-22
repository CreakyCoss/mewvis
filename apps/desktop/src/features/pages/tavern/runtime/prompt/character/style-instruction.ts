import { getTavernPromptStylePreset } from "../../../prompt-styles";
import { getTavernPresentationProfile } from "../../../prompt-registry/presentation-rules";
import { resolveTavernSystemNarrativePreset } from "../../../prompt-registry/system-narrative-styles";
import type {
  TavernCharacter,
  TavernRoom,
} from "../../../types";
import { joinPromptLines } from "../shared/sections";

export const buildCharacterTurnStyleInstruction = ({
  room,
  speaker,
}: {
  room: TavernRoom;
  speaker: TavernCharacter;
}) => {
  const promptStyle = getTavernPromptStylePreset(room.promptStyleId);
  const presentationProfile = getTavernPresentationProfile(room.presentation?.profileId);
  const systemNarrative = resolveTavernSystemNarrativePreset(
    room.settings.systemNarrativePreset,
  );
  const lines = [
    `呈现规则：${presentationProfile.label}。${presentationProfile.characterAddendum}`,
    `系统叙事预设：${systemNarrative.preset.label}。${systemNarrative.preset.description}`,
    `酒馆风格：${promptStyle.label}。${promptStyle.characterAddendum}`,
  ];

  if (systemNarrative.settings.customInstructions) {
    lines.push(`自定义系统叙事规则：${systemNarrative.settings.customInstructions}`);
  }

  if (speaker.writingStyle) {
    lines.push(`当前角色写作风格：${speaker.writingStyle}`);
  }

  if (speaker.replyStylePrompt) {
    lines.push(`当前角色回复规则：${speaker.replyStylePrompt}`);
  }

  return joinPromptLines(lines);
};
