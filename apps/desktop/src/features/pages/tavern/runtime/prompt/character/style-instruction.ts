import { getTavernPresentationProfile } from "../../../prompt-registry/presentation-rules";
import { formatTavernPromptBlocksForTarget } from "../../../prompt-registry/text-blocks";
import type {
  TavernCharacter,
  TavernRoom,
} from "../../../types";
import { joinPromptLines } from "../shared/sections";

export const buildCharacterTurnStyleInstruction = ({
  room,
  speaker,
  publicContentTag,
}: {
  room: TavernRoom;
  speaker: TavernCharacter;
  publicContentTag?: string;
}) => {
  const presentationProfile = getTavernPresentationProfile(room.presentation?.profileId);
  const lines = [
    `呈现规则：${presentationProfile.label}。${presentationProfile.characterAddendum}`,
    formatTavernPromptBlocksForTarget({
      prompt: room.prompt,
      target: "character",
      publicContentTag,
    }),
  ];

  if (speaker.writingStyle) {
    lines.push(`当前角色写作风格：${speaker.writingStyle}`);
  }

  if (speaker.replyStylePrompt) {
    lines.push(`当前角色回复规则：${speaker.replyStylePrompt}`);
  }

  return joinPromptLines(lines);
};
