import {
  AgentRuntimeResultType,
  AgentSessionCommandType,
  type AppendSessionMessagesInput,
  type CollaborationTimelineQuery,
  type CollaborationTimelineResult,
  type DeleteSessionMessageInput,
  type EditSessionMessageInput,
  type ReadSessionInput,
  type RebuildSessionInput,
  type RuntimeSessionQuery,
  type RuntimeSessionResult,
  type RuntimeSessionsQuery,
  type RuntimeSessionsResult,
  type SessionMutationResult,
  type SessionResult,
  type SummarizeSessionInput,
} from "../../protocol/index.js";
import {
  clearRuntimeSessionArtifactDir,
  resolveRuntimeSessionArtifactDir,
} from "./artifacts.js";
import { resolveRuntimeSessionProvider } from "./providers/resolver.js";
import type {
  RuntimeSessionHandle,
  RuntimeSessionPathInput,
  RuntimeSessionProvider,
} from "./providers/types.js";
import {
  appendRuntimeSessionMessages,
  deleteRuntimeSessionMessage,
  editRuntimeSessionMessage,
  readRuntimeSession,
  rebuildRuntimeSession,
  summarizeRuntimeSession,
  type RuntimeSessionMutationHooks,
  type RuntimeSessionSummarizeOptions,
} from "./internal/service.js";
import {
  prepareRuntimeSessionTurn,
  refreshRuntimeSessionManifest,
  type RuntimeSessionTurnOptions,
} from "./internal/writer.js";
import type { RuntimeSessionCommand } from "./model/runtime-command.js";

type SessionManagerInput<TInput extends RuntimeSessionPathInput> =
  Omit<TInput, keyof RuntimeSessionPathInput>;

export type RuntimeSessionManagerTarget = RuntimeSessionPathInput;

class RuntimeSessionManager {
  readonly workspacePath: string;
  readonly sessionRootDir: string;

  constructor(
    target: RuntimeSessionManagerTarget,
    private readonly provider: RuntimeSessionProvider,
  ) {
    this.workspacePath = target.workspacePath;
    this.sessionRootDir = target.sessionRootDir;
  }

  openHandle(): Promise<RuntimeSessionHandle> {
    return this.provider.openOrCreate(this.target);
  }

  refreshManifest(handle: RuntimeSessionHandle): Promise<void> {
    return refreshRuntimeSessionManifest(handle);
  }

  prepareTurn<TCommand extends RuntimeSessionCommand>(
    command: TCommand,
    options: RuntimeSessionTurnOptions = {},
  ) {
    return prepareRuntimeSessionTurn({
      ...command,
      ...this.target,
    }, this.provider, options);
  }

  readSession(
    input: SessionManagerInput<ReadSessionInput> = {},
  ): Promise<SessionResult> {
    return readRuntimeSession({
      ...input,
      ...this.target,
      requestId: null,
      type: AgentSessionCommandType.ReadSession as const,
    }, this.provider);
  }

  summarizeSession(
    input: SessionManagerInput<SummarizeSessionInput>,
    options: RuntimeSessionSummarizeOptions,
  ): Promise<SessionMutationResult> {
    return summarizeRuntimeSession({
      ...input,
      ...this.target,
      requestId: null,
      type: AgentSessionCommandType.SummarizeSession as const,
    }, this.provider, options);
  }

  editSessionMessage(
    input: SessionManagerInput<EditSessionMessageInput>,
    hooks: RuntimeSessionMutationHooks = {},
  ): Promise<SessionMutationResult> {
    return editRuntimeSessionMessage({
      ...input,
      ...this.target,
      requestId: null,
      type: AgentSessionCommandType.MessageEdit as const,
    }, this.provider, hooks);
  }

  deleteSessionMessage(
    input: SessionManagerInput<DeleteSessionMessageInput>,
    hooks: RuntimeSessionMutationHooks = {},
  ): Promise<SessionMutationResult> {
    return deleteRuntimeSessionMessage({
      ...input,
      ...this.target,
      requestId: null,
      type: AgentSessionCommandType.MessageDelete as const,
    }, this.provider, hooks);
  }

  appendSessionMessages(
    input: SessionManagerInput<AppendSessionMessagesInput>,
  ): Promise<SessionMutationResult> {
    return appendRuntimeSessionMessages({
      ...input,
      ...this.target,
      requestId: null,
      type: AgentSessionCommandType.MessageAppend as const,
    }, this.provider);
  }

  rebuildSession(
    input: SessionManagerInput<RebuildSessionInput>,
    hooks: RuntimeSessionMutationHooks = {},
  ): Promise<SessionMutationResult> {
    return rebuildRuntimeSession({
      ...input,
      ...this.target,
      requestId: null,
      type: AgentSessionCommandType.Rebuild as const,
    }, this.provider, hooks);
  }

  async readRuntimeSession(
    input: SessionManagerInput<RuntimeSessionQuery> = {},
  ): Promise<RuntimeSessionResult> {
    return {
      type: AgentRuntimeResultType.RuntimeSessionResult,
      requestId: null,
      ...(await this.provider.getRuntimeSessionSnapshot(
        this.target,
        {
          includeLedger: input.includeLedger,
          includeTrace: input.includeTrace,
          includeTimeline: input.includeTimeline,
          timelineLimit: input.timelineLimit,
        },
      )),
    };
  }

  async readCollaborationTimeline(
    input: SessionManagerInput<CollaborationTimelineQuery> = {},
  ): Promise<CollaborationTimelineResult> {
    return {
      type: AgentRuntimeResultType.CollaborationTimelineResult,
      requestId: null,
      ...(await this.provider.getCollaborationTimeline(
        this.target,
        {
          workflowRunId: input.workflowRunId,
          limit: input.limit,
        },
      )),
    };
  }

  resolveArtifactDir(segments: string[]): Promise<string> {
    return resolveRuntimeSessionArtifactDir(this.provider, this.target, segments);
  }

  clearArtifactDir(segments: string[]): Promise<void> {
    return clearRuntimeSessionArtifactDir(this.provider, this.target, segments);
  }

  private get target(): RuntimeSessionPathInput {
    return {
      workspacePath: this.workspacePath,
      sessionRootDir: this.sessionRootDir,
    };
  }
}

export const createRuntimeSessionManager = (
  target: RuntimeSessionManagerTarget,
) => new RuntimeSessionManager(target, resolveRuntimeSessionProvider());

export const listRuntimeSessions = async (
  input: RuntimeSessionsQuery,
): Promise<RuntimeSessionsResult> => ({
  type: AgentRuntimeResultType.RuntimeSessionsResult,
  requestId: null,
  sessions: await resolveRuntimeSessionProvider().listRuntimeSessions({
    workspacePath: input.workspacePath,
    rootDir: input.rootDir,
    limit: input.limit,
    maxDepth: input.maxDepth,
  }),
});
