import { randomUUID } from "node:crypto";
import {
  AgentRuntimeEngine,
  type RuntimeEngineOptions,
} from "../runtime.js";
import {
  AgentEventType,
  AgentResultType,
  AgentRuntimeResultType,
  AgentTaskCommandType,
  type AgentDefinitionsResult,
  type AgentRunInput,
  type AgentRuntimeCommand,
  type AgentRuntimeEvent,
  type AgentRuntimeResult,
  type AgentToolsResult,
  type AgentToolsQuery,
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
  type PongResult,
  type RebuildAgentSessionInput,
  type RebuildSessionInput,
  type ReadSessionInput,
  type RunChatInput,
  type RunCollaborationInput,
  type RunCollaborationModeInput,
  type RuntimeModelsResult,
  type RuntimeSessionQuery,
  type RuntimeSessionResult,
  type RuntimeSessionsQuery,
  type RuntimeSessionsResult,
  type SendMessageInput,
  type SessionMutationResult,
  type SessionResult,
  type ShutdownAckResult,
  type SummarizeAgentSessionInput,
  type SummarizeSessionInput,
  type TaskResult,
} from "../protocol/index.js";
import {
  chatRunCommandFromChat,
  runtimeCommandFromSendMessage,
} from "./agent/commands/adapter.js";
import {
  clearAgentSessionArtifacts,
  createAgentSessionPlan,
} from "./agent/session/artifacts.js";
import { createUserInputManager } from "./agent/commands/user-input.js";
import {
  createAgentDefinitionsResult,
  createAgentToolsResult,
  createPongResult,
  createRuntimeModelsResult,
  createShutdownAckResult,
  createTaskResult,
} from "./agent/commands/responses.js";
import {
  createRuntimeSessionManager,
  listRuntimeSessions as listRuntimeSessionSummaries,
} from "./session/index.js";
import {
  createAgentEngine,
  type AgentEngine,
} from "./agent/index.js";
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
import { createCollaborationEngine } from "./collaboration/index.js";
import type {
  EmitCollaborationEvent,
  RunAgentForCollaboration,
} from "./collaboration/contracts/executor.js";
import type { CollaborationEngine } from "./collaboration/index.js";
import { messageFromError } from "./error.js";
import {
  createNativeRuntimeCommandRouter,
  type NativeRuntimeCommandRouter,
} from "./router.js";

type RuntimeSessionTarget = {
  workspacePath: string;
  sessionRootDir: string;
};

const runtimeSessionManagerFor = (input: RuntimeSessionTarget) =>
  createRuntimeSessionManager({
    workspacePath: input.workspacePath,
    sessionRootDir: input.sessionRootDir,
  });

const withoutRuntimeSessionTarget = <
  TInput extends RuntimeSessionTarget,
