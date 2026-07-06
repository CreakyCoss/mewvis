import { randomUUID } from "node:crypto";
import type {
  AgentRuntimeAgent,
  AgentRuntimeAgentSession,
  AgentRuntimeCapabilities,
  AgentRuntimeCollaboration,
  AgentRuntimeSession,
  AgentRuntimeSessionAdmin,
  AgentRuntimeSessionDebug,
} from "../../runtime.js";
import {
  AgentEventType,
  AgentResultType,
  AgentRuntimeResultType,
  AgentTaskCommandType,
  type AgentRunInput,
  type AgentToolsQuery,
  type AgentToolsResult,
  type AnswerQuestionInput,
  type AppendSessionMessagesInput,
  type ChatInput,
  type ChatResult,
  type CollaborationModesRuntimeResult,
  type CollaborationRuntimeResult,
  type CollaborationTimelineQuery,
  type CollaborationTimelineResult,
  type CompactAgentSessionInput,
  type DeleteSessionMessageInput,
  type EditSessionMessageInput,
  type RebuildAgentSessionInput,
  type RebuildSessionInput,
  type ReadSessionInput,
  type RunCollaborationInput,
  type RunCollaborationModeInput,
  type RuntimeModelsResult,
  type RuntimeSessionDebugQuery,
  type RuntimeSessionDebugResult,
  type RuntimeSessionQuery,
  type RuntimeSessionResult,
  type RuntimeSessionsQuery,
  type RuntimeSessionsResult,
  type SessionMutationResult,
  type SessionResult,
  type SummarizeAgentSessionInput,
  type SummarizeSessionInput,
  type TaskResult,
} from "../../protocol/index.js";
import { clearAgentSessionArtifacts, createAgentSessionPlan } from "./agent/artifacts.js";
import { createUserInputManager } from "./agent/commands/user-input.js";
import { createAgentToolsResult, createRuntimeModelsResult, createTaskResult } from "./agent/commands/responses.js";
import type { AgentEngine } from "./agent/index.js";
import type {
  AgentRunCommand,
  AgentRuntimeCallbacks,
  AgentRuntimeContext,
  ChatRunCommand,
  EmitAgentEvent,
  RuntimeAgentCompactCommand,
  RuntimeAgentRebuildCommand,
  RuntimeAgentSummarizeCommand,
} from "./agent/runtimes/types.js";
import { resolveRuntime } from "./agent/runtimes/resolver.js";
import type { CollaborationEngine } from "./collaboration/index.js";
import type { EmitCollaborationEvent } from "./collaboration/runtimes/types.js";
import { messageFromError } from "./error.js";
import type { NativeRuntimeProfile } from "./profile.js";
import { createRuntimeSessionManager, listRuntimeSessions as listRuntimeSessionSummaries } from "./session/index.js";

type RuntimeSessionTarget = {
  workspacePath: string;
  sessionRootDir: string;
};

const runtimeSessionManagerFor = (
  input: RuntimeSessionTarget,
  providerId?: NativeRuntimeProfile["sessionProviderId"] | null,
) =>
  createRuntimeSessionManager({
    workspacePath: input.workspacePath,
    sessionRootDir: input.sessionRootDir,
    providerId,
  });

const withoutRuntimeSessionTarget = <TInput extends RuntimeSessionTarget>(
  input: TInput,
): Omit<TInput, keyof RuntimeSessionTarget> => {
  const { workspacePath: _workspacePath, sessionRootDir: _sessionRootDir, ...rest } = input;
  return rest;
};

const hasOwn = (value: unknown, key: string) =>
  Boolean(value) && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key);

const assertNoRuntimeSessionDebugOptions = (input: unknown) => {
  if (hasOwn(input, "includeLedger") || hasOwn(input, "includeTrace")) {
    throw new Error(
      "readRuntimeSession 不再接受 includeLedger/includeTrace；请使用稳定的 session summary/timeline 查询",
    );
  }
};

const agentMaintenanceMutationResult = (
  command: RuntimeAgentCompactCommand | RuntimeAgentRebuildCommand,
  result: Pick<SessionMutationResult, "compacted" | "rebuilt">,
): SessionMutationResult => ({
  type: AgentResultType.SessionMutationResult,
  requestId: command.requestId ?? null,
  sessionRootDir: command.sessionRootDir,
  summary: "",
  messages: [],
  ...result,
});

