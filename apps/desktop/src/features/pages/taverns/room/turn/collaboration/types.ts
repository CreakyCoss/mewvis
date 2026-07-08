import type { TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import type {
  AgentClientCollaborationInput,
  AgentClientCollaborationModeInput,
  RuntimeModelInput,
} from "@/agent-client/types";
import type { TavernMessage, TavernReferencedFile } from "@/features/pages/taverns/tavern/types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";

export type TavernCollaborationInput = AgentClientCollaborationInput | AgentClientCollaborationModeInput;

type TavernDirectorBaseCollaborationInput = {
  workspacePath: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoomRuntime;
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
};

export type TavernSpeakerCollaborationInput = {
  workspacePath: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoomRuntime;
  speakers: TavernCharacter[];
  characters: TavernCharacter[];
  messages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
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