>(
  input: TInput,
): Omit<TInput, keyof RuntimeSessionTarget> => {
  const {
    workspacePath: _workspacePath,
    sessionRootDir: _sessionRootDir,
    ...rest
  } = input;
  return rest;
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

export class NativeAgentRuntimeEngine extends AgentRuntimeEngine {
  readonly id = "native";
  readonly agent: {
    chat: AgentEngine["chat"];
    run: AgentEngine["runAgent"];
  };
  readonly collaboration: CollaborationEngine;

  private readonly close: () => void;
  private readonly emitEvent: (event: AgentRuntimeEvent) => void;
  private readonly emitResult: (result: AgentRuntimeResult) => void;
  private readonly agentEngine = createAgentEngine();
  private readonly runtimeCallbacks: AgentRuntimeCallbacks;
  private readonly userInput: ReturnType<typeof createUserInputManager>;
  private readonly commandRouter: NativeRuntimeCommandRouter;

  constructor({
    callbacks,
    close = () => undefined,
  }: RuntimeEngineOptions = {}) {
    super();

    this.close = close;
    this.emitEvent = callbacks?.onEvent ?? (() => undefined);
    this.emitResult = callbacks?.onResult ?? (() => undefined);
    this.userInput = createUserInputManager(this.emitAgentEvent);
    this.runtimeCallbacks = {
      requestUserInput: callbacks?.requestUserInput ??
        this.userInput.callbacks.requestUserInput,
    };

    const runAgentForCollaboration: RunAgentForCollaboration = (command, context) =>
      this.agentEngine.runAgent(command, {
        callbacks: this.runtimeCallbacks,
        emit: context.emit,
      });

    this.collaboration = createCollaborationEngine({
      runAgent: runAgentForCollaboration,
    });
    this.agent = {
      chat: this.agentEngine.chat,
      run: this.agentEngine.runAgent,
    };
    this.commandRouter = createNativeRuntimeCommandRouter({
      engine: this,
      emitEvent: this.emitEvent,
      emitResult: this.emitResult,
      runAgentCommand: (command) => this.executeAgentRun(command),
    });
  }

  async handle(command: AgentRuntimeCommand): Promise<boolean> {
    return this.commandRouter.handle(command);
  }

  async ping(): Promise<PongResult> {
    return createPongResult({});
  }

  async shutdown(): Promise<ShutdownAckResult> {
    const result = createShutdownAckResult({});
    this.close();
    return result;
  }

  async waitForRunningTask() {
    await this.commandRouter.waitForRunningTask();
  }

  async listAgents(): Promise<AgentDefinitionsResult> {
    return createAgentDefinitionsResult({});
  }

  async listAgentTools(input: AgentToolsQuery = {}): Promise<AgentToolsResult> {
    return createAgentToolsResult(input);
  }

  async listRuntimeModels(): Promise<RuntimeModelsResult> {
    return createRuntimeModelsResult({});
  }

  async sendMessage(input: SendMessageInput): Promise<ChatResult | TaskResult> {
    const command = {
      ...input,
      requestId: null,
      type: AgentTaskCommandType.SendMessage as const,
    };
    const runtimeCommand = runtimeCommandFromSendMessage(command);
    return runtimeCommand.mode === "agent"
      ? this.runAgent(runtimeCommand.command)
      : this.chat(runtimeCommand.command);
  }

  async answerQuestion(input: AnswerQuestionInput): Promise<void> {
    this.userInput.handleAnswer({
      ...input,
      requestId: null,
      type: AgentTaskCommandType.AnswerQuestion as const,
    });
  }

  async runChat(input: RunChatInput): Promise<ChatResult> {
    return this.chat(chatRunCommandFromChat({
      ...input,
      requestId: null,
      type: AgentTaskCommandType.Chat as const,
    }));
  }

  async chat(input: ChatInput): Promise<ChatResult> {
    const command: ChatRunCommand = {
      ...input,
      type: "chat",
    };
    const result = await this.agentEngine.chat(command, { emit: this.emitAgentEvent });
    return {
      type: AgentResultType.ChatResult,
      requestId: command.requestId ?? null,
      ...result,
    };
  }

  async runAgent(input: AgentRunInput): Promise<TaskResult> {
    return this.executeAgentRun({
      ...input,
      runtimeMode: "agent",
      requestId: null,
    });
  }

  private async executeAgentRun(command: AgentRunCommand): Promise<TaskResult> {
    try {
      await this.agentEngine.runAgent(command, {
        callbacks: this.runtimeCallbacks,
        emit: this.emitAgentEvent,
      });
      return createTaskResult(command, { success: true });
    } catch (error: unknown) {
      const message = messageFromError(error);
      this.emitAgentEvent({
        type: AgentEventType.Error,
        taskId: command.taskId,
        message,
      });
      return createTaskResult(command, { success: false, message });
    }
  }

  async readSession(input: ReadSessionInput): Promise<SessionResult> {
    return runtimeSessionManagerFor(input).readSession();
  }

  async compactAgentSession(input: CompactAgentSessionInput): Promise<SessionMutationResult> {
    const { runtimeId, implementation } = resolveRuntime("agent", input.target.agentId);
    const sessionPlan = await createAgentSessionPlan({
      workspacePath: input.workspacePath,
      sessionRootDir: input.sessionRootDir,
      runtimeId,
      agentRoleId: input.target.agentRoleId,
    });
    const compactCommand: RuntimeAgentCompactCommand = {
      requestId: null,
      agentId: input.target.agentId ?? runtimeId,
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
          callbacks: this.runtimeCallbacks,
          emit: this.emitAgentEvent,
        })
      : agentMaintenanceMutationResult(compactCommand, { compacted: false });
  }

  async rebuildAgentSession(
    input: RebuildAgentSessionInput,
  ): Promise<SessionMutationResult> {
    const sessionManager = runtimeSessionManagerFor(input);
    const { runtimeId, implementation } = resolveRuntime("agent", input.target.agentId);
    const sessionPlan = await createAgentSessionPlan({
      workspacePath: input.workspacePath,
      sessionRootDir: input.sessionRootDir,
      runtimeId,
      agentRoleId: input.target.agentRoleId,
    });
    const taskId = `runtime-rebuild-agent-session-${randomUUID()}`;
    const rebuildCommand: RuntimeAgentRebuildCommand = {
      requestId: null,
      agentId: input.target.agentId ?? runtimeId,
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
          this.runtimeContextWithSession(sessionManager, () => undefined),
        )
      : agentMaintenanceMutationResult(rebuildCommand, { rebuilt: false });
  }

  async summarizeSession(input: SummarizeSessionInput): Promise<SessionMutationResult> {
    return runtimeSessionManagerFor(input).summarizeSession(withoutRuntimeSessionTarget(input));
  }

  async summarizeAgentSession(input: SummarizeAgentSessionInput): Promise<SessionMutationResult> {
    const sessionManager = runtimeSessionManagerFor(input);
    const { runtimeId, implementation } = resolveRuntime("agent", input.target.agentId);
    if (!implementation.summarize) {
      throw new Error(`${runtimeId} agent runtime 不支持摘要底层 session`);
    }

    const sessionPlan = await createAgentSessionPlan({
      workspacePath: input.workspacePath,
      sessionRootDir: input.sessionRootDir,
      runtimeId,
      agentRoleId: input.target.agentRoleId,
    });
    const summarizeCommand: RuntimeAgentSummarizeCommand = {
      requestId: null,
      agentId: input.target.agentId ?? runtimeId,
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
      this.runtimeContextWithSession(sessionManager, this.emitAgentEvent),
    );
  }

  async editSessionMessage(input: EditSessionMessageInput): Promise<SessionMutationResult> {
    return runtimeSessionManagerFor(input).editSessionMessage(withoutRuntimeSessionTarget(input), {
      invalidateDerivedArtifacts: clearAgentSessionArtifacts,
    });
  }

  async deleteSessionMessage(input: DeleteSessionMessageInput): Promise<SessionMutationResult> {
    return runtimeSessionManagerFor(input).deleteSessionMessage(withoutRuntimeSessionTarget(input), {
      invalidateDerivedArtifacts: clearAgentSessionArtifacts,
    });
  }

  async appendSessionMessages(input: AppendSessionMessagesInput): Promise<SessionMutationResult> {
    return runtimeSessionManagerFor(input).appendSessionMessages(withoutRuntimeSessionTarget(input));
  }

  async rebuildSession(input: RebuildSessionInput): Promise<SessionMutationResult> {
    return runtimeSessionManagerFor(input).rebuildSession(withoutRuntimeSessionTarget(input), {
      invalidateDerivedArtifacts: clearAgentSessionArtifacts,
    });
  }

  async listRuntimeSessions(
    input: RuntimeSessionsQuery,
  ): Promise<RuntimeSessionsResult> {
    return listRuntimeSessionSummaries(input);
  }

  async readRuntimeSession(input: RuntimeSessionQuery): Promise<RuntimeSessionResult> {
    return runtimeSessionManagerFor(input).readRuntimeSession(withoutRuntimeSessionTarget(input));
  }

  async readCollaborationTimeline(
    input: CollaborationTimelineQuery,
  ): Promise<CollaborationTimelineResult> {
    return runtimeSessionManagerFor(input).readCollaborationTimeline(
      withoutRuntimeSessionTarget(input),
    );
  }

  async listCollaborationModes(): Promise<CollaborationModesRuntimeResult> {
    return {
      type: AgentRuntimeResultType.CollaborationModesResult,
      requestId: null,
      modes: this.collaboration.listModes(),
    };
  }

  async runCollaboration(input: RunCollaborationInput): Promise<CollaborationRuntimeResult> {
    const result = await this.collaboration.run(
      {
        ...input,
        requestId: input.requestId ?? null,
      },
      { emit: this.emitCollaborationEvent },
    );
    return {
      type: AgentRuntimeResultType.CollaborationResult,
      requestId: input.requestId ?? null,
      ...result,
    };
  }

  async runCollaborationMode(
    input: RunCollaborationModeInput,
  ): Promise<CollaborationRuntimeResult> {
    const result = await this.collaboration.runMode(
      {
        ...input,
        requestId: input.requestId ?? null,
      },
      { emit: this.emitCollaborationEvent },
    );
    return {
      type: AgentRuntimeResultType.CollaborationResult,
      requestId: input.requestId ?? null,
      ...result,
    };
  }

  private readonly emitAgentEvent: EmitAgentEvent = (event) => {
    this.emitEvent(event);
  };

  private readonly emitCollaborationEvent: EmitCollaborationEvent = (event) => {
    this.emitEvent(event);
  };

  private readonly runtimeContextWithSession = (
    sessionManager: ReturnType<typeof createRuntimeSessionManager>,
    emit: EmitAgentEvent,
  ): AgentRuntimeContext => ({
    callbacks: this.runtimeCallbacks,
    emit,
    nativeSession: {
      readSession: () => sessionManager.readSession(),
      readAgentVisibleContext: (contextInput) =>
        sessionManager.readAgentVisibleContext(contextInput),
    },
  });

}

export const createNativeRuntimeEngine = (options: RuntimeEngineOptions = {}) =>
  new NativeAgentRuntimeEngine(options);

export type RuntimeEngine = NativeAgentRuntimeEngine;
