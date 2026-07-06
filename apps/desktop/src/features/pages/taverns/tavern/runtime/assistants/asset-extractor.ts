import { appendReferencesToPrompt } from "@/features/ai/components/context-tools";
import type { RuntimeModelInput } from "@/agent-client/types";
import type { TavernStoryContextPackage } from "@/features/pages/taverns/tavern/adapters/story";
import type { TavernMessage, TavernReferencedFile } from "../../types";
import type { TavernCharacter, TavernRoom } from "@/features/pages/taverns/manage/model";
import { buildTavernBridgeSystemPrompt } from "../conversation";
import { tavernArchivistAgentRoleId, tavernBridgeSessionRootDir } from "../../core";
import { runTavernRuntimeAgent } from "../agent";
import { parseTavernAssetDraft } from "./asset-extractor/parsing";
import { buildTavernAssetExtractionPrompt } from "./asset-extractor/prompt";
import type { TavernExtractedAssetDraft } from "./asset-extractor/types";

export type { TavernExtractedAssetDraft } from "./asset-extractor/types";

export type RunTavernAssetExtractionInput = {
  workspacePath: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  sourceMessages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
  storyContext?: TavernStoryContextPackage;
};

export const runTavernAssetExtraction = async ({
  workspacePath,
  runtimeModel,
  room,
  characters,
  messages,
  sourceMessages,
  references,
  currentUserText,
  storyContext,
}: RunTavernAssetExtractionInput): Promise<TavernExtractedAssetDraft> => {
  const prompt = buildTavernAssetExtractionPrompt({
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
    agentRoleId: tavernArchivistAgentRoleId(room),
    runtimeModel,
    systemPrompt: buildTavernBridgeSystemPrompt(room),
    userMessage: "请整理本轮酒馆对话中值得沉淀的剧情资产，并只输出严格合法 JSON。",
    requestContext: appendReferencesToPrompt(prompt, references),
    runtimeInstruction: [
      "你是酒馆模式的剧情资产整理员。",
      "你的任务是把新一轮对话中值得长期保存的信息整理成待确认草稿。",
      "你只输出符合 schema 的严格合法 JSON 对象，不要代码块。",
    ].join("\n"),
  });

  try {
    return parseTavernAssetDraft({
      text: result.text,
      room,
      characters,
      sourceMessages,
    });
  } catch {
    return {
      sourceMessageIds: sourceMessages.map((message) => message.id),
      sceneMemories: [],
      characterMemories: [],
      lorebookEntries: [],
    };
  }
};
