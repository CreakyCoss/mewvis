import type { RuntimeModelInput } from "@/agent-client/protocol";
import type { StoryContextPackage } from "@/features/story";
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
  buildTavernDirectorRuntimeInstruction,
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
  storyContext?: StoryContextPackage;
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
  storyContext,
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
    storyContext,
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
    runtimeInstruction: buildTavernDirectorRuntimeInstruction(directorPromptContext),
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
