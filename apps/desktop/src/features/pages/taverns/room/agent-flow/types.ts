import type { RuntimeModelInput, RuntimeSessionRecordRef } from "@/agent-client/types";
import type { TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import type {
  TavernCharacter,
  TavernPresentationProfile,
  TavernPresentationProfileId,
} from "@/features/pages/taverns/manage/model";
import type { TavernMessage, TavernReferencedFile } from "@/features/pages/taverns/tavern/types";
import type {
  AgentProtocolMessage,
  AgentProtocolParseResult,
  AgentProtocolPrepared,
} from "@/features/pages/taverns/room/agent-protocol/types";

export type TavernAgentFlowTrigger = {
  type: "user" | "scene_drive";
  directive?: string;
};

export type TavernAgentFlowOrchestrationId = "director-speakers";

export type TavernAgentFlowSupportedPresentationId = Extract<
  TavernPresentationProfileId,
  "dialogue-chat" | "novel-prose"
>;

export type TavernAgentFlowPresentation = TavernPresentationProfile & {
  id: TavernAgentFlowSupportedPresentationId;
};

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
  agentSession?: RuntimeSessionRecordRef | null;
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
  room: TavernRoomRuntime;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  references?: TavernReferencedFile[];
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
  room: TavernRoomRuntime;
};

export type TavernAgentFlowContext = {
  presentation: TavernAgentFlowPresentation;
  candidateCharacters: TavernCharacter[];
  userPersonaName: string;
  currentInstruction: string;
  historyMessages: AgentProtocolMessage[];
  references: TavernReferencedFile[];
  maxSpeakers: number;
};

export type TavernAgentFlowDirectorDecision = {
  speakerIds: string[];
  reason: string;
  narratorText?: string;
};

export type TavernAgentFlowDirectorResult = {
  rawText: string;
  parsed: AgentProtocolParseResult;
  prepared: AgentProtocolPrepared;
  decision: TavernAgentFlowDirectorDecision;
  agentSession?: RuntimeSessionRecordRef | null;
  taskId: string;
};

export type TavernAgentFlowSpeakerResult = {
  character: TavernCharacter;
  rawText: string;
  parsed: AgentProtocolParseResult;
  prepared: AgentProtocolPrepared;
  publicText: string;
  message: TavernMessage;
  agentSession?: RuntimeSessionRecordRef | null;
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
