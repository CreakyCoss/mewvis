import type {
  TavernCharacter,
  TavernRoom,
} from "../types";
import { getTavernPromptStylePreset } from "../prompt-styles";
import { getTavernPresentationProfile } from "../presentation-profiles";
import {
  getTavernPresentationContract,
  type TavernPresentationRuntimeContract,
} from "../presentation-contracts";
import { isTavernFixedOrderPhase } from "../core";

export type TavernCharacterPromptVariant =
  | "xml_contract"
  | "dialogue_first"
  | "minimal_contract";

export const DEFAULT_TAVERN_CHARACTER_PROMPT_VARIANT: TavernCharacterPromptVariant =
  "xml_contract";

const buildReplyFormatInstruction = (
  speaker: TavernCharacter,
  variant: TavernCharacterPromptVariant,
  allowNonverbalReply: boolean,
  presentationContract: TavernPresentationRuntimeContract,
) => {
  const publicContentTag = presentationContract.publicContentTag;
  const usesNarrativeBeat = presentationContract.characterMessageKind === "narrative_beat";

  if (usesNarrativeBeat) {
    return [
      `输出只允许包含 <inner_thought>...</inner_thought> 和 <${publicContentTag}>...</${publicContentTag}> 两段。`,
      `<inner_thought> 只写${speaker.name}自己的内心短句，不写系统推理。`,
      `<${publicContentTag}> 写一段围绕${speaker.name}的第三人称小说正文，包含动作、反应、间接表达或公开可观察变化。`,
      "不要在标签外输出文字，不要省略结束标签，不要写角色名冒号的聊天记录。",
    ].join("\n");
  }

  if (variant === "minimal_contract") {
    return [
      `输出只允许包含 <inner_thought>...</inner_thought> 和 <${publicContentTag}>...</${publicContentTag}> 两段。`,
      `<inner_thought> 只写${speaker.name}自己的内心短句，不写别人心理。`,
      allowNonverbalReply
        ? `<${publicContentTag}> 可以只写一段${speaker.name}的可观察动作标注，也可以为空；不要强行说出口对白。`
        : `<${publicContentTag}> 必须非空，至少有一句${speaker.name}说出口的对白，可附带 0 到 1 段可观察动作。`,
      "不要在标签外输出文字，不要省略结束标签。",
    ].join("\n");
  }

  if (variant === "xml_contract") {
    return [
      "把输出当成一个必须通过解析器的 XML 片段，严格遵守：",
      "<inner_thought>一句当前角色自己的心理想法</inner_thought>",
      allowNonverbalReply
        ? `<${publicContentTag}>*一个当前角色可被观察到的动作。*</${publicContentTag}>，或在确实完全不动时使用空 <${publicContentTag}></${publicContentTag}>。`
        : `<${publicContentTag}>一句当前角色直接说出口的非空对白。可选：*一个可观察小动作。*</${publicContentTag}>`,
      `四个标签 <inner_thought>、</inner_thought>、<${publicContentTag}>、</${publicContentTag}> 都是必填字符，不能省略、改名或写到代码块里。`,
      allowNonverbalReply
        ? `<${publicContentTag}>...</${publicContentTag}> 允许没有直接对白；优先写一段 Markdown 单星号动作，不要替换成旁白或第三人称剧情总结。`
        : `<${publicContentTag}>...</${publicContentTag}> 中间必须有公开回复正文，不能为空，不能只写空白、沉默或不答。`,
      `标签外不允许有任何文字；<${publicContentTag}> 中不能包含其他角色名加冒号的发言。`,
    ].join("\n");
  }

  return [
    "必须严格使用下面的输出模板，不要在标签外输出任何文字：",
    "<inner_thought>当前角色没有说出口的一句心理想法</inner_thought>",
    `<${publicContentTag}>`,
    allowNonverbalReply
      ? "*当前角色可被观察到的小动作。*"
      : "当前角色说出口的一句或两句公开对白。",
    allowNonverbalReply ? "" : "可选：*当前角色可被观察到的小动作。*",
    `</${publicContentTag}>`,
    allowNonverbalReply
      ? `本轮允许不说出口对白；不能省略 <inner_thought>、</inner_thought>、<${publicContentTag}>、</${publicContentTag}> 任一标签。`
      : `回复正文第一句必须是${speaker.name}说出口的对白，不要先写动作；不能省略 <inner_thought>、</inner_thought>、<${publicContentTag}>、</${publicContentTag}> 任一标签，<${publicContentTag}> 也不能留空。`,
    "心理想法只写当前角色自己的短句，不要替用户或其他角色写心理；公开回复必须符合当前角色口吻。",
  ].filter(Boolean).join("\n");
};

