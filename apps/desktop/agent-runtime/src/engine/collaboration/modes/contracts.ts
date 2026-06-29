import type {
  RuntimeModelInput,
} from "../../agent/contracts/model.js";
import type {
  AgentRuntimeResources,
} from "../../agent/contracts/protocol.js";
import type {
  AgentToolName,
} from "../../agent/tools/definitions.js";
import type {
  CollaborationExecutorId,
  CollaborationRunInput,
} from "../contracts/workflow.js";
import type {
  CollaborationRunResult,
} from "../contracts/state.js";

export type CollaborationModeId =
  | "supervisor.dispatch-loop"
  | "producer.review-rewrite-loop"
  | (string & {});

export type CollaborationParticipantKind =
  | "supervisor"
  | "worker"
  | "producer"
  | "reviewer"
  | "evaluator";

export type CollaborationModeParticipant = {
  id: string;
  kind: CollaborationParticipantKind;
  label?: string | null;
  agentId?: string | null;
  systemPrompt?: string | null;
  instruction?: string | null;
  userMessage?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  allowedTools?: AgentToolName[];
  enabledSkills?: string[];
  resources?: AgentRuntimeResources | null;
  capabilities?: string[];
  metadata?: Record<string, unknown> | null;
};

export type CollaborationModeRunInput = {
  requestId?: string | null;
  workspacePath: string;
  sessionRootDir?: string | null;
  mode: CollaborationModeId;
  participants: readonly CollaborationModeParticipant[];
  context?: unknown;
  options?: Record<string, unknown> | null;
  resources?: AgentRuntimeResources | null;
  executor?: CollaborationExecutorId | null;
};

export type CollaborationModeRunResult = CollaborationRunResult & {
  mode: CollaborationModeId;
};

export type CollaborationModeDefinition = {
  id: CollaborationModeId;
  label: string;
  version: string;
  build(input: CollaborationModeRunInput): CollaborationRunInput;
};

export type CollaborationModeSummary = {
  id: CollaborationModeId;
  label: string;
  version: string;
};
