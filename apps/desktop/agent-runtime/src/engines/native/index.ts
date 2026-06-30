import type { AgentCommand as InternalAgentCommand } from "./agent/contracts/index.js";
import {
  AgentRuntimeEngine,
  type RuntimeEngineOptions,
} from "../runtime.js";
import {
  AgentEventType,
  AgentResultType,
  type AgentDefinitionsResult,
  type AgentRunCommand,
  type ChatResult,
  type ChatRunCommand,
  type ListAgentsCommand,
  type PingCommand,
  type PongResult,
  type ShutdownAckResult,
  type ShutdownCommand,
  type TaskResult,
} from "../protocol/agent.js";
import {
  AgentRuntimeCommandType,
  type AgentRuntimeCommand,
  type GetCollaborationTimelineCommand,
  type GetRuntimeSessionCommand,
  type ListCollaborationModesCommand,
  type ListRuntimeSessionsCommand,
  type RunCollaborationCommand,
  type RunCollaborationModeCommand,
} from "../protocol/command.js";
import type { AgentRuntimeEvent } from "../protocol/event.js";
import {
  AgentRuntimeResultType,
  type AgentRuntimeResult,
  type CollaborationModesRuntimeResult,
  type CollaborationRuntimeResult,
  type CollaborationTimelineResult,
  type RuntimeSessionResult,
  type RuntimeSessionsResult,
} from "../protocol/result.js";
import { createAgentCommandRouter } from "./agent/commands/router.js";
import {
  createAgentDefinitionsResult,
  createPongResult,
  createShutdownAckResult,
  createTaskResult,
} from "./agent/commands/responses.js";
import {
  createAgentEngine,
  type AgentEngine,
} from "./agent/index.js";
import type { EmitAgentEvent } from "./agent/runtimes/types.js";
import { createCollaborationEngine } from "./collaboration/index.js";
import type { RunAgentForCollaboration } from "./collaboration/contracts/executor.js";
import type {
  CollaborationRunInput as InternalCollaborationRunInput,
} from "./collaboration/contracts/workflow.js";
import type {
  CollaborationModeRunInput as InternalCollaborationModeRunInput,
} from "./collaboration/modes/contracts.js";
import type { CollaborationEngine } from "./collaboration/index.js";
import type { EmitCollaborationEvent } from "./collaboration/contracts/event.js";
import {
  getCollaborationTimeline,
  getRuntimeSessionSnapshot,
  listRuntimeSessions,
} from "./session/index.js";
import { messageFromError } from "./error.js";

