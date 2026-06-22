import type { TavernCharacter } from "../../../types";
import type { TavernPresentationRuntimeContract } from "../../../presentation-contracts";

export type TavernCharacterPromptVariant =
  | "xml_contract"
  | "dialogue_first"
  | "minimal_contract";

export const DEFAULT_TAVERN_CHARACTER_PROMPT_VARIANT: TavernCharacterPromptVariant =
  "xml_contract";

export type TavernCharacterTurnOutputMode =
  | "narrative_beat"
  | "dialogue_reply"
  | "nonverbal_reply";

export const resolveCharacterTurnOutputMode = (
  presentationContract: TavernPresentationRuntimeContract,
  allowNonverbalReply: boolean,
): TavernCharacterTurnOutputMode => {
  if (presentationContract.characterMessageKind === "narrative_beat") {
    return "narrative_beat";
  }

  if (allowNonverbalReply) {
    return "nonverbal_reply";
  }

  return "dialogue_reply";
};

const buildMinimalContractInstruction = ({
  speaker,
  publicContentTag,
  outputMode,
}: {
  speaker: TavernCharacter;
  publicContentTag: string;
  outputMode: TavernCharacterTurnOutputMode;
}) => {
  let publicContentRule =
    `<${publicContentTag}> 必须非空，至少有一句${speaker.name}说出口的对白，可附带 0 到 1 段可观察动作。`;
  if (outputMode === "nonverbal_reply") {
    publicContentRule =
      `<${publicContentTag}> 可以只写一段${speaker.name}的可观察动作标注，也可以为空；不要强行说出口对白。`;
  }

  return [
    `输出只允许包含 <inner_thought>...</inner_thought> 和 <${publicContentTag}>...</${publicContentTag}> 两段。`,
    `<inner_thought> 只写${speaker.name}自己的内心短句，不写别人心理。`,
    publicContentRule,
    "不要在标签外输出文字，不要省略结束标签。",
  ].join("\n");
};

const buildXmlContractInstruction = ({
  publicContentTag,
  outputMode,
}: {
  publicContentTag: string;
  outputMode: TavernCharacterTurnOutputMode;
}) => {
  let templateLine =
    `<${publicContentTag}>一句当前角色直接说出口的非空对白。可选：*一个可观察小动作。*</${publicContentTag}>`;
  let contentRule =
    `<${publicContentTag}>...</${publicContentTag}> 中间必须有公开回复正文，不能为空，不能只写空白、沉默或不答。`;

  if (outputMode === "nonverbal_reply") {
    templateLine =
      `<${publicContentTag}>*一个当前角色可被观察到的动作。*</${publicContentTag}>，或在确实完全不动时使用空 <${publicContentTag}></${publicContentTag}>。`;
    contentRule =
      `<${publicContentTag}>...</${publicContentTag}> 允许没有直接对白；优先写一段 Markdown 单星号动作，不要替换成旁白或第三人称剧情总结。`;
  }

  return [
    "把输出当成一个必须通过解析器的 XML 片段，严格遵守：",
    "<inner_thought>一句当前角色自己的心理想法</inner_thought>",
    templateLine,
    `四个标签 <inner_thought>、</inner_thought>、<${publicContentTag}>、</${publicContentTag}> 都是必填字符，不能省略、改名或写到代码块里。`,
    contentRule,
    `标签外不允许有任何文字；<${publicContentTag}> 中不能包含其他角色名加冒号的发言。`,
  ].join("\n");
};

const buildDialogueFirstInstruction = ({
  speaker,
  publicContentTag,
  outputMode,
}: {
  speaker: TavernCharacter;
  publicContentTag: string;
  outputMode: TavernCharacterTurnOutputMode;
}) => {
  let publicContentExampleLines = [
    "当前角色说出口的一句或两句公开对白。",
    "可选：*当前角色可被观察到的小动作。*",
  ];
  let completionRule =
    `回复正文第一句必须是${speaker.name}说出口的对白，不要先写动作；不能省略 <inner_thought>、</inner_thought>、<${publicContentTag}>、</${publicContentTag}> 任一标签，<${publicContentTag}> 也不能留空。`;

  if (outputMode === "nonverbal_reply") {
    publicContentExampleLines = ["*当前角色可被观察到的小动作。*"];
    completionRule =
      `本轮允许不说出口对白；不能省略 <inner_thought>、</inner_thought>、<${publicContentTag}>、</${publicContentTag}> 任一标签。`;
  }

  return [
    "必须严格使用下面的输出模板，不要在标签外输出任何文字：",
    "<inner_thought>当前角色没有说出口的一句心理想法</inner_thought>",
    `<${publicContentTag}>`,
    ...publicContentExampleLines,
    `</${publicContentTag}>`,
    completionRule,
    "心理想法只写当前角色自己的短句，不要替用户或其他角色写心理；公开回复必须符合当前角色口吻。",
  ].join("\n");
};

