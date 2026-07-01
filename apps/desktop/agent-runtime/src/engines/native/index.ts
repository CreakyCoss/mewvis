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
  type CompactSessionInput,
  type CreateSessionInput,
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
  type SummarizeSessionInput,
  type TaskResult,
} from "../protocol/index.js";
import {
  chatRunCommandFromChat,
  runtimeCommandFromSendMessage,
} from "./agent/commands/adapter.js";
import {
  clearAgentSessionArtifacts,
} from "./agent/session/artifacts.js";
import {
  compactRuntimeSession,
  rebuildRuntimeAgentSession,
} from "./agent/session/maintenance.js";
import { generateDisplaySummary } from "./agent/session/summary.js";
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
  createNativeSessionService,
  type NativeSessionService,
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
} from "./agent/runtimes/types.js";
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
  private readonly sessions: NativeSessionService<AgentRuntimeContext>;

  constructor({
    callbacks,
    close = () => undefined,
  }: RuntimeEngineOptions = {}) {
    super();

    this.close = close;
    this.emitEvent = callbacks?.onEvent ?? (() => undefined);
    this.emitResult = callbacks?.onResult ?? (() => undefined);
    this.userInput = createUserInputManager(this.emitAgentEvent);
    this.sessions = createNativeSessionService<AgentRuntimeContext>({
      compactSession: compactRuntimeSession,
      rebuildAgentSession: rebuildRuntimeAgentSession,
      generateDisplaySummary,
      invalidateDerivedArtifacts: clearAgentSessionArtifacts,
    });
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

  async createSession(input: CreateSessionInput): Promise<SessionMutationResult> {
    return this.sessions.createSession(input);
  }

  async readSession(input: ReadSessionInput): Promise<SessionResult> {
    return this.sessions.readSession(input);
  }

  async compactSession(input: CompactSessionInput): Promise<SessionMutationResult> {
    return this.sessions.compactSession(input, {
      callbacks: this.runtimeCallbacks,
      emit: this.emitAgentEvent,
    });
  }

  async rebuildAgentSession(
    input: RebuildAgentSessionInput,
  ): Promise<SessionMutationResult> {
    return this.sessions.rebuildAgentSession(input, {
      callbacks: this.runtimeCallbacks,
      emit: () => undefined,
    });
  }

  async summarizeSession(input: SummarizeSessionInput): Promise<SessionMutationResult> {
    return this.sessions.summarizeSession(input);
  }

  async editSessionMessage(input: EditSessionMessageInput): Promise<SessionMutationResult> {
    return this.sessions.editSessionMessage(input);
  }

  async deleteSessionMessage(input: DeleteSessionMessageInput): Promise<SessionMutationResult> {
    return this.sessions.deleteSessionMessage(input);
  }

  async appendSessionMessages(input: AppendSessionMessagesInput): Promise<SessionMutationResult> {
    return this.sessions.appendSessionMessages(input);
  }

  async rebuildSession(input: RebuildSessionInput): Promise<SessionMutationResult> {
    return this.sessions.rebuildSession(input);
  }

  async listRuntimeSessions(
    input: RuntimeSessionsQuery,
  ): Promise<RuntimeSessionsResult> {
    return this.sessions.listRuntimeSessions(input);
  }

  async readRuntimeSession(input: RuntimeSessionQuery): Promise<RuntimeSessionResult> {
    return this.sessions.readRuntimeSession(input);
  }

  async readCollaborationTimeline(
    input: CollaborationTimelineQuery,
  ): Promise<CollaborationTimelineResult> {
    return this.sessions.readCollaborationTimeline(input);
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

}

export const createNativeRuntimeEngine = (options: RuntimeEngineOptions = {}) =>
  new NativeAgentRuntimeEngine(options);

export type RuntimeEngine = NativeAgentRuntimeEngine;