const collaborationBusyMessage = "当前 Agent runtime 已有运行中的协作任务，无法启动新协作";

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

  async ping(command: PingCommand): Promise<PongResult> {
    return createPongResult(command);
  }

  async shutdown(command: ShutdownCommand): Promise<ShutdownAckResult> {
    const result = createShutdownAckResult(command);
    this.close();
    return result;
  }

  async listAgents(command: ListAgentsCommand): Promise<AgentDefinitionsResult> {
    return createAgentDefinitionsResult(command);
  }

  async chat(command: ChatRunCommand): Promise<ChatResult> {
    const result = await this.agentEngine.chat(command, { emit: this.emitAgentEvent });
    return {
      type: AgentResultType.ChatResult,
      requestId: command.requestId ?? null,
      ...result,
    };
  }

  async runAgent(command: AgentRunCommand): Promise<TaskResult> {
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

  async listRuntimeSessions(
    command: ListRuntimeSessionsCommand,
  ): Promise<RuntimeSessionsResult> {
    return {
      type: AgentRuntimeResultType.RuntimeSessionsResult,
      requestId: command.requestId ?? null,
      sessions: await listRuntimeSessions({
        workspacePath: command.workspacePath,
        rootDir: command.rootDir,
        limit: command.limit,
        maxDepth: command.maxDepth,
      }),
    };
  }

  async getRuntimeSession(command: GetRuntimeSessionCommand): Promise<RuntimeSessionResult> {
    return {
      type: AgentRuntimeResultType.RuntimeSessionResult,
      requestId: command.requestId ?? null,
      ...(await getRuntimeSessionSnapshot(
        {
          workspacePath: command.workspacePath,
          sessionRootDir: command.sessionRootDir,
        },
        {
          includeLedger: command.includeLedger,
          includeTrace: command.includeTrace,
          includeTimeline: command.includeTimeline,
          timelineLimit: command.timelineLimit,
        },
      )),
    };
  }

  async getCollaborationTimeline(
    command: GetCollaborationTimelineCommand,
  ): Promise<CollaborationTimelineResult> {
    return {
      type: AgentRuntimeResultType.CollaborationTimelineResult,
      requestId: command.requestId ?? null,
      ...(await getCollaborationTimeline(
        {
          workspacePath: command.workspacePath,
          sessionRootDir: command.sessionRootDir,
        },
        {
          workflowRunId: command.workflowRunId,
          limit: command.limit,
        },
      )),
    };
  }

  async listCollaborationModes(
    command: ListCollaborationModesCommand,
  ): Promise<CollaborationModesRuntimeResult> {
    return {
      type: AgentRuntimeResultType.CollaborationModesResult,
      requestId: command.requestId ?? null,
      modes: this.collaboration.listModes(),
    };
  }

  async runCollaboration(command: RunCollaborationCommand): Promise<CollaborationRuntimeResult> {
    const result = await this.collaboration.run(
      {
        ...command.input,
        requestId: command.input.requestId ?? command.requestId ?? null,
      } as InternalCollaborationRunInput,
      { emit: this.emitCollaborationEvent },
    );
    return {
      type: AgentRuntimeResultType.CollaborationResult,
      requestId: command.requestId ?? null,
      ...result,
    };
  }

  async runCollaborationMode(
    command: RunCollaborationModeCommand,
  ): Promise<CollaborationRuntimeResult> {
    const result = await this.collaboration.runMode(
      {
        ...command.input,
        requestId: command.input.requestId ?? command.requestId ?? null,
      } as InternalCollaborationModeRunInput,
      { emit: this.emitCollaborationEvent },
    );
    return {
      type: AgentRuntimeResultType.CollaborationResult,
      requestId: command.requestId ?? null,
      ...result,
    };
  }

  async handle(command: AgentRuntimeCommand): Promise<boolean> {
    switch (command.type) {
      case AgentRuntimeCommandType.ListCollaborationModes:
        this.emitResult(await this.listCollaborationModes(command));
        return true;

      case AgentRuntimeCommandType.ListRuntimeSessions:
        await this.emitSessionQueryResult(() => this.listRuntimeSessions(command));
        return true;

      case AgentRuntimeCommandType.GetRuntimeSession:
        await this.emitSessionQueryResult(() => this.getRuntimeSession(command));
        return true;

      case AgentRuntimeCommandType.GetCollaborationTimeline:
        await this.emitSessionQueryResult(() => this.getCollaborationTimeline(command));
        return true;

      case AgentRuntimeCommandType.RunCollaboration:
      case AgentRuntimeCommandType.RunCollaborationMode:
        this.runCollaborationCommand(command);
        return true;

      default:
        return this.agentCommandRouter.handle(command as InternalAgentCommand);
    }
  }

  async waitForRunningTask() {
    await this.agentCommandRouter.waitForRunningTask();
    if (this.activeCollaborationRun) {
      await this.activeCollaborationRun.catch(() => undefined);
    }
  }

  private async emitSessionQueryResult(
    query: () => Promise<RuntimeSessionsResult | RuntimeSessionResult | CollaborationTimelineResult>,
  ) {
    try {
      this.emitResult(await query());
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
      ? this.runCollaborationMode(command)
      : this.runCollaboration(command);

    this.activeCollaborationRun = run.then((result) => {
      this.emitResult(result);
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
