import type {
  AgentClientCollaborationInput,
  AgentClientCollaborationModeInput,
} from "@/agent-client/contracts";
import type {
  RuntimeModelInput,
} from "@/agent-client/protocol";
import type { StoryContextPackage } from "@/features/story";
import type {
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
} from "../../types";

export type TavernCollaborationInput =
  | AgentClientCollaborationInput
  | AgentClientCollaborationModeInput;

type TavernDirectorBaseCollaborationInput = {
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

export type TavernSpeakerCollaborationInput = {
  workspacePath: string;
  runtimeAgentId: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoom;
  speakers: TavernCharacter[];
  characters: TavernCharacter[];
  messages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
  storyContext?: StoryContextPackage;
  turnInstructionByCharacterId?: Record<string, string | undefined>;
  allowNonverbalReplyCharacterIds?: string[];
};

export type TavernCollaborationSpeakerInput = {
  character: TavernCharacter;
  runtimeModel: RuntimeModelInput;
  turnInstruction?: string;
  allowNonverbalReply?: boolean;
};

export type TavernDirectorLoopCollaborationInput = TavernDirectorBaseCollaborationInput & {
  speakerInputs: TavernCollaborationSpeakerInput[];
  maxRounds?: number;
};