const runtimeContextWithSession = (
  sessionManager: ReturnType<typeof createRuntimeSessionManager>,
  callbacks: AgentRuntimeCallbacks,
  emit: EmitAgentEvent,
): AgentRuntimeContext => ({
  callbacks,
  emit,
  nativeSession: {
    readSession: () => sessionManager.readSession(),
    readAgentVisibleContext: (contextInput) => sessionManager.readAgentVisibleContext(contextInput),
  },
});

export class NativeAgentRuntimeCapabilitiesSurface implements AgentRuntimeCapabilities {
  async listAgentTools(input: AgentToolsQuery = {}): Promise<AgentToolsResult> {
    return createAgentToolsResult(input);
  }

  async listRuntimeModels(): Promise<RuntimeModelsResult> {
    return createRuntimeModelsResult({});
  }
}

type NativeAgentRuntimeAgentDeps = {
  agentEngine: AgentEngine;
  emitAgentEvent: EmitAgentEvent;
  runtimeCallbacks: AgentRuntimeCallbacks;
  userInput: ReturnType<typeof createUserInputManager>;
};

export class NativeAgentRuntimeAgentSurface implements AgentRuntimeAgent {
  constructor(private readonly deps: NativeAgentRuntimeAgentDeps) {}

  async chat(input: ChatInput): Promise<ChatResult> {
    const command: ChatRunCommand = {
      ...input,
      type: "chat",
      requestId: null,
    };
    const result = await this.deps.agentEngine.chat(command, {
      emit: this.deps.emitAgentEvent,
    });
    return {
      type: AgentResultType.ChatResult,
      requestId: command.requestId ?? null,
      ...result,
    };
  }

  async run(input: AgentRunInput): Promise<TaskResult> {
    return this.runCommand({
      ...input,
      runtimeMode: "agent",
      requestId: null,
    });
  }

  async answerQuestion(input: AnswerQuestionInput): Promise<void> {
    this.deps.userInput.handleAnswer({
      ...input,
      requestId: null,
      type: AgentTaskCommandType.AnswerQuestion as const,
    });
  }

  async runCommand(command: AgentRunCommand): Promise<TaskResult> {
    try {
      await this.deps.agentEngine.runAgent(command, {
        callbacks: this.deps.runtimeCallbacks,
        emit: this.deps.emitAgentEvent,
      });
      return createTaskResult(command, { success: true });
    } catch (error: unknown) {
      const message = messageFromError(error);
      this.deps.emitAgentEvent({
        type: AgentEventType.Error,
        taskId: command.taskId,
        message,
      });
      return createTaskResult(command, { success: false, message });
    }
  }
}

type NativeAgentRuntimeSessionDeps = {
  emitAgentEvent: EmitAgentEvent;
  profile: NativeRuntimeProfile;
  runtimeCallbacks: AgentRuntimeCallbacks;
};

class NativeAgentRuntimeSessionAdminSurface implements AgentRuntimeSessionAdmin {
  constructor(private readonly deps: NativeAgentRuntimeSessionDeps) {}

  async read(input: ReadSessionInput): Promise<SessionResult> {
    return this.runtimeSessionManagerFor(input).readSession();
  }

  async appendMessages(input: AppendSessionMessagesInput): Promise<SessionMutationResult> {
    return this.runtimeSessionManagerFor(input).appendSessionMessages(withoutRuntimeSessionTarget(input), {
      invalidateDerivedArtifacts: this.clearAgentSessionArtifacts,
    });
  }

  async editMessage(input: EditSessionMessageInput): Promise<SessionMutationResult> {
    return this.runtimeSessionManagerFor(input).editSessionMessage(withoutRuntimeSessionTarget(input), {
      invalidateDerivedArtifacts: this.clearAgentSessionArtifacts,
    });
  }

  async deleteMessage(input: DeleteSessionMessageInput): Promise<SessionMutationResult> {
    return this.runtimeSessionManagerFor(input).deleteSessionMessage(withoutRuntimeSessionTarget(input), {
      invalidateDerivedArtifacts: this.clearAgentSessionArtifacts,
    });
  }

  async rebuild(input: RebuildSessionInput): Promise<SessionMutationResult> {
    return this.runtimeSessionManagerFor(input).rebuildSession(withoutRuntimeSessionTarget(input), {
      invalidateDerivedArtifacts: this.clearAgentSessionArtifacts,
    });
  }

