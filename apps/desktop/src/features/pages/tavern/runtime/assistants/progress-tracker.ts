import {
  appendReferencesToPrompt,
} from "@/features/ai/components/context-tools";
import type { RuntimeModelInput } from "@/agent-client/types";
import type { StoryContextPackage } from "@/features/story";
import {
  tavernBridgeSessionRootDir,
  tavernProgressTrackerAgentRoleId,
} from "../../core";
import type {
  TavernCharacter,
  TavernFactEvent,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
} from "../../types";
import {
  buildTavernBridgeSystemPrompt,
} from "../conversation";
import { runTavernRuntimeAgent } from "../agent";
import {
  parseTavernProgressFactEvents,
} from "./progress-tracker/parsing";
import {
  buildTavernProgressTrackingPrompt,
} from "./progress-tracker/prompt";

export type RunTavernProgressTrackingInput = {
  workspacePath: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  sourceMessages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
  turnId: string;
  storyContext?: StoryContextPackage;
};

export const runTavernProgressTracking = async ({
  workspacePath,
  runtimeModel,
  room,
  characters,
  messages,
  sourceMessages,
  references,
  currentUserText,
  turnId,
  storyContext,
}: RunTavernProgressTrackingInput): Promise<TavernFactEvent[]> => {
  const prompt = buildTavernProgressTrackingPrompt({
    room,
    characters,
    messages,
    sourceMessages,
    currentUserText,
    storyContext,
  });
  const result = await runTavernRuntimeAgent({
    workspacePath,
    sessionRootDir: tavernBridgeSessionRootDir(room),
    agentRoleId: tavernProgressTrackerAgentRoleId(room),
    runtimeModel,
    systemPrompt: buildTavernBridgeSystemPrompt(room),
    userMessage: "请从本轮公开对话中抽取会驱动状态规则的事实事件，并只输出严格合法 JSON。",
    requestContext: appendReferencesToPrompt(prompt, references),
    runtimeInstruction: [
      "你是酒馆模式的状态事实抽取 Agent。",
      "你只抽取明确事实事件，不能决定状态数值，不能补设定。",
      "只输出符合 schema 的严格合法 JSON 对象，不要代码块。",
    ].join("\n"),
  });

  try {
    return parseTavernProgressFactEvents({
      text: result.text,
      room,
      characters,
      sourceMessages,
      turnId,
    });
  } catch {
    return [];
  }
};