export const buildReplyFormatInstruction = (
  speaker: TavernCharacter,
  variant: TavernCharacterPromptVariant,
  outputMode: TavernCharacterTurnOutputMode,
  presentationContract: TavernPresentationRuntimeContract,
) => {
  const publicContentTag = presentationContract.publicContentTag;

  if (outputMode === "narrative_beat") {
    return [
      `输出只允许包含 <inner_thought>...</inner_thought> 和 <${publicContentTag}>...</${publicContentTag}> 两段。`,
      `<inner_thought> 只写${speaker.name}自己的内心短句，不写系统推理。`,
      `<${publicContentTag}> 写一段围绕${speaker.name}的第三人称小说正文，包含动作、反应、间接表达或公开可观察变化。`,
      "不要在标签外输出文字，不要省略结束标签，不要写角色名冒号的聊天记录。",
    ].join("\n");
  }

  if (variant === "minimal_contract") {
    return buildMinimalContractInstruction({
      speaker,
      publicContentTag,
      outputMode,
    });
  }

  if (variant === "xml_contract") {
    return buildXmlContractInstruction({
      publicContentTag,
      outputMode,
    });
  }

  return buildDialogueFirstInstruction({
    speaker,
    publicContentTag,
    outputMode,
  });
};

export const buildReplyPerspectiveInstruction = ({
  speaker,
  outputMode,
  dialoguePolicy,
}: {
  speaker: TavernCharacter;
  outputMode: TavernCharacterTurnOutputMode;
  dialoguePolicy: string;
}) => {
  if (outputMode === "narrative_beat") {
    if (dialoguePolicy === "indirect") {
      return `公开正文必须是第三人称间接叙事，禁止${speaker.name}用“我”直接自述；把角色口吻转译为动作、心理和“${speaker.name}表示/追问/承认...”这类间接表达。`;
    }

    return "公开正文必须是第三人称小说片段，可以包含少量自然对白，但不要写聊天气泡、角色名冒号或一问一答记录。";
  }

  if (outputMode === "nonverbal_reply") {
    return `本轮允许${speaker.name}不说出口对白；公开部分应写${speaker.name}自己的可观察动作、神态或停顿，动作标注最多 1 段，必须用 Markdown 单星号独立成段。不要写第三人称全知旁白，不要写其他角色动作。`;
  }

  return `公开回复必须以${speaker.name}直接说出口的话为主，至少包含一句当前角色说出口的对白；不要写第三人称小说正文；对白不要包在引号里，也不要写“他说/声音很轻/似乎后悔”等作者叙述。动作标注最多 1 段，必须用 Markdown 单星号独立成段，且只能写可观察小动作；只输出动作标注视为无效回复。`;
};

export const buildNonEmptyReplyInstruction = ({
  speaker,
  publicContentTag,
  outputMode,
}: {
  speaker: TavernCharacter;
  publicContentTag: string;
  outputMode: TavernCharacterTurnOutputMode;
}) => {
  if (outputMode === "narrative_beat") {
    return `<${publicContentTag}> 必须有可展示正文；可以不含直接对白，但必须给出${speaker.name}相关的动作、心理压强、间接表达或公开后果。`;
  }

  if (outputMode === "nonverbal_reply") {
    return `被调度到这轮不等于必须开口。若当前问题冒犯、关系不足、角色选择回避或用户要求只用动作回应，<${publicContentTag}> 可以只写动作，直接对白可以为空；优先给一个用户能看见的动作，例如“*${speaker.name}别过头，没有接话。*”。`;
  }

  return `被调度发言就表示${speaker.name}必须公开回应一句，不能用空 <${publicContentTag}></${publicContentTag}>、沉默、不答、无话可说来完成本轮；不能只点头、只写动作或用动作替代对白。如果没有新信息，就用角色口吻说一句“我这边暂时没有新动静，继续守着”这类短状态。`;
};
