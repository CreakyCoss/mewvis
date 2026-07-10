import { AgentProtocol } from "@/features/pages/taverns/room/agent-protocol";
import type { AgentProtocolMessage, AgentProtocolOutputKey } from "@/features/pages/taverns/room/agent-protocol/types";
import type { TavernCharacter } from "@/features/pages/taverns/room/model";
import { createTimestampId } from "@/utils/ids";
import { getCurrentTimestamp } from "@/utils/time";
import { createTavernAgentOutputMessageBody, type TavernMessage } from "@/features/pages/taverns/room/model/message";
import { createTavernAgentFlowPublicMessage } from "./context";
import { getTavernAgentFlowPublicOutputKey } from "./presentation";
import { getTavernAgentFlowPublicText } from "./output";
import { buildTavernAgentFlowProgress, buildTavernAgentFlowReferences } from "./prompt-context";
import { tavernAgentFlowSessionRootDir } from "../../runtime/session";
import { tavernAgentFlowCharacterRoleId } from "./roles";
import type {
  TavernAgentFlowContext,
  TavernAgentFlowInput,
  TavernAgentFlowSpeakerResult,
  TavernAgentFlowRunAgent,
} from "../../types";

const getSpeakerOutputKeys = (context: TavernAgentFlowContext): AgentProtocolOutputKey[] => {
  const publicOutputKey = getTavernAgentFlowPublicOutputKey(context.presentation);
  return context.presentation.id === "dialogue-chat"
    ? ["privateThought", "action", "publicReply"]
    : ["privateThought", publicOutputKey];
};

const buildCurrentInstructionMessage = (
  input: TavernAgentFlowInput,
  context: TavernAgentFlowContext,
): AgentProtocolMessage => ({
  role: input.trigger?.type === "scene_drive" ? "system" : "user",
  speaker: input.trigger?.type === "scene_drive" ? "场景推进指令" : context.playerName,
  content: context.currentInstruction,
  visibility: "public",
});

const buildSpeakerInstruction = ({
  input,
  context,
  character,
}: {
  input: TavernAgentFlowInput;
  context: TavernAgentFlowContext;
  character: TavernCharacter;
}) => {
  const publicOutputKey = getTavernAgentFlowPublicOutputKey(context.presentation);
  const outputNames = getSpeakerOutputKeys(context)
    .filter((key) => key !== "privateThought")
    .join("、");
  const currentInputInstruction = (() => {
    if (input.trigger?.type === "scene_drive") {
      return "当前输入是系统场景推进指令，不是用户角色说出口的话；你应根据场景变化自然行动或回应。";
    }

    if (context.presentation.userInputMode === "speech") {
      return `当前输入是${context.playerName}在场内说出口的话或可见动作；你的公开输出应像现场对话一样直接回应这句话或动作。`;
    }

    if (context.presentation.userInputMode === "story_directive") {
      return "当前输入是剧情指令或推进方向；你的公开输出应转化为小说正文里的角色行动、观察或自然对白。";
    }

    return "当前输入是用户意图；你的公开输出应承接该意图产生的现场反应。";
  })();

  return [
    `当前呈现模式：${context.presentation.label}。`,
    context.presentation.characterAddendum,
    "",
    `你本轮被导演调度，当前角色是 ${character.name}。`,
    "你可以读取本轮前面角色的公开发言，并在自己的公开输出中自然承接。",
    "只能写当前角色能公开表现、说出、观察或推动的内容；不要写其他角色的私有想法。",
    "不要复述协议、不要解释字段、不要在公开输出里写角色 id。",
    currentInputInstruction,
    publicOutputKey === "narrative"
      ? "公开输出写入 narrative，写成可直接进入小说正文的段落。"
      : "角色说出口的话写入 publicReply；当前角色可见动作、神态或姿态写入 action。没有动作时 action 留空。不要把动作混入 publicReply，也不要写第三人称小说段落、角色名冒号或幕后说明。",
    `当前输入：${context.currentInstruction}`,
    `必须填写 privateThought 和 ${outputNames}。`,
  ]
    .filter(Boolean)
    .join("\n");
};

