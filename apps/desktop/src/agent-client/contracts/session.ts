import type {
  CollaborationTimelineResult,
  RuntimeSessionDebugResult,
  RuntimeSessionResult,
  RuntimeSessionsQuery,
  RuntimeSessionsResult,
} from "@agent-runtime/engines/protocol";

type AgentClientRuntimeEnvelope<
  TResult extends {
    type: unknown;
    requestId?: string | null;
  },
> = Omit<TResult, "type" | "requestId"> & Partial<Pick<TResult, "type" | "requestId">>;

export type AgentClientRuntimeSessionSnapshot = AgentClientRuntimeEnvelope<RuntimeSessionResult>;
export type AgentClientRuntimeSessionDebugSnapshot = AgentClientRuntimeEnvelope<RuntimeSessionDebugResult>;
export type AgentClientRuntimeSessionsResult = AgentClientRuntimeEnvelope<RuntimeSessionsResult>;
export type AgentClientCollaborationTimelineResult = AgentClientRuntimeEnvelope<CollaborationTimelineResult>;

export type AgentClientListRuntimeSessionsInput = Omit<RuntimeSessionsQuery, "rootDir"> & {
  rootDir?: string | null;
};
