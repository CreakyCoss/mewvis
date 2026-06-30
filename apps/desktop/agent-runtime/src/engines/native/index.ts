import {
  AgentRuntimeEngine,
  type RuntimeEngineOptions,
} from "../runtime.js";
import {
  AgentEventType,
  AgentResultType,
  AgentRuntimeCommandType,
  AgentRuntimeResultType,
  AgentSessionCommandType,
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
  type RunCollaborationCommand,
  type RunCollaborationInput,
  type RunCollaborationModeCommand,
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
  createAgentCommandRouter,
  runtimeCommandFromSendMessage,
} from "./agent/commands/router.js";
import {
  createAgentDefinitionsResult,
  createAgentToolsResult,
  createPongResult,
  createRuntimeModelsResult,
  createShutdownAckResult,
  createTaskResult,
} from "./agent/commands/responses.js";
import {
  appendRuntimeSessionMessages,
  compactRuntimeSession,
  createRuntimeSession,
  deleteRuntimeSessionMessage,
  editRuntimeSessionMessage,
  readRuntimeSession,
  rebuildRuntimeAgentSession,
  rebuildRuntimeSession,
  summarizeRuntimeSession,
} from "./agent/session/index.js";
import {
  createAgentEngine,
  type AgentEngine,
} from "./agent/index.js";
import type {
  AgentRunCommand,
  ChatRunCommand,
  EmitAgentEvent,
} from "./agent/runtimes/types.js";
import { createCollaborationEngine } from "./collaboration/index.js";
import type {
  EmitCollaborationEvent,
  RunAgentForCollaboration,
} from "./collaboration/contracts/executor.js";
import type { CollaborationEngine } from "./collaboration/index.js";
import {
  getCollaborationTimeline,
  getRuntimeSessionSnapshot,
  listRuntimeSessions,
} from "./session/index.js";
import { messageFromError } from "./error.js";

const collaborationBusyMessage = "当前 Agent runtime 已有运行中的协作任务，无法启动新协作";

type RequestCommand = {
  requestId?: string | null;
};

