import type { RuntimeModelInput } from "@/agent-client/protocol";
import type {
  TavernGeneratedPresetJson,
  TavernPresentationProfileId,
  TavernPromptStyleId,
  TavernSystemNarrativePresetId,
  TavernRoomSettings,
} from "../../types";
import type {
  TavernPlatformStyleId,
  TavernQualityRuleId,
} from "../../prompt-registry/rule-layers/types";
import { parseTavernGeneratedPresetJsonText } from "../../generated-preset-parser";
import { runTavernOneShotAgent } from "../agent";
import {
  buildTavernGeneratedPresetAgentSystemPrompt,
  buildTavernGeneratedPresetRequestContext,
} from "./generated-preset/prompt";

export {
  buildTavernGeneratedPresetAgentSystemPrompt,
} from "./generated-preset/prompt";

export type TavernGeneratedPresetAgentDraft = {
  title?: string;
  promptStyleId?: TavernPromptStyleId;
  promptSeed?: {
    systemNarrativePresetId?: TavernSystemNarrativePresetId;
    ruleCompositionId?: TavernPlatformStyleId;
    qualityRuleIds?: TavernQualityRuleId[];
  };
  presentationProfileId?: TavernPresentationProfileId;
  userPersonaName?: string;
  premise?: string;
  background?: string;
  worldInfo?: string;
  storyGoal?: string;
  characterSeeds?: Array<{
    name?: string;
    role?: string;
    description?: string;
    speakingStyle?: string;
    writingStyle?: string;
  }>;
  advanced?: {
    characterCount?: number;
    enableStatusTracking?: boolean;
    enableRandomEvents?: boolean;
    randomEventProbability?: number;
    enableIllustrationHints?: boolean;
    settings?: Partial<TavernRoomSettings>;
  };
};

export type RunTavernGeneratedPresetAgentInput = {
  workspacePath: string;
  agentId?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  draft: TavernGeneratedPresetAgentDraft;
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

const GENERATED_PRESET_AGENT_ROLE_ID = "tavern-one-shot-preset-builder";
export const runTavernGeneratedPresetAgent = async ({
  workspacePath,
  agentId,
  runtimeModel,
  draft,
  onTextDelta,
  onThinkingDelta,
}: RunTavernGeneratedPresetAgentInput): Promise<{
  text: string;
  preset: TavernGeneratedPresetJson;
}> => {
  const result = await runTavernOneShotAgent({
    agentId,
    workspacePath,
    agentRoleId: GENERATED_PRESET_AGENT_ROLE_ID,
    runtimeModel,
    systemPrompt: buildTavernGeneratedPresetAgentSystemPrompt(),
    requestContext: buildTavernGeneratedPresetRequestContext(draft),
    runtimeInstruction: "生成可直接导入的酒馆标准 JSON。只输出 JSON。",
    userMessage: "根据 request_context 中的草稿生成酒馆预设 JSON。",
    allowedTools: [],
    enabledSkills: [],
    onTextDelta,
    onThinkingDelta,
  });

  return {
    text: result.text,
    preset: parseTavernGeneratedPresetJsonText(result.text),
  };
};