export const buildTavernCharacterTurnInstruction = ({
  room,
  speaker,
  speakerIndex,
  speakerCount,
  replyMode,
  isDirectorLikeMode,
  isManagedMode,
  isSceneDriveMode = false,
  directorReason,
  promptVariant = DEFAULT_TAVERN_CHARACTER_PROMPT_VARIANT,
  allowNonverbalReply = false,
}: {
  room: TavernRoom;
  speaker: TavernCharacter;
  speakerIndex: number;
  speakerCount: number;
  replyMode: TavernRoom["replyMode"];
  isDirectorLikeMode: boolean;
  isManagedMode: boolean;
  isSceneDriveMode?: boolean;
  directorReason?: string | null;
  promptVariant?: TavernCharacterPromptVariant;
  allowNonverbalReply?: boolean;
}) => {
  const presentationProfile = getTavernPresentationProfile(room.presentation?.profileId);
  const presentationContract = getTavernPresentationContract(presentationProfile);
  const publicContentTag = presentationContract.publicContentTag;
  const usesNarrativeBeat = presentationContract.characterMessageKind === "narrative_beat";
  const replyFormatInstruction = buildReplyFormatInstruction(
    speaker,
    promptVariant,
    allowNonverbalReply,
    presentationContract,
  );
  const promptStyle = getTavernPromptStylePreset(room.promptStyleId);
  const replyPerspectiveInstruction = usesNarrativeBeat
    ? presentationProfile.dialoguePolicy === "indirect"
      ? `公开正文必须是第三人称间接叙事，禁止${speaker.name}用“我”直接自述；把角色口吻转译为动作、心理和“${speaker.name}表示/追问/承认...”这类间接表达。`
      : `公开正文必须是第三人称小说片段，可以包含少量自然对白，但不要写聊天气泡、角色名冒号或一问一答记录。`
    : allowNonverbalReply
    ? `本轮允许${speaker.name}不说出口对白；公开部分应写${speaker.name}自己的可观察动作、神态或停顿，动作标注最多 1 段，必须用 Markdown 单星号独立成段。不要写第三人称全知旁白，不要写其他角色动作。`
    : `公开回复必须以${speaker.name}直接说出口的话为主，至少包含一句当前角色说出口的对白；不要写第三人称小说正文；对白不要包在引号里，也不要写“他说/声音很轻/似乎后悔”等作者叙述。动作标注最多 1 段，必须用 Markdown 单星号独立成段，且只能写可观察小动作；只输出动作标注视为无效回复。`;
  const nonEmptyReplyInstruction = usesNarrativeBeat
    ? `<${publicContentTag}> 必须有可展示正文；可以不含直接对白，但必须给出${speaker.name}相关的动作、心理压强、间接表达或公开后果。`
    : allowNonverbalReply
    ? `被调度到这轮不等于必须开口。若当前问题冒犯、关系不足、角色选择回避或用户要求只用动作回应，<${publicContentTag}> 可以只写动作，直接对白可以为空；优先给一个用户能看见的动作，例如“*${speaker.name}别过头，没有接话。*”。`
    : `被调度发言就表示${speaker.name}必须公开回应一句，不能用空 <${publicContentTag}></${publicContentTag}>、沉默、不答、无话可说来完成本轮；不能只点头、只写动作或用动作替代对白。如果没有新信息，就用角色口吻说一句“我这边暂时没有新动静，继续守着”这类短状态。`;
  const styleInstruction = [
    `呈现模式：${presentationProfile.label}。${presentationProfile.characterAddendum}`,
    `房间提示词风格：${promptStyle.label}。${promptStyle.characterAddendum}`,
    speaker.writingStyle ? `当前角色写作风格：${speaker.writingStyle}` : "",
    speaker.replyStylePrompt ? `当前角色回复规则：${speaker.replyStylePrompt}` : "",
  ].filter(Boolean).join("\n");
  const schedulingInstruction = isTavernFixedOrderPhase(room)
    ? [
        "当前是固定顺序发言阶段。",
        "你可以点名、质疑或回应其他角色的公开发言，但被点名者不会在本轮插队回应。",
        "发言结束后应把控制权交回固定流程；不要要求导演立刻让某人加塞发言。",
      ].join("\n")
    : "";
  const ownReplyInstruction = usesNarrativeBeat
    ? `${replyFormatInstruction}\n${replyPerspectiveInstruction}\n${nonEmptyReplyInstruction}\n${styleInstruction}\n${schedulingInstruction}\n只输出当前角色贡献的第三人称正文片段；不要替用户作关键决定，不要把其他角色完整写成另一位主角。`
    : room.settings.immersiveDescriptionEnabled !== false
    ? `${replyFormatInstruction}\n${replyPerspectiveInstruction}\n${nonEmptyReplyInstruction}\n${styleInstruction}\n${schedulingInstruction}\n只输出当前角色自己的公开发言和可选短动作标注；不要复述旁白或环境转场，不要替其他角色总结或行动。`
    : `${replyFormatInstruction}\n${replyPerspectiveInstruction}\n${nonEmptyReplyInstruction}\n${styleInstruction}\n${schedulingInstruction}\n只输出你自己的回应，不要替其他角色总结或行动；动作、神态和场景互动只在必要时简短使用，不要刻意使用斜体描写。`;

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
    `${isSceneDriveMode ? "场景自推动导演" : isManagedMode ? "全托管导演" : "导演调度"}选择你作为第 ${speakerIndex + 1}/${speakerCount} 位发言者。`,
    directorReason ? `导演意图：${directorReason}` : "",
    speakerIndex === 0
      ? isSceneDriveMode
        ? "本轮没有用户角色发言；承接最近公开内容、当前场景目标和导演意图推进，不要替用户说话或做选择。"
        : "回应用户输入，并顺着当前场景目标推进。"
      : "前面角色已经回应，请承接他们的信息，不要重复复述。",
    ownReplyInstruction,
    "不要输出任何角色名加冒号的发言人标签。",
  ].filter(Boolean).join("\n");
};
