import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type {
  AgentClientCollaborationInput,
  AgentClientCollaborationModeInput,
  RuntimeModelInput,
} from "@/agent-client/types";
import type { TavernStoryContextPackage } from "@/features/pages/taverns/room/story-context";
import type { TavernMessage, TavernReferencedFile } from "@/features/pages/taverns/tavern/types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";

export type TavernCollaborationInput = AgentClientCollaborationInput | AgentClientCollaborationModeInput;

type TavernDirectorBaseCollaborationInput = {
  workspacePath: string;
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
  storyContext?: TavernStoryContextPackage;
};

export type TavernSpeakerCollaborationInput = {
  workspacePath: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoom;
  speakers: TavernCharacter[];
  characters: TavernCharacter[];
  messages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
  storyContext?: TavernStoryContextPackage;
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