  async summarize(input: SummarizeSessionInput): Promise<SessionMutationResult> {
    return this.runtimeSessionManagerFor(input).summarizeSession(withoutRuntimeSessionTarget(input));
  }

  private runtimeSessionManagerFor(input: RuntimeSessionTarget) {
    return runtimeSessionManagerFor(input, this.deps.profile.sessionProviderId);
  }

  private readonly clearAgentSessionArtifacts = (input: RuntimeSessionTarget) =>
    clearAgentSessionArtifacts({
      ...input,
      sessionProviderId: this.deps.profile.sessionProviderId,
    });
}

class NativeAgentRuntimeAgentSessionSurface implements AgentRuntimeAgentSession {
  constructor(private readonly deps: NativeAgentRuntimeSessionDeps) {}

  async compact(input: CompactAgentSessionInput): Promise<SessionMutationResult> {
    const { runtimeId, implementation } = resolveRuntime("agent", this.deps.profile.agentRuntimeId);
    const sessionPlan = await createAgentSessionPlan({
      workspacePath: input.workspacePath,
      sessionRootDir: input.sessionRootDir,
      sessionProviderId: this.deps.profile.sessionProviderId,
      runtimeId,
      agentRoleId: input.target.agentRoleId,
    });
    const compactCommand: RuntimeAgentCompactCommand = {
      requestId: null,
      runtimeId,
      taskId: `runtime-compact-${randomUUID()}`,
      workspacePath: input.workspacePath,
      sessionRootDir: input.sessionRootDir,
      agentRoleId: sessionPlan.agentRoleId,
      runtimeModel: input.runtime?.model ?? null,
      resources: input.runtime?.resources ?? null,
      agentSessionDir: sessionPlan.agentSessionDir,
      compactInstructions: input.options?.compactInstruction ?? null,
    };
    return implementation.compact
      ? implementation.compact(compactCommand, {
          callbacks: this.deps.runtimeCallbacks,
          emit: this.deps.emitAgentEvent,
        })
      : agentMaintenanceMutationResult(compactCommand, { compacted: false });
  }

  async rebuild(input: RebuildAgentSessionInput): Promise<SessionMutationResult> {
    const sessionManager = this.runtimeSessionManagerFor(input);
    const { runtimeId, implementation } = resolveRuntime("agent", this.deps.profile.agentRuntimeId);
    const sessionPlan = await createAgentSessionPlan({
      workspacePath: input.workspacePath,
      sessionRootDir: input.sessionRootDir,
      sessionProviderId: this.deps.profile.sessionProviderId,
      runtimeId,
      agentRoleId: input.target.agentRoleId,
    });
    const taskId = `runtime-rebuild-agent-session-${randomUUID()}`;
    const rebuildCommand: RuntimeAgentRebuildCommand = {
      requestId: null,
      runtimeId,
      taskId,
      workspacePath: input.workspacePath,
      sessionRootDir: input.sessionRootDir,
      agentRoleId: sessionPlan.agentRoleId,
      userMessage: input.options?.userMessage ?? null,
      rebuildInstruction: input.options?.rebuildInstruction ?? null,
      runtimeModel: input.runtime?.model ?? null,
      resources: input.runtime?.resources ?? null,
      agentSessionDir: sessionPlan.agentSessionDir,
    };
    return implementation.rebuild
      ? implementation.rebuild(
          rebuildCommand,
          runtimeContextWithSession(sessionManager, this.deps.runtimeCallbacks, () => undefined),
        )
      : agentMaintenanceMutationResult(rebuildCommand, { rebuilt: false });
  }

