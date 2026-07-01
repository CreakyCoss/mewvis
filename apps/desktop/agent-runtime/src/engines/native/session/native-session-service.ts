import {
  AgentRuntimeResultType,
  AgentSessionCommandType,
  type AppendSessionMessagesInput,
  type CollaborationTimelineQuery,
  type CollaborationTimelineResult,
  type CompactCommand,
  type CompactSessionInput,
  type CreateSessionInput,
  type DeleteSessionMessageInput,
  type EditSessionMessageInput,
  type ReadSessionInput,
  type RebuildAgentSessionCommand,
  type RebuildAgentSessionInput,
  type RebuildSessionInput,
  type RuntimeSessionQuery,
  type RuntimeSessionResult,
  type RuntimeSessionsQuery,
  type RuntimeSessionsResult,
  type SessionMutationResult,
  type SessionResult,
  type SummarizeSessionInput,
} from "../../protocol/index.js";
import type {
  RuntimeSessionPathInput,
} from "./providers/types.js";
import { resolveRuntimeSessionProvider } from "./providers/resolver.js";
import {
  appendRuntimeSessionMessages,
  createRuntimeSession,
  deleteRuntimeSessionMessage,
  editRuntimeSessionMessage,
  readRuntimeSession,
  rebuildRuntimeSession,
  summarizeRuntimeSession,
  type RuntimeSessionDisplaySummaryGenerator,
} from "./service.js";

export type NativeSessionMaintenanceHandlers<TMaintenanceContext = unknown> = {
  compactSession(
    command: CompactCommand,
    runtimeContext?: TMaintenanceContext,
  ): Promise<SessionMutationResult>;
  rebuildAgentSession(
    command: RebuildAgentSessionCommand,
    runtimeContext?: TMaintenanceContext,
  ): Promise<SessionMutationResult>;
  generateDisplaySummary: RuntimeSessionDisplaySummaryGenerator;
  invalidateDerivedArtifacts?(input: RuntimeSessionPathInput): Promise<void>;
};

export type NativeSessionService<TMaintenanceContext = unknown> = {
  createSession(input: CreateSessionInput): Promise<SessionMutationResult>;
  readSession(input: ReadSessionInput): Promise<SessionResult>;
  compactSession(
    input: CompactSessionInput,
    runtimeContext?: TMaintenanceContext,
  ): Promise<SessionMutationResult>;
  rebuildAgentSession(
    input: RebuildAgentSessionInput,
    runtimeContext?: TMaintenanceContext,
  ): Promise<SessionMutationResult>;
  summarizeSession(input: SummarizeSessionInput): Promise<SessionMutationResult>;
  editSessionMessage(input: EditSessionMessageInput): Promise<SessionMutationResult>;
  deleteSessionMessage(input: DeleteSessionMessageInput): Promise<SessionMutationResult>;
  appendSessionMessages(input: AppendSessionMessagesInput): Promise<SessionMutationResult>;
  rebuildSession(input: RebuildSessionInput): Promise<SessionMutationResult>;
  listRuntimeSessions(input: RuntimeSessionsQuery): Promise<RuntimeSessionsResult>;
  readRuntimeSession(input: RuntimeSessionQuery): Promise<RuntimeSessionResult>;
  readCollaborationTimeline(
    input: CollaborationTimelineQuery,
  ): Promise<CollaborationTimelineResult>;
};

export const createNativeSessionService = <TMaintenanceContext = unknown>(
  handlers: NativeSessionMaintenanceHandlers<TMaintenanceContext>,
): NativeSessionService<TMaintenanceContext> => ({
  createSession(input) {
    return createRuntimeSession({
      ...input,
      requestId: null,
      type: AgentSessionCommandType.CreateSession as const,
    });
  },

  readSession(input) {
    return readRuntimeSession({
      ...input,
      requestId: null,
      type: AgentSessionCommandType.ReadSession as const,
    });
  },

  compactSession(input, runtimeContext) {
    return handlers.compactSession({
      ...input,
      requestId: null,
      type: AgentSessionCommandType.Compact as const,
    }, runtimeContext);
  },

  rebuildAgentSession(input, runtimeContext) {
    return handlers.rebuildAgentSession({
      ...input,
      requestId: null,
      type: AgentSessionCommandType.RebuildAgentSession as const,
    }, runtimeContext);
  },

  summarizeSession(input) {
    return summarizeRuntimeSession({
      ...input,
      requestId: null,
      type: AgentSessionCommandType.SummarizeSession as const,
    }, {
      generateDisplaySummary: handlers.generateDisplaySummary,
    });
  },

  editSessionMessage(input) {
    return editRuntimeSessionMessage({
      ...input,
      requestId: null,
      type: AgentSessionCommandType.MessageEdit as const,
    }, {
      invalidateDerivedArtifacts: handlers.invalidateDerivedArtifacts,
    });
  },

  deleteSessionMessage(input) {
    return deleteRuntimeSessionMessage({
      ...input,
      requestId: null,
      type: AgentSessionCommandType.MessageDelete as const,
    }, {
      invalidateDerivedArtifacts: handlers.invalidateDerivedArtifacts,
    });
  },

  appendSessionMessages(input) {
    return appendRuntimeSessionMessages({
      ...input,
      requestId: null,
      type: AgentSessionCommandType.MessageAppend as const,
    });
  },

  rebuildSession(input) {
    return rebuildRuntimeSession({
      ...input,
      requestId: null,
      type: AgentSessionCommandType.Rebuild as const,
    }, {
      invalidateDerivedArtifacts: handlers.invalidateDerivedArtifacts,
    });
  },

  async listRuntimeSessions(input) {
    return {
      type: AgentRuntimeResultType.RuntimeSessionsResult,
      requestId: null,
      sessions: await resolveRuntimeSessionProvider().listRuntimeSessions({
        workspacePath: input.workspacePath,
        rootDir: input.rootDir,
        limit: input.limit,
        maxDepth: input.maxDepth,
      }),
    };
  },

  async readRuntimeSession(input) {
    return {
      type: AgentRuntimeResultType.RuntimeSessionResult,
      requestId: null,
      ...(await resolveRuntimeSessionProvider().getRuntimeSessionSnapshot(
        {
          workspacePath: input.workspacePath,
          sessionRootDir: input.sessionRootDir,
        },
        {
          includeLedger: input.includeLedger,
          includeTrace: input.includeTrace,
          includeTimeline: input.includeTimeline,
          timelineLimit: input.timelineLimit,
        },
      )),
    };
  },

  async readCollaborationTimeline(input) {
    return {
      type: AgentRuntimeResultType.CollaborationTimelineResult,
      requestId: null,
      ...(await resolveRuntimeSessionProvider().getCollaborationTimeline(
        {
          workspacePath: input.workspacePath,
          sessionRootDir: input.sessionRootDir,
        },
        {
          workflowRunId: input.workflowRunId,
          limit: input.limit,
        },
      )),
    };
  },
});
