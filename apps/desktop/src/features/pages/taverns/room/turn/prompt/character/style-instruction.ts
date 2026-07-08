import type { TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import { joinPromptLines } from "@/features/pages/taverns/room/prompt-xml/sections";

export const buildCharacterTurnStyleInstruction = ({
  room,
  speaker,
}: {
  room: TavernRoomRuntime;
  speaker: TavernCharacter;
}) => {
  const lines = [
    room.presentation.settings.immersiveDescriptionEnabled
      ? ""
      : "当前房间关闭沉浸描写；动作和场景互动只在必要时简短使用。",
  ];

  if (speaker.writingStyle) {
    lines.push(`当前角色写作风格：${speaker.writingStyle}`);
  }

  if (speaker.replyStylePrompt) {
    lines.push(`当前角色回复规则：${speaker.replyStylePrompt}`);
  }

  return joinPromptLines(lines);
};