  async summarize(input: SummarizeAgentSessionInput): Promise<SessionMutationResult> {
    const sessionManager = this.runtimeSessionManagerFor(input);
    const { runtimeId, implementation } = resolveRuntime("agent", this.deps.profile.agentRuntimeId);
    if (!implementation.summarize) {
      throw new Error(`${runtimeId} agent runtime 不支持摘要底层 session`);
    }

    const sessionPlan = await createAgentSessionPlan({
      workspacePath: input.workspacePath,
      sessionRootDir: input.sessionRootDir,
      sessionProviderId: this.deps.profile.sessionProviderId,
      runtimeId,
      agentRoleId: input.target.agentRoleId,
    });
    const summarizeCommand: RuntimeAgentSummarizeCommand = {
      requestId: null,
      runtimeId,
      taskId: `runtime-summarize-agent-session-${randomUUID()}`,
      workspacePath: input.workspacePath,
      sessionRootDir: input.sessionRootDir,
      agentRoleId: sessionPlan.agentRoleId,
      agentSessionId: sessionPlan.agentSessionId,
      runtimeModel: input.runtime?.model ?? null,
      resources: null,
      agentSessionDir: sessionPlan.agentSessionDir,
      summaryInstruction: input.options?.summaryInstruction ?? null,
      maxSummaryChars: input.options?.maxSummaryChars ?? null,
    };
    return implementation.summarize(
      summarizeCommand,
      runtimeContextWithSession(sessionManager, this.deps.runtimeCallbacks, this.deps.emitAgentEvent),
    );
  }

  private runtimeSessionManagerFor(input: RuntimeSessionTarget) {
    return runtimeSessionManagerFor(input, this.deps.profile.sessionProviderId);
  }
}

class NativeAgentRuntimeSessionDebugSurface implements AgentRuntimeSessionDebug {
  constructor(private readonly deps: NativeAgentRuntimeSessionDeps) {}

  async read(input: RuntimeSessionDebugQuery): Promise<RuntimeSessionDebugResult> {
    return runtimeSessionManagerFor(input, this.deps.profile.sessionProviderId).readRuntimeSessionDebug(
      withoutRuntimeSessionTarget(input),
    );
  }
}

export class NativeAgentRuntimeSessionSurface implements AgentRuntimeSession {
  readonly admin: AgentRuntimeSessionAdmin;
  readonly agent: AgentRuntimeAgentSession;
  readonly debug: AgentRuntimeSessionDebug;

  constructor(private readonly deps: NativeAgentRuntimeSessionDeps) {
    this.admin = new NativeAgentRuntimeSessionAdminSurface(deps);
    this.agent = new NativeAgentRuntimeAgentSessionSurface(deps);
    this.debug = new NativeAgentRuntimeSessionDebugSurface(deps);
  }

  async list(input: RuntimeSessionsQuery): Promise<RuntimeSessionsResult> {
    return listRuntimeSessionSummaries(input, this.deps.profile.sessionProviderId);
  }

  async read(input: RuntimeSessionQuery): Promise<RuntimeSessionResult> {
    assertNoRuntimeSessionDebugOptions(input);
    return runtimeSessionManagerFor(input, this.deps.profile.sessionProviderId).readRuntimeSession(
      withoutRuntimeSessionTarget(input),
    );
  }
}

type NativeAgentRuntimeCollaborationDeps = {
  collaborationEngine: CollaborationEngine;
  emitCollaborationEvent: EmitCollaborationEvent;
  profile: NativeRuntimeProfile;
};

export class NativeAgentRuntimeCollaborationSurface implements AgentRuntimeCollaboration {
  constructor(private readonly deps: NativeAgentRuntimeCollaborationDeps) {}

  async listModes(): Promise<CollaborationModesRuntimeResult> {
    return {
      type: AgentRuntimeResultType.CollaborationModesResult,
      requestId: null,
      modes: this.deps.collaborationEngine.listModes(),
    };
  }

  async run(input: RunCollaborationInput): Promise<CollaborationRuntimeResult> {
    const result = await this.deps.collaborationEngine.run(
      {
        ...input,
        requestId: input.requestId ?? null,
      },
      { emit: this.deps.emitCollaborationEvent },
    );
    return {
      type: AgentRuntimeResultType.CollaborationResult,
      requestId: input.requestId ?? null,
      ...result,
    };
  }

  async runMode(input: RunCollaborationModeInput): Promise<CollaborationRuntimeResult> {
    const result = await this.deps.collaborationEngine.runMode(
      {
        ...input,
        requestId: input.requestId ?? null,
      },
      { emit: this.deps.emitCollaborationEvent },
    );
    return {
      type: AgentRuntimeResultType.CollaborationResult,
      requestId: input.requestId ?? null,
      ...result,
    };
  }

  async readTimeline(input: CollaborationTimelineQuery): Promise<CollaborationTimelineResult> {
    return runtimeSessionManagerFor(input, this.deps.profile.sessionProviderId).readCollaborationTimeline(
      withoutRuntimeSessionTarget(input),
    );
  }
}
