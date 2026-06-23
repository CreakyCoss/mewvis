import type { RuntimeModelInput } from "@/agent-client/protocol";
import type {
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
} from "../../types";
import {
  buildTavernBridgeSystemPrompt,
} from "../conversation";
import type {
  TavernDirectorDecision,
} from "./decision";
import {
  parseTavernDirectorDecision,
} from "./decision";
import {
  tavernBridgeSessionRootDir,
  tavernDirectorAgentRoleId,
} from "../../core";
import { runTavernRuntimeAgent } from "../agent";
import {
  buildTavernDirectorPromptContext,
} from "./prompt";

export {
  parseTavernDirectorDecision,
  shouldOfferTavernDirectorRandomEvent,
} from "./decision";
export type { TavernDirectorDecision } from "./decision";

export type RunTavernDirectorInput = {
  workspacePath: string;
  runtimeAgentId: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
  turnTrigger?: {
    type: "user" | "scene_drive";
    directive?: string;
  };
  selectedTargetCharacterIds?: string[];
  maxSpeakers?: number;
  randomEventOpportunity?: boolean;
};

export const runTavernDirector = async ({
  workspacePath,
  runtimeAgentId,
  runtimeModel,
  room,
  characters,
  messages,
  references,
  currentUserText,
  turnTrigger = { type: "user" },
  selectedTargetCharacterIds = [],
  maxSpeakers = 3,
  randomEventOpportunity,
}: RunTavernDirectorInput): Promise<TavernDirectorDecision> => {
  const directorPromptContext = buildTavernDirectorPromptContext({
    room,
    characters,
    messages,
    references,
    currentUserText,
    turnTrigger,
    selectedTargetCharacterIds,
    maxSpeakers,
    randomEventOpportunity,
  });
  const result = await runTavernRuntimeAgent({
    agentId: runtimeAgentId,
    workspacePath,
    sessionRootDir: tavernBridgeSessionRootDir(room),
    agentRoleId: tavernDirectorAgentRoleId(room),
    runtimeModel,
    systemPrompt: buildTavernBridgeSystemPrompt(room),
    userMessage: directorPromptContext.isSceneDriveTurn
      ? "请在没有用户角色发言的前提下，自推动本轮酒馆场景，并只输出严格合法 JSON。"
      : "请决定本轮酒馆对话的发言顺序、可选在场动作和可选插图提示，并只输出严格合法 JSON。",
    requestContext: directorPromptContext.requestContext,
    runtimeInstruction: [
      "你是酒馆模式的导演 Agent。",
      directorPromptContext.isSceneDriveTurn
        ? "你的职责是在没有用户角色发言时，根据场景目标、剧情结构、近期对话和角色状态，推进下一轮公开场景。"
        : "你的职责是根据用户输入、场景目标、剧情结构和角色状态，决定下一轮谁应该发言。",
      directorPromptContext.isSceneDriveTurn
        ? "不要替用户角色说话、回答、行动或下决定；如果需要用户选择，应让剧情停在可介入的位置。"
        : "",
      `当前呈现规则：${directorPromptContext.presentationProfile.label}。${directorPromptContext.presentationProfile.directorAddendum}`,
      "当前系统叙事、酒馆风格和写作规则来自 requestContext 中 target=\"director\" 的 prompt_block；这些是用户保存后的文本，必须按文本执行。",
      "可以插入一条简短旁白来做环境过渡，但不要新增关键事实，不要代替角色行动或长篇发言。",
      directorPromptContext.canConsiderRandomEvent
        ? "本轮可以考虑随机事件；如果触发，只写公开可观察且不解决主线的小事件。"
        : "本轮不要触发随机事件，randomEvent 必须为空字符串。",
      directorPromptContext.canRequestIllustrationHints
        ? "本轮可以给出插图提示；插图提示只描述公开可见画面，不参与角色发言。"
        : "本轮不要生成插图提示，illustrationHints 必须为空数组。",
      "ambientActions 只用于未发言角色的公开可观察动作，不是角色对白，也不要写心理。",
      directorPromptContext.directorOnlyAllowed
        ? "当前阶段允许 speakerIds/nonverbalReplyIds 为空；只有确实需要公开角色发言或非语言近景反应时才安排角色。"
        : directorPromptContext.selectedTargetsCanStaySilent
        ? "当前候选回复/点名目标可以选择不开口；若用户要求目标只动作/神态回应，仍应安排该目标 nonverbalReplyIds，由角色 Agent 输出动作和心理。"
        : "只要有可用角色，就必须在 speakerIds 或 nonverbalReplyIds 中返回至少一个角色 id；不要用空数组表达沉默。",
      directorPromptContext.schedulingInstruction,
      "JSON 字符串内不要使用未转义英文双引号；引用用户短句时改用中文引号。",
      "只输出严格合法 JSON，不要输出 Markdown、代码块或解释。",
    ].filter(Boolean).join("\n"),
  });

  try {
    return parseTavernDirectorDecision(
      result.text,
      characters,
      maxSpeakers,
      directorPromptContext.canConsiderRandomEvent,
      directorPromptContext.canRequestIllustrationHints,
    );
  } catch {
    return {
      speakerIds: [],
      narrator: undefined,
      reason: undefined,
    };
  }
};