const prepareSpeakerRequest = ({
  input,
  context,
  character,
  previousPublicMessages,
}: {
  input: TavernAgentFlowInput;
  context: TavernAgentFlowContext;
  character: TavernCharacter;
  previousPublicMessages: AgentProtocolMessage[];
}) => {
  return AgentProtocol.prepare({
    system: [
      "你是被调度的角色 agent，只负责生成当前角色本轮输出。",
      "输出协议完全按 AgentProtocol 要求填写；公开内容必须放到指定公开字段。",
      "privateThought 不展示给用户，只保留当前角色自己的短内部判断。",
    ].join("\n"),
    role: {
      name: character.name,
      description: character.description,
      speakingStyle: character.speakingStyle,
      goals: character.goals ? [character.goals] : undefined,
      constraints: ["只代表当前角色行动或回应", "不得替其他角色生成私有心理", "不得泄露导演秘密或其他角色私有信息"],
      memory: character.replyStylePrompt || character.writingStyle,
    },
    task: {
      goal: "基于当前输入和本轮前序公开发言，生成当前角色的一次自然回应或叙事片段。",
      instruction: buildSpeakerInstruction({ input, context, character }),
      successCriteria: ["公开输出可直接渲染给用户", "内容承接当前用户输入或场景推进", "没有协议说明或字段解释混入正文"],
    },
    progress: buildTavernAgentFlowProgress(input.story),
    messages: [...context.historyMessages, buildCurrentInstructionMessage(input, context), ...previousPublicMessages],
    references: buildTavernAgentFlowReferences({
      story: input.story,
      characters: input.characters,
      presentation: context.presentation,
      target: "character",
      speaker: character,
      files: context.references,
    }),
    output: getSpeakerOutputKeys(context),
  });
};

const createSpeakerMessage = ({
  input,
  context,
  character,
  rawText,
}: {
  input: TavernAgentFlowInput;
  context: TavernAgentFlowContext;
  character: TavernCharacter;
  rawText: string;
}): TavernMessage => ({
  id: createTimestampId("msg"),
  roomId: input.story.roomConfig.id,
  turnId: input.turnId,
  role: "character",
  characterId: character.id,
  kind: "character_agent_output",
  presentationProfileId: context.presentation.id,
  body: createTavernAgentOutputMessageBody({
    rawText,
    output: getSpeakerOutputKeys(context),
  }),
  createdAt: getCurrentTimestamp(),
  status: "done",
});

export const runTavernAgentFlowSpeaker = async ({
  input,
  context,
  character,
  previousPublicMessages,
  index,
  runAgent,
}: {
  input: TavernAgentFlowInput;
  context: TavernAgentFlowContext;
  character: TavernCharacter;
  previousPublicMessages: AgentProtocolMessage[];
  index: number;
  runAgent: TavernAgentFlowRunAgent;
}): Promise<TavernAgentFlowSpeakerResult> => {
  const prepared = prepareSpeakerRequest({
    input,
    context,
    character,
    previousPublicMessages,
  });
  input.onEvent?.({ type: "speaker_start", character, index });

  const output = await runAgent({
    workspacePath: input.workspacePath,
    sessionRootDir: tavernAgentFlowSessionRootDir(input.story),
    agentRoleId: tavernAgentFlowCharacterRoleId(input.story, character),
    runtimeModel: input.runtimeModel,
    userMessage: prepared.prompt,
    systemPrompt: `你正在扮演 ${character.name}。必须遵守用户消息里的结构化输入和输出协议。`,
    onTextDelta: (delta) => input.onEvent?.({ type: "speaker_delta", character, index, delta }),
  });
  const parsed = AgentProtocol.parse(output.text);
  const publicText = getTavernAgentFlowPublicText({
    parsed,
    preferredOutput: getTavernAgentFlowPublicOutputKey(context.presentation),
  });
  const message = createSpeakerMessage({
    input,
    context,
    character,
    rawText: output.text,
  });

  input.onEvent?.({ type: "speaker_done", character, index, rawText: output.text, publicText });

  return {
    character,
    rawText: output.text,
    parsed,
    prepared,
    publicText,
    message,
    agentSession: output.agentSession,
    taskId: output.taskId,
  };
};

export const appendSpeakerPublicMessage = ({
  messages,
  character,
  publicText,
}: {
  messages: AgentProtocolMessage[];
  character: TavernCharacter;
  publicText: string;
}) => {
  const text = publicText.trim();
  if (!text) {
    return messages;
  }

  return [
    ...messages,
    createTavernAgentFlowPublicMessage({
      character,
      content: text,
    }),
  ];
};
