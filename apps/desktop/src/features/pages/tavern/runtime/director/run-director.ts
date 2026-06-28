import type { RuntimeModelInput } from "@/agent-client/protocol";
import type { AgentClientCollaborationEvent } from "@/agent-client/contracts";
import type { StoryContextPackage } from "@/features/story";
import type {
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
} from "../../types";
import type {
  TavernDirectorDecision,
} from "./decision";
import {
  parseTavernDirectorDecision,
} from "./decision";
import {
  buildTavernDirectorCollaborationPlan,
  runTavernCollaboration,
} from "../collaboration";

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
  onCollaborationEvent?: (event: AgentClientCollaborationEvent) => void;
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
  onCollaborationEvent,
}: RunTavernDirectorInput): Promise<TavernDirectorDecision> => {
  const { input, promptContext } = buildTavernDirectorCollaborationPlan({
    workspacePath,
    runtimeAgentId,
    runtimeModel,
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
  const result = await runTavernCollaboration({
    ...input,
    onEvent: onCollaborationEvent,
  });
  const decisionText = result.steps.find((step) =>
    step.outputKey === "directorDecision"
  )?.text ?? "";

  try {
    return parseTavernDirectorDecision(
      decisionText,
      characters,
      maxSpeakers,
      promptContext.canConsiderRandomEvent,
      promptContext.canRequestIllustrationHints,
    );
  } catch {
    return {
      speakerIds: [],
      narrator: undefined,
      reason: undefined,
    };
  }
};
