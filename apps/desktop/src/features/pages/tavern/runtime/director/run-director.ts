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
  const normalizedDecision = readTavernDirectorDecisionOutput(result.output, "directorDecision") ??
    readTavernDirectorDecisionStep(result.steps, "directorDecision");
  if (normalizedDecision) {
    return normalizedDecision;
  }

  const decisionText = result.steps.find((step) =>
    step.outputKey === "directorRaw" ||
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

const readTavernDirectorDecisionOutput = (
  output: unknown,
  outputKey: string,
): TavernDirectorDecision | null => {
  if (!output || typeof output !== "object") {
    return null;
  }

  return normalizeTavernDirectorDecision(
    (output as Record<string, unknown>)[outputKey],
  );
};

const readTavernDirectorDecisionStep = (
  steps: Array<{ outputKey: string; output?: unknown }>,
  outputKey: string,
): TavernDirectorDecision | null =>
  normalizeTavernDirectorDecision(
    steps.find((step) => step.outputKey === outputKey)?.output,
  );

const normalizeTavernDirectorDecision = (
  value: unknown,
): TavernDirectorDecision | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const speakerIds = readStringArray(record.speakerIds);
  const nonverbalReplyIds = readStringArray(record.nonverbalReplyIds);

  return {
    speakerIds,
    nonverbalReplyIds,
    narrator: readOptionalString(record.narrator),
    randomEvent: readOptionalString(record.randomEvent),
    illustrationHints: readStringArray(record.illustrationHints),
    ambientActions: Array.isArray(record.ambientActions)
      ? record.ambientActions.flatMap((item) => {
          if (!item || typeof item !== "object") {
            return [];
          }
          const action = item as Record<string, unknown>;
          const characterId = readOptionalString(action.characterId);
          const actionText = readOptionalString(action.action);
          return characterId && actionText
            ? [{ characterId, action: actionText }]
            : [];
        })
      : [],
    reason: readOptionalString(record.reason),
  };
};

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : [])
    : [];

const readOptionalString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;
