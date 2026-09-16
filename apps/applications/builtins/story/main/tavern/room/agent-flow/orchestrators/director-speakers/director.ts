import { AgentProtocol } from "../../../agent-protocol";
import type { AgentProtocolMessage } from "../../../agent-protocol/types";
import { parseTavernAgentFlowDirectorDecision } from "./decision";
import { buildTavernAgentFlowProgress, buildTavernAgentFlowReferences } from "./prompt-context";
import { tavernAgentFlowSessionRootDir } from "../../runtime/session";
import { tavernAgentFlowDirectorRoleId } from "./roles";
import type {
  TavernAgentFlowContext,
  TavernAgentFlowDirectorResult,
  TavernAgentFlowInput,
  TavernAgentFlowRunAgent,
} from "../../types";

const buildCurrentInstructionMessage = (
  input: TavernAgentFlowInput,
  context: TavernAgentFlowContext,
): AgentProtocolMessage => ({
  role: input.trigger?.type === "scene_drive" ? "system" : "user",
  speaker: input.trigger?.type === "scene_drive" ? "场景推进指令" : context.playerName,
  content: context.currentInstruction,
  visibility: "public",
});

const formatCandidateCharacters = (context: TavernAgentFlowContext) =>
  context.candidateCharacters.map((character) => `${character.id}: ${character.name}`).join("\n");

const buildDirectorDecisionSchema = (context: TavernAgentFlowContext) =>
  [
    "decision 必须输出紧凑 JSON 对象，不要包裹 Markdown，不要写自然语言前后缀：",
    `{"speakerIds":["角色id"],"reason":"调度理由"}`,
    `speakerIds 只能从候选角色中选择，最多 ${context.maxSpeakers} 个，按本轮发言顺序排列。`,
    "reason 用一句话说明为什么调度这些角色。",
    "如果本轮需要先给用户展示一段旁白，把公开旁白写入 narrative；如果不需要旁白，narrative 留空。",
  ].join("\n");

const buildCurrentInputModeInstruction = (input: TavernAgentFlowInput, context: TavernAgentFlowContext) => {
  if (input.trigger?.type === "scene_drive") {
    return "当前输入是系统场景推进指令，不是用户角色说出口的话；导演应据此安排公开旁白或角色行动推进。";
  }

  if (context.presentation.userInputMode === "speech") {
    return `当前输入是${context.playerName}在场内说出口的话或可见动作；不要把它当成幕后剧情指令，调度应优先安排被问到、被影响或最该现场回应的角色。`;
  }

  if (context.presentation.userInputMode === "story_directive") {
    return "当前输入是剧情指令或推进方向；导演应把它转译成公开场景变化和角色调度，但不要替用户补完关键选择。";
  }

  return "当前输入是用户意图；导演应按意图调度角色和公开后果。";
};

const prepareDirectorRequest = (input: TavernAgentFlowInput, context: TavernAgentFlowContext) =>
  AgentProtocol.prepare({
    system: [
      "你是当前互动的导演 agent，只负责判断本轮应该调度哪些角色。",
      "你不写角色公开回复，不替角色说话，不推进完整剧情闭环。",
      "你可以在 narrative 中写一段短公开旁白，用于补足场景变化、环境压力或角色入场前的可见反应。",
      "输出协议完全按 AgentProtocol 要求填写。",
    ].join("\n"),
    role: {
      name: "互动导演",
      description: "根据用户输入、场景状态、角色目标和上一轮公开发言决定本轮角色调度。",
      goals: ["选择最应该回应或行动的角色", "保持互动节奏清楚", "避免无关角色抢话"],
      constraints: ["不得选择候选列表之外的角色", "不得替角色输出对白正文", "不得泄露私有记忆"],
    },
    task: {
      goal: "决定本轮要按顺序调度的角色，并在必要时给出短公开旁白。",
      instruction: [
        `当前呈现模式：${context.presentation.label}。`,
        buildCurrentInputModeInstruction(input, context),
        "候选角色：",
        formatCandidateCharacters(context),
        "",
        buildDirectorDecisionSchema(context),
      ].join("\n"),
      successCriteria: ["decision 是可解析 JSON", "speakerIds 非空", "角色顺序符合当前互动压力"],
      constraints: [`最多调度 ${context.maxSpeakers} 个角色`, "旁白只写可见场景变化，不替角色完成回应"],
    },
    progress: buildTavernAgentFlowProgress(input.story),
    messages: [...context.historyMessages, buildCurrentInstructionMessage(input, context)],
    references: buildTavernAgentFlowReferences({
      story: input.story,
      characters: context.candidateCharacters,
      presentation: context.presentation,
      target: "director",
    }),
    output: ["privateThought", "decision", "narrative", "summary"],
  });

export const runTavernAgentFlowDirector = async ({
  input,
  context,
  runAgent,
}: {
  input: TavernAgentFlowInput;
  context: TavernAgentFlowContext;
  runAgent: TavernAgentFlowRunAgent;
}): Promise<TavernAgentFlowDirectorResult> => {
  const prepared = prepareDirectorRequest(input, context);
  input.onEvent?.({ type: "director_start" });

  const output = await runAgent({
    workspacePath: input.workspacePath,
    sessionRootDir: tavernAgentFlowSessionRootDir(),
    agentRoleId: tavernAgentFlowDirectorRoleId(input.story),
    runtimeModel: input.runtimeModel,
    userMessage: prepared.prompt,
    systemPrompt: "你正在执行酒馆互动导演任务。必须遵守用户消息里的结构化输入和输出协议。",
    onTextDelta: (delta) => input.onEvent?.({ type: "director_delta", delta }),
  });
  const protocolData = AgentProtocol.parse(output.text, prepared.format);
  const decision = parseTavernAgentFlowDirectorDecision({
    protocolData,
    maxSpeakers: context.maxSpeakers,
  });

  input.onEvent?.({ type: "director_done", rawText: output.text, decision });

  return {
    rawText: output.text,
    protocolData,
    prepared,
    decision,
    agentSession: output.agentSession,
    taskId: output.taskId,
  };
};
