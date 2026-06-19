import type {
  TavernCharacter,
  TavernRoom,
} from "../types";
import { getTavernPromptStylePreset } from "../prompt-styles";

export type TavernCharacterPromptVariant =
  | "xml_contract"
  | "dialogue_first"
  | "minimal_contract";

export const DEFAULT_TAVERN_CHARACTER_PROMPT_VARIANT: TavernCharacterPromptVariant =
  "xml_contract";

const buildReplyFormatInstruction = (
  speaker: TavernCharacter,
  variant: TavernCharacterPromptVariant,
) => {
  if (variant === "minimal_contract") {
    return [
      "输出只允许包含 <inner_thought>...</inner_thought> 和 <reply>...</reply> 两段。",
      `<inner_thought> 只写${speaker.name}自己的内心短句，不写别人心理。`,
      `<reply> 必须非空，至少有一句${speaker.name}说出口的对白，可附带 0 到 1 段可观察动作。`,
      "不要在标签外输出文字，不要省略结束标签。",
    ].join("\n");
  }

  if (variant === "xml_contract") {
    return [
      "把输出当成一个必须通过解析器的 XML 片段，严格遵守：",
      "<inner_thought>一句当前角色自己的心理想法</inner_thought>",
      "<reply>一句当前角色直接说出口的非空对白。可选：*一个可观察小动作。*</reply>",
      "四个标签 <inner_thought>、</inner_thought>、<reply>、</reply> 都是必填字符，不能省略、改名或写到代码块里。",
      "<reply>...</reply> 中间必须有公开回复正文，不能为空，不能只写空白、沉默或不答。",
      "标签外不允许有任何文字；<reply> 中不能包含其他角色名加冒号的发言。",
    ].join("\n");
  }

  return [
    "必须严格使用下面的输出模板，不要在标签外输出任何文字：",
    "<inner_thought>当前角色没有说出口的一句心理想法</inner_thought>",
    "<reply>",
    "当前角色说出口的一句或两句公开对白。",
    "可选：*当前角色可被观察到的小动作。*",
    "</reply>",
    `回复正文第一句必须是${speaker.name}说出口的对白，不要先写动作；不能省略 <inner_thought>、</inner_thought>、<reply>、</reply> 任一标签，<reply> 也不能留空。`,
    "心理想法只写当前角色自己的短句，不要替用户或其他角色写心理；公开回复必须符合当前角色口吻。",
  ].join("\n");
};

export const buildTavernCharacterTurnInstruction = ({
  room,
  speaker,
  speakerIndex,
  speakerCount,
  replyMode,
  isDirectorLikeMode,
  isManagedMode,
  directorReason,
  promptVariant = DEFAULT_TAVERN_CHARACTER_PROMPT_VARIANT,
}: {
  room: TavernRoom;
  speaker: TavernCharacter;
  speakerIndex: number;
  speakerCount: number;
  replyMode: TavernRoom["replyMode"];
  isDirectorLikeMode: boolean;
  isManagedMode: boolean;
  directorReason?: string | null;
  promptVariant?: TavernCharacterPromptVariant;
}) => {
  const replyFormatInstruction = buildReplyFormatInstruction(speaker, promptVariant);
  const promptStyle = getTavernPromptStylePreset(room.promptStyleId);
  const replyPerspectiveInstruction =
    `公开回复必须以${speaker.name}直接说出口的话为主，至少包含一句当前角色说出口的对白；不要写第三人称小说正文；对白不要包在引号里，也不要写“他说/声音很轻/似乎后悔”等作者叙述。动作标注最多 1 段，必须用 Markdown 单星号独立成段，且只能写可观察小动作；只输出动作标注视为无效回复。`;
  const nonEmptyReplyInstruction =
    `被调度发言就表示${speaker.name}必须公开回应一句，不能用空 <reply></reply>、沉默、不答、无话可说来完成本轮；不能只点头、只写动作或用动作替代对白。如果没有新信息，就用角色口吻说一句“我这边暂时没有新动静，继续守着”这类短状态。`;
  const styleInstruction = [
    `房间提示词风格：${promptStyle.label}。${promptStyle.characterAddendum}`,
    speaker.writingStyle ? `当前角色写作风格：${speaker.writingStyle}` : "",
    speaker.replyStylePrompt ? `当前角色回复规则：${speaker.replyStylePrompt}` : "",
  ].filter(Boolean).join("\n");
  const ownReplyInstruction = room.settings.immersiveDescriptionEnabled !== false
    ? `${replyFormatInstruction}\n${replyPerspectiveInstruction}\n${nonEmptyReplyInstruction}\n${styleInstruction}\n只输出当前角色自己的公开发言和可选短动作标注；不要复述旁白或环境转场，不要替其他角色总结或行动。`
    : `${replyFormatInstruction}\n${replyPerspectiveInstruction}\n${nonEmptyReplyInstruction}\n${styleInstruction}\n只输出你自己的回应，不要替其他角色总结或行动；动作、神态和场景互动只在必要时简短使用，不要刻意使用斜体描写。`;

  if (replyMode === "round") {
    return [
      `这是全员轮流回应的第 ${speakerIndex + 1}/${speakerCount} 位。`,
      speakerIndex === 0
        ? "你先回应用户，给后续角色留下可承接的信息。"
        : "前面角色已经回应，请承接他们的信息，不要重复复述。",
      ownReplyInstruction,
      "不要输出任何角色名加冒号的发言人标签。",
    ].join("\n");
  }

  if (!isDirectorLikeMode) {
    return undefined;
  }

  return [
    `${isManagedMode ? "全托管导演" : "导演调度"}选择你作为第 ${speakerIndex + 1}/${speakerCount} 位发言者。`,
    directorReason ? `导演意图：${directorReason}` : "",
    speakerIndex === 0
      ? "回应用户输入，并顺着当前场景目标推进。"
      : "前面角色已经回应，请承接他们的信息，不要重复复述。",
    ownReplyInstruction,
    "不要输出任何角色名加冒号的发言人标签。",
  ].filter(Boolean).join("\n");
};
