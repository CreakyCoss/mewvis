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
import type {
  RuntimeAgentVisibleContext,
} from "./model/agent-context.js";
import type { RuntimeSessionCommand } from "./model/runtime-command.js";
import { resolveRuntimeSessionProvider } from "./providers/resolver.js";
import type {
  RuntimeSessionAgentVisibleContextInput,
  RuntimeSessionCompactInput,
  RuntimeSessionDeleteInput,
  RuntimeSessionEventInput,
  RuntimeSessionMutationHooks,
  RuntimeSessionPathInput,
  RuntimeSessionProvider,
  RuntimeSessionSummarizeOptions,
  RuntimeSessionTraceInput,
  RuntimeSessionTraceRecord,
  RuntimeSessionTurnOptions,
} from "./providers/types.js";

type SessionManagerInput<TInput extends RuntimeSessionPathInput> =
  Omit<TInput, keyof RuntimeSessionPathInput>;

export type RuntimeSessionManagerTarget = RuntimeSessionPathInput;

class RuntimeSessionManager {
  readonly workspacePath: string;
  readonly sessionRootDir: string;
  private readonly ready: Promise<void>;

  constructor(
    target: RuntimeSessionManagerTarget,
    private readonly provider: RuntimeSessionProvider,
  ) {
    this.workspacePath = target.workspacePath;
    this.sessionRootDir = target.sessionRootDir;
    this.ready = this.provider.initSession(this.target);
  }

  async refreshSession(): Promise<void> {
    await this.ensureReady();
    return this.provider.refreshSession(this.target);
  }

  async prepareTurn<TCommand extends RuntimeSessionCommand>(
    command: TCommand,
    options: RuntimeSessionTurnOptions = {},
  ) {
    await this.ensureReady();
    return this.provider.prepareTurn({
      ...command,
      ...this.target,
    }, options);
  }

  async readSession(
    input: SessionManagerInput<ReadSessionInput> = {},
  ): Promise<SessionResult> {
    await this.ensureReady();
    return this.provider.readSession({
      ...input,
      ...this.target,
      requestId: null,
      type: AgentSessionCommandType.ReadSession as const,
    });
  }

  async summarizeSession(
    input: SessionManagerInput<SummarizeSessionInput>,
    options: RuntimeSessionSummarizeOptions,
  ): Promise<SessionMutationResult> {
    await this.ensureReady();
    return this.provider.summarizeSession({
      ...input,
      ...this.target,
      requestId: null,
      type: AgentSessionCommandType.SummarizeSession as const,
    }, options);
  }

  async editSessionMessage(
    input: SessionManagerInput<EditSessionMessageInput>,
    hooks: RuntimeSessionMutationHooks = {},
  ): Promise<SessionMutationResult> {
    await this.ensureReady();
    const result = await this.provider.editSessionMessage({
      ...input,
      ...this.target,
      requestId: null,
      type: AgentSessionCommandType.MessageEdit as const,
    });
    await hooks.invalidateDerivedArtifacts?.(this.target);
    return result;
  }

  async deleteSessionMessage(
    input: SessionManagerInput<DeleteSessionMessageInput>,
    hooks: RuntimeSessionMutationHooks = {},
  ): Promise<SessionMutationResult> {
    await this.ensureReady();
    const result = await this.provider.deleteSessionMessage({
      ...input,
      ...this.target,
      requestId: null,
      type: AgentSessionCommandType.MessageDelete as const,
    });
    await hooks.invalidateDerivedArtifacts?.(this.target);
    return result;
  }

  async appendSessionMessages(
    input: SessionManagerInput<AppendSessionMessagesInput>,
  ): Promise<SessionMutationResult> {
    await this.ensureReady();
    return this.provider.appendSessionMessages({
      ...input,
      ...this.target,
      requestId: null,
      type: AgentSessionCommandType.MessageAppend as const,
    });
  }

  async rebuildSession(
    input: SessionManagerInput<RebuildSessionInput>,
    hooks: RuntimeSessionMutationHooks = {},
  ): Promise<SessionMutationResult> {
    await this.ensureReady();
    const result = await this.provider.rebuildSession({
      ...input,
      ...this.target,
      requestId: null,
      type: AgentSessionCommandType.Rebuild as const,
    });
    await hooks.invalidateDerivedArtifacts?.(this.target);
    return result;
  }

  async compactSession(
    input: SessionManagerInput<RuntimeSessionCompactInput> = {},
  ): Promise<SessionMutationResult> {
    await this.ensureReady();
    return this.provider.compactSession({
      ...input,
      ...this.target,
      requestId: null,
    });
  }

  async deleteSession(
    input: SessionManagerInput<RuntimeSessionDeleteInput> = {},
  ): Promise<void> {
    await this.ensureReady();
    await this.provider.deleteSession({
      ...input,
      ...this.target,
      requestId: null,
    });
  }

  async readAgentVisibleContext(
    input: SessionManagerInput<RuntimeSessionAgentVisibleContextInput>,
  ): Promise<RuntimeAgentVisibleContext> {
    await this.ensureReady();
    return this.provider.readAgentVisibleContext({
      ...input,
      ...this.target,
    });
  }

  async recordSessionEvent(
    input: SessionManagerInput<RuntimeSessionEventInput>,
  ): Promise<SessionMutationResult> {
    await this.ensureReady();
    return this.provider.recordSessionEvent({
      ...input,
      ...this.target,
      requestId: null,
    });
  }

  async appendTraceRecord<TRecord extends RuntimeSessionTraceRecord>(
    input: SessionManagerInput<RuntimeSessionTraceInput<TRecord>>,
  ): Promise<TRecord> {
    await this.ensureReady();
    return this.provider.appendTraceRecord({
      ...input,
      ...this.target,
    });
  }

  async readRuntimeSession(
    input: SessionManagerInput<RuntimeSessionQuery> = {},
  ): Promise<RuntimeSessionResult> {
    await this.ensureReady();
    const snapshot = await this.provider.getRuntimeSessionSnapshot(
      this.target,
      {
        includeLedger: input.includeLedger,
        includeTrace: input.includeTrace,
        includeTimeline: input.includeTimeline,
        timelineLimit: input.timelineLimit,
      },
    );
    return {
      type: AgentRuntimeResultType.RuntimeSessionResult,
      requestId: null,
      session: snapshot.session,
      ledger: snapshot.raw ?? null,
      trace: snapshot.trace,
      timeline: snapshot.timeline,
    };
  }

  async readCollaborationTimeline(
    input: SessionManagerInput<CollaborationTimelineQuery> = {},
  ): Promise<CollaborationTimelineResult> {
    await this.ensureReady();
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

  async resolveArtifactDir(segments: string[]): Promise<string> {
    await this.ensureReady();
    return this.provider.resolveArtifactDir({
      ...this.target,
      segments,
    });
  }

  async clearArtifactDir(segments: string[]): Promise<void> {
    await this.ensureReady();
    return this.provider.clearArtifactDir({
      ...this.target,
      segments,
    });
  }

  private ensureReady(): Promise<void> {
    return this.ready;
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
