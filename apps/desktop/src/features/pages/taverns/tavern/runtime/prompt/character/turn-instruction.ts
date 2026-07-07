import type { TavernActiveRoomView as TavernRoom } from "@/features/pages/taverns/room/model";
import { isTavernFixedOrderPhase } from "../../../core/director-scheduling";
import { getTavernPresentationContract } from "../../../presentation/presentation-contracts";
import { getTavernPresentationProfile } from "../../../prompt-registry/presentation-rules";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import { joinPromptLines } from "../shared/sections";
import {
  DEFAULT_TAVERN_CHARACTER_PROMPT_VARIANT,
  buildNonEmptyReplyInstruction,
  buildReplyFormatInstruction,
  buildReplyPerspectiveInstruction,
  resolveCharacterTurnOutputMode,
  type TavernCharacterPromptVariant,
  type TavernCharacterTurnOutputMode,
} from "./output-contract";
import { buildCharacterTurnStyleInstruction } from "./style-instruction";

const buildSchedulingInstruction = (room: TavernRoom) => {
  if (!isTavernFixedOrderPhase(room.settings)) {
    return "";
  }

  return [
    "当前是固定顺序发言阶段。",
    "你可以点名、质疑或回应其他角色的公开发言，但被点名者不会在本轮插队回应。",
    "发言结束后应把控制权交回固定流程；不要要求导演立刻让某人加塞发言。",
  ].join("\n");
};

const buildOwnReplyInstruction = ({
  outputMode,
  room,
  replyFormatInstruction,
  replyPerspectiveInstruction,
  nonEmptyReplyInstruction,
  styleInstruction,
  schedulingInstruction,
  allowNonverbalReply,
}: {
  outputMode: TavernCharacterTurnOutputMode;
  room: TavernRoom;
  replyFormatInstruction: string;
  replyPerspectiveInstruction: string;
  nonEmptyReplyInstruction: string;
  styleInstruction: string;
  schedulingInstruction: string;
  allowNonverbalReply: boolean;
}) => {
  const nonverbalBoundaryInstruction = allowNonverbalReply
    ? "这是非语言近景回应：公开内容只写当前角色可被看见的动作、神态、位置变化或手头动作；不要写直接对白、自问自答、大段内心独白，也不要替其他角色或用户推进关键决定。最多 1 到 2 个短段。"
    : "";
  const commonRules = [
    replyFormatInstruction,
    replyPerspectiveInstruction,
    nonEmptyReplyInstruction,
    nonverbalBoundaryInstruction,
    styleInstruction,
    schedulingInstruction,
  ];

  if (outputMode === "narrative_beat") {
    return joinPromptLines([
      ...commonRules,
      "只输出当前角色贡献的第三人称正文片段；不要替用户作关键决定，不要把其他角色完整写成另一位主角。",
    ]);
  }

  if (room.settings.immersiveDescriptionEnabled !== false) {
    return joinPromptLines([
      ...commonRules,
      "只输出当前角色自己的公开发言和可选短动作标注；不要复述旁白或环境转场，不要替其他角色总结或行动。",
    ]);
  }

  return joinPromptLines([
    ...commonRules,
    "只输出你自己的回应，不要替其他角色总结或行动；动作、神态和场景互动只在必要时简短使用，不要刻意使用斜体描写。",
  ]);
};

const getDirectorModeLabel = ({ isSceneDriveMode }: { isSceneDriveMode: boolean }) => {
  if (isSceneDriveMode) {
    return "场景自推动导演";
  }

  return "导演调度";
};

const buildDirectorSpeakerInstruction = ({
  speakerIndex,
  isSceneDriveMode,
}: {
  speakerIndex: number;
  isSceneDriveMode: boolean;
}) => {
  if (speakerIndex !== 0) {
    return "前面角色已经回应，请承接他们的信息，不要重复复述。";
  }

  if (isSceneDriveMode) {
    return "本轮没有用户角色发言；承接最近公开内容、当前场景目标和导演意图推进，不要替用户说话或做选择。";
  }

  return "回应用户输入，并顺着当前场景目标推进。";
};

export const buildTavernCharacterTurnInstruction = ({
  room,
  speaker,
  speakerIndex,
  speakerCount,
  isDirectorLikeMode,
  isSceneDriveMode = false,
  directorReason,
  promptVariant = DEFAULT_TAVERN_CHARACTER_PROMPT_VARIANT,
  allowNonverbalReply = false,
}: {
  room: TavernRoom;
  speaker: TavernCharacter;
  speakerIndex: number;
  speakerCount: number;
  isDirectorLikeMode: boolean;
  isSceneDriveMode?: boolean;
  directorReason?: string | null;
  promptVariant?: TavernCharacterPromptVariant;
  allowNonverbalReply?: boolean;
}) => {
  const presentationProfile = getTavernPresentationProfile(room.presentation?.profileId);
  const presentationContract = getTavernPresentationContract(presentationProfile);
  const publicContentTag = presentationContract.publicContentTag;
  const outputMode = resolveCharacterTurnOutputMode(presentationContract, allowNonverbalReply);
  const replyFormatInstruction = buildReplyFormatInstruction(
    speaker,
    promptVariant,
    outputMode,
    presentationContract,
    presentationProfile.dialoguePolicy,
  );
  const ownReplyInstruction = buildOwnReplyInstruction({
    outputMode,
    room,
    replyFormatInstruction,
    replyPerspectiveInstruction: buildReplyPerspectiveInstruction({
      speaker,
      outputMode,
      dialoguePolicy: presentationProfile.dialoguePolicy,
    }),
    nonEmptyReplyInstruction: buildNonEmptyReplyInstruction({
      speaker,
      publicContentTag,
      outputMode,
    }),
    styleInstruction: buildCharacterTurnStyleInstruction({ room, speaker }),
    schedulingInstruction: buildSchedulingInstruction(room),
    allowNonverbalReply,
  });

  if (!isDirectorLikeMode) {
    return undefined;
  }

  const directorLines = [
    `${getDirectorModeLabel({ isSceneDriveMode })}选择你作为第 ${speakerIndex + 1}/${speakerCount} 位发言者。`,
  ];

  if (directorReason) {
    directorLines.push(`导演意图：${directorReason}`);
  }

  directorLines.push(
    buildDirectorSpeakerInstruction({ speakerIndex, isSceneDriveMode }),
    ownReplyInstruction,
    "不要输出任何角色名加冒号的发言人标签。",
  );

  return joinPromptLines(directorLines);
};
