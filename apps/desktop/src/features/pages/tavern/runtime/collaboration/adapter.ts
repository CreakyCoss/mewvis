import {
  buildTavernBridgeSystemPrompt,
} from "../conversation";
import {
  buildTavernDirectorPromptContext,
  buildTavernDirectorRuntimeInstruction,
} from "../director/prompt";
import type {
  TavernDirectorPromptContext,
} from "../director/prompt";
import {
  buildTavernReplyAgentRequest,
} from "../reply/request";
import {
  tavernBridgeSessionRootDir,
  tavernCharacterAgentRoleId,
  tavernDirectorAgentRoleId,
} from "../../core";
import type {
  TavernDirectorCollaborationInput,
  TavernSpeakerCollaborationInput,
  TavernCollaborationInput,
} from "./types";

export type TavernDirectorCollaborationPlan = {
  input: TavernCollaborationInput;
  promptContext: TavernDirectorPromptContext;
};

export const buildTavernDirectorCollaborationPlan = ({
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
}: TavernDirectorCollaborationInput): TavernDirectorCollaborationPlan => {
  const directorPromptContext = buildTavernDirectorPromptContext({
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
  const directorRoleId = tavernDirectorAgentRoleId(room);

  return {
    input: {
      type: "collaboration",
      workspacePath,
      sessionRootDir: tavernBridgeSessionRootDir(room),
      agents: [
        {
          id: directorRoleId,
          label: "酒馆导演",
          agentId: runtimeAgentId,
          runtimeModel,
          systemPrompt: buildTavernBridgeSystemPrompt(room),
        },
      ],
      workflow: {
        id: "tavern.director-turn",
        label: "酒馆导演调度",
        version: "1",
        steps: [
          {
            id: "director",
            type: "agent",
            agentRoleId: directorRoleId,
            runtimeModel,
            userMessage: directorPromptContext.isSceneDriveTurn
              ? "请在没有用户角色发言的前提下，自推动本轮酒馆场景，并只输出严格合法 JSON。"
              : "请决定本轮酒馆对话的发言顺序、可选在场动作和可选插图提示，并只输出严格合法 JSON。",
            requestContext: directorPromptContext.requestContext,
            runtimeInstruction: buildTavernDirectorRuntimeInstruction(directorPromptContext),
            outputKey: "directorDecision",
          },
        ],
        metadata: {
          roomId: room.id,
          currentUserText,
          selectedTargetCharacterIds,
        },
      },
    },
    promptContext: directorPromptContext,
  };
};

export const buildTavernDirectorCollaborationInput = (
  input: TavernDirectorCollaborationInput,
): TavernCollaborationInput => buildTavernDirectorCollaborationPlan(input).input;

export const buildTavernSpeakerCollaborationInput = ({
  workspacePath,
  runtimeAgentId,
  runtimeModel,
  room,
  speakers,
  characters,
  messages,
  references,
  currentUserText,
  storyContext,
  turnInstructionByCharacterId = {},
  allowNonverbalReplyCharacterIds = [],
}: TavernSpeakerCollaborationInput): TavernCollaborationInput => {
  const allowNonverbalReplyIds = new Set(allowNonverbalReplyCharacterIds);
  const requests = speakers.map((speaker) => ({
    speaker,
    request: buildTavernReplyAgentRequest({
      room,
      activeCharacter: speaker,
      characters,
      messages,
      references,
      currentUserText,
      turnInstruction: turnInstructionByCharacterId[speaker.id],
      allowNonverbalReply: allowNonverbalReplyIds.has(speaker.id),
      storyContext,
    }),
  }));

  return {
    type: "collaboration",
    workspacePath,
    sessionRootDir: tavernBridgeSessionRootDir(room),
    agents: requests.map(({ speaker, request }) => ({
      id: tavernCharacterAgentRoleId(room, speaker),
      label: speaker.name,
      agentId: runtimeAgentId,
      runtimeModel,
      systemPrompt: request.systemPrompt,
    })),
    workflow: {
      id: "tavern.speaker-replies",
      label: "酒馆角色回复",
      version: "1",
      steps: requests.map(({ speaker, request }, index) => ({
        id: `speaker-${speaker.id}-${index + 1}`,
        type: "agent" as const,
        agentRoleId: request.agentRoleId,
        runtimeModel,
        userMessage: request.userMessage,
        requestContext: request.requestContext,
        runtimeInstruction: request.runtimeInstruction,
        outputKey: `reply:${speaker.id}`,
      })),
      metadata: {
        roomId: room.id,
        speakerIds: speakers.map((speaker) => speaker.id),
        currentUserText,
      },
    },
  };
};