const commandInputFrom = <TCommand extends { type: unknown; requestId?: string | null }>(
  command: TCommand,
): Omit<TCommand, "type" | "requestId"> => {
  const { type: _type, requestId: _requestId, ...input } = command;
  return input;
};

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
  private readonly agentCommandRouter;
  private activeCollaborationRun: Promise<void> | null = null;

  constructor({
    callbacks,
    close = () => undefined,
  }: RuntimeEngineOptions = {}) {
    super();

    this.close = close;
    this.emitEvent = callbacks?.onEvent ?? (() => undefined);
    this.emitResult = callbacks?.onResult ?? (() => undefined);
    this.agentCommandRouter = createAgentCommandRouter({
      callbacks,
      close,
      emit: this.emitAgentEvent,
      writeJsonLine: this.emitInternalResult,
    });

    const runAgentForCollaboration: RunAgentForCollaboration = (command, context) =>
      this.agentEngine.runAgent(command, {
        callbacks: this.agentCommandRouter.callbacks,
        emit: context.emit,
      });

    this.collaboration = createCollaborationEngine({
      runAgent: runAgentForCollaboration,
    });
    this.agent = {
      chat: this.agentEngine.chat,
      run: this.agentEngine.runAgent,
    };
  }

  async handle(command: AgentRuntimeCommand): Promise<boolean> {
    switch (command.type) {
      case AgentRuntimeCommandType.ListCollaborationModes:
        this.emitCommandResult(command, await this.listCollaborationModes());
        return true;

      case AgentRuntimeCommandType.ListRuntimeSessions:
        await this.emitQueryResult(command, () =>
          this.listRuntimeSessions(commandInputFrom(command)));
        return true;

      case AgentRuntimeCommandType.ReadRuntimeSession:
        await this.emitQueryResult(command, () =>
          this.readRuntimeSession(commandInputFrom(command)));
        return true;

      case AgentRuntimeCommandType.ReadCollaborationTimeline:
        await this.emitQueryResult(command, () =>
          this.readCollaborationTimeline(commandInputFrom(command)));
        return true;

      case AgentRuntimeCommandType.RunCollaboration:
      case AgentRuntimeCommandType.RunCollaborationMode:
        this.runCollaborationCommand(command);
        return true;

      default:
        return this.agentCommandRouter.handle(command);
    }
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
    await this.agentCommandRouter.waitForRunningTask();
    if (this.activeCollaborationRun) {
      await this.activeCollaborationRun.catch(() => undefined);
    }
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
    this.agentCommandRouter.answerQuestion({
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
    const command: AgentRunCommand = {
      ...input,
      runtimeMode: "agent",
      requestId: null,
    };
    try {
      await this.agentEngine.runAgent(command, {
        callbacks: this.agentCommandRouter.callbacks,
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
    return createRuntimeSession({
      ...input,
      requestId: null,
      type: AgentSessionCommandType.CreateSession as const,
    });
  }

  async readSession(input: ReadSessionInput): Promise<SessionResult> {
    return readRuntimeSession({
      ...input,
      requestId: null,
      type: AgentSessionCommandType.ReadSession as const,
    });
  }

  async compactSession(input: CompactSessionInput): Promise<SessionMutationResult> {
    return compactRuntimeSession({
      ...input,
      requestId: null,
      type: AgentSessionCommandType.Compact as const,
    }, {
      callbacks: this.agentCommandRouter.callbacks,
      emit: this.emitAgentEvent,
    });
  }

  async rebuildAgentSession(
    input: RebuildAgentSessionInput,
  ): Promise<SessionMutationResult> {
    return rebuildRuntimeAgentSession({
      ...input,
      requestId: null,
      type: AgentSessionCommandType.RebuildAgentSession as const,
    }, {
      callbacks: this.agentCommandRouter.callbacks,
      emit: () => undefined,
    });
  }

  async summarizeSession(input: SummarizeSessionInput): Promise<SessionMutationResult> {
    return summarizeRuntimeSession({
      ...input,
      requestId: null,
      type: AgentSessionCommandType.SummarizeSession as const,
    });
  }

  async editSessionMessage(input: EditSessionMessageInput): Promise<SessionMutationResult> {
    return editRuntimeSessionMessage({
      ...input,
      requestId: null,
      type: AgentSessionCommandType.MessageEdit as const,
    });
  }

  async deleteSessionMessage(input: DeleteSessionMessageInput): Promise<SessionMutationResult> {
    return deleteRuntimeSessionMessage({
      ...input,
      requestId: null,
      type: AgentSessionCommandType.MessageDelete as const,
    });
  }

  async appendSessionMessages(input: AppendSessionMessagesInput): Promise<SessionMutationResult> {
    return appendRuntimeSessionMessages({
      ...input,
      requestId: null,
      type: AgentSessionCommandType.MessageAppend as const,
    });
  }

  async rebuildSession(input: RebuildSessionInput): Promise<SessionMutationResult> {
    return rebuildRuntimeSession({
      ...input,
      requestId: null,
      type: AgentSessionCommandType.Rebuild as const,
    });
  }

  async listRuntimeSessions(
    input: RuntimeSessionsQuery,
  ): Promise<RuntimeSessionsResult> {
    return {
      type: AgentRuntimeResultType.RuntimeSessionsResult,
      requestId: null,
      sessions: await listRuntimeSessions({
        workspacePath: input.workspacePath,
        rootDir: input.rootDir,
        limit: input.limit,
        maxDepth: input.maxDepth,
      }),
    };
  }

  async readRuntimeSession(input: RuntimeSessionQuery): Promise<RuntimeSessionResult> {
    return {
      type: AgentRuntimeResultType.RuntimeSessionResult,
      requestId: null,
      ...(await getRuntimeSessionSnapshot(
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
  }

  async readCollaborationTimeline(
    input: CollaborationTimelineQuery,
  ): Promise<CollaborationTimelineResult> {
    return {
      type: AgentRuntimeResultType.CollaborationTimelineResult,
      requestId: null,
      ...(await getCollaborationTimeline(
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

  private emitCommandResult(command: RequestCommand, result: AgentRuntimeResult) {
    this.emitResult({
      ...result,
      requestId: command.requestId ?? null,
    } as AgentRuntimeResult);
  }

  private async emitQueryResult(
    command: RequestCommand,
    query: () => Promise<RuntimeSessionsResult | RuntimeSessionResult | CollaborationTimelineResult>,
  ) {
    try {
      this.emitCommandResult(command, await query());
    } catch (error: unknown) {
      this.emitAgentEvent({
        type: AgentEventType.Error,
        message: messageFromError(error),
      });
    }
  }

  private taskIdFor(command: RunCollaborationCommand | RunCollaborationModeCommand) {
    return command.requestId?.trim() || command.input.requestId?.trim() || "";
  }

  private emitCollaborationBusyResult(
    command: RunCollaborationCommand | RunCollaborationModeCommand,
  ) {
    this.emitAgentEvent({
      type: AgentEventType.Error,
      message: collaborationBusyMessage,
    });
    this.emitResult({
      type: AgentRuntimeResultType.CollaborationResult,
      requestId: command.requestId ?? null,
      workflowRunId: "",
      steps: [],
      success: false,
      message: collaborationBusyMessage,
    });
    this.emitResult({
      type: AgentResultType.TaskResult,
      requestId: command.requestId ?? null,
      taskId: this.taskIdFor(command),
      success: false,
      message: collaborationBusyMessage,
    });
  }

  private runCollaborationCommand(
    command: RunCollaborationCommand | RunCollaborationModeCommand,
  ) {
    if (this.activeCollaborationRun) {
      this.emitCollaborationBusyResult(command);
      return;
    }

    const run = command.type === AgentRuntimeCommandType.RunCollaborationMode
      ? this.runCollaborationMode(command.input)
      : this.runCollaboration(command.input);

    this.activeCollaborationRun = run.then((result) => {
      this.emitCommandResult(command, result);
      this.emitResult({
        type: AgentResultType.TaskResult,
        requestId: command.requestId ?? null,
        taskId: this.taskIdFor(command),
        success: true,
      });
    }).catch((error: unknown) => {
      const message = messageFromError(error);
      this.emitAgentEvent({
        type: AgentEventType.Error,
        taskId: this.taskIdFor(command) || undefined,
        message,
      });
      this.emitResult({
        type: AgentResultType.TaskResult,
        requestId: command.requestId ?? null,
        taskId: this.taskIdFor(command),
        success: false,
        message,
      });
    }).finally(() => {
      this.activeCollaborationRun = null;
    });
  }

  private readonly emitAgentEvent: EmitAgentEvent = (event) => {
    this.emitEvent(event);
  };

  private readonly emitCollaborationEvent: EmitCollaborationEvent = (event) => {
    this.emitEvent(event);
  };

  private readonly emitInternalResult = (result: unknown) => {
    this.emitResult(result as AgentRuntimeResult);
  };
}

export const createNativeRuntimeEngine = (options: RuntimeEngineOptions = {}) =>
  new NativeAgentRuntimeEngine(options);

export type RuntimeEngine = NativeAgentRuntimeEngine;
