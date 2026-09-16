import type { RuntimeModelInput, RuntimeSessionRef } from "../../runtime-types";
import type { TavernCharacter, TavernStoryData } from "../model";
import type { TavernPresentationProfile } from "../../manage/model";
import type { TavernMessage } from "../model/message";
import type {
  AgentProtocolData,
  AgentProtocolMessage,
  AgentProtocolPrepared,
} from "../agent-protocol/types";

export type TavernAgentFlowTrigger = {
  type: "user" | "scene_drive";
  directive?: string;
};

export type TavernAgentFlowOrchestrationId = "director-speakers";

export type TavernAgentFlowPresentation = TavernPresentationProfile;

export type TavernAgentFlowRunAgentInput = {
  workspacePath: string;
  sessionRootDir?: string | null;
  agentRoleId: string;
  runtimeModel?: RuntimeModelInput | null;
  userMessage: string;
  systemPrompt?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
  allowedTools?: string[];
  enabledSkills?: string[];
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

export type TavernAgentFlowRunAgentOutput = {
  text: string;
  thinking?: string | null;
  agentSession?: RuntimeSessionRef | null;
  taskId: string;
};

export type TavernAgentFlowRunAgent = (input: TavernAgentFlowRunAgentInput) => Promise<TavernAgentFlowRunAgentOutput>;

export type TavernAgentFlowEvent =
  | { type: "director_start" }
  | { type: "director_delta"; delta: string }
  | { type: "director_narrator"; text: string }
  | { type: "director_done"; rawText: string; decision: TavernAgentFlowDirectorDecision }
  | { type: "speaker_start"; character: TavernCharacter; index: number }
  | { type: "speaker_delta"; character: TavernCharacter; index: number; delta: string }
  | { type: "speaker_done"; character: TavernCharacter; index: number; rawText: string; publicText: string };

export type TavernAgentFlowInput = {
  orchestration?: TavernAgentFlowOrchestrationId;
  workspacePath: string;
  runtimeModel: RuntimeModelInput;
  story: TavernStoryData;
  messages: TavernMessage[];
  currentUserText: string;
  trigger?: TavernAgentFlowTrigger;
  turnId?: string;
  selectedCharacterIds?: string[];
  maxSpeakers?: number;
  runAgent?: TavernAgentFlowRunAgent;
  onEvent?: (event: TavernAgentFlowEvent) => void;
};

export type TavernAgentFlowSessionInput = {
  workspacePath: string;
};

export type TavernAgentFlowContext = {
  presentation: TavernAgentFlowPresentation;
  candidateCharacters: TavernCharacter[];
  playerName: string;
  currentInstruction: string;
  historyMessages: AgentProtocolMessage[];
  maxSpeakers: number;
};

export type TavernAgentFlowDirectorDecision = {
  speakerIds: string[];
  reason: string;
  narratorText?: string;
};

export type TavernAgentFlowDirectorResult = {
  rawText: string;
  protocolData: AgentProtocolData[];
  prepared: AgentProtocolPrepared;
  decision: TavernAgentFlowDirectorDecision;
  agentSession?: RuntimeSessionRef | null;
  taskId: string;
};

export type TavernAgentFlowSpeakerResult = {
  character: TavernCharacter;
  rawText: string;
  protocolData: AgentProtocolData[];
  prepared: AgentProtocolPrepared;
  publicText: string;
  message: TavernMessage;
  agentSession?: RuntimeSessionRef | null;
  taskId: string;
};

export type TavernAgentFlowDirectorSpeakersResult = {
  orchestration: "director-speakers";
  presentation: TavernAgentFlowPresentation;
  director: TavernAgentFlowDirectorResult;
  narratorMessage?: TavernMessage;
  speakers: TavernAgentFlowSpeakerResult[];
  messages: TavernMessage[];
  publicMessages: AgentProtocolMessage[];
};

export type TavernAgentFlowResult = TavernAgentFlowDirectorSpeakersResult;
