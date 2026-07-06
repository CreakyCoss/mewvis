import type { TavernPresentationProfileId, TavernRoom } from "../manage/model";

export type TavernMessageActorRef =
  { type: "user" } | { type: "character"; characterId: string } | { type: "narrator" };

export type TavernMessageSegment =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "dialogue";
      text: string;
      speaker: TavernMessageActorRef;
    }
  | {
      type: "action";
      text: string;
      actor?: TavernMessageActorRef;
    }
  | {
      type: "thought";
      text: string;
      owner: TavernMessageActorRef;
      visibility: "private" | "public";
    }
  | {
      type: "narration";
      text: string;
      actor?: TavernMessageActorRef;
    };

export type TavernMessageKind = "user_input" | "character_reply" | "narration" | "narrative_beat";

export type TavernMessage = {
  id: string;
  roomId: string;
  sceneId?: string;
  sceneInstanceId?: string;
  turnId?: string;
  kind?: TavernMessageKind;
  role: "user" | "character" | "narrator";
  characterId?: string;
  presentationProfileId?: TavernPresentationProfileId;
  content: string;
  segments?: TavernMessageSegment[];
  thought?: string;
  targetCharacterIds?: string[];
  respondsToInteractionIds?: string[];
  generatedInteractionIds?: string[];
  createdAt: number;
  status?: "streaming" | "done" | "error";
  referencedFiles?: Array<{ path: string }>;
};

export type TavernWorkflowTraceStepStatus = "pending" | "running" | "done" | "skipped" | "error";

export type TavernWorkflowTraceStep = {
  id: string;
  label: string;
  status: TavernWorkflowTraceStepStatus;
  detail?: string;
  stepType?: "agent" | "dispatch" | "transform" | "condition" | "router";
  agentRoleId?: string;
  agentTaskId?: string;
  outputKey?: string;
  route?: string | null;
};

export type TavernWorkflowTraceEvent = {
  id: string;
  at: number;
  type: string;
  workflowRunId: string;
  workflowId?: string;
  runtimeId?: string;
  stepId?: string;
  stepType?: "agent" | "dispatch" | "transform" | "condition" | "router";
  agentRoleId?: string;
  agentTaskId?: string;
  detail?: string;
  payload?: unknown;
};

export type TavernWorkflowTraceResult = {
  runtimeId?: string;
  steps: Array<{
    stepId: string;
    stepType?: "agent" | "dispatch" | "transform" | "condition" | "router";
    agentRoleId?: string;
    agentTaskId?: string;
    outputKey: string;
    textPreview: string;
    route?: string | null;
  }>;
  skippedSteps?: Array<{
    stepId: string;
    reason: string;
  }>;
  output?: unknown;
};

export type TavernWorkflowTraceRun = {
  id: string;
  workflowRunId: string;
  workflowId: string;
  runtimeId?: string;
  taskId?: string;
  anchorMessageId?: string;
  scopeLabel?: string;
  status: "running" | "done" | "error";
  startedAt: number;
  updatedAt: number;
  steps: TavernWorkflowTraceStep[];
  events: TavernWorkflowTraceEvent[];
  result?: TavernWorkflowTraceResult;
};

export type TavernState = {
  version: 4;
  activeRoomId: string;
  rooms: TavernRoom[];
  messagesByInstance: Record<string, TavernMessage[]>;
  workflowTracesByInstance: Record<string, TavernWorkflowTraceRun[]>;
};

export type TavernReferencedFile = {
  path: string;
  content: string;
};
