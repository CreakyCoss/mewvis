import {
  AgentEventType,
  AgentResultType,
  AgentRuntimeCommandType,
  AgentRuntimeResultType,
  AgentSessionCommandType,
  AgentTaskCommandType,
  type AgentDefinitionsResult,
  type AgentRuntimeCommand,
  type AgentRuntimeEvent,
  type AgentRuntimeResult,
  type AgentToolsResult,
  type AgentToolsQuery,
  type AnswerQuestionInput,
  type AppendSessionMessagesInput,
  type ChatCommand,
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
  type RunCollaborationCommand,
  type RunCollaborationInput,
  type RunCollaborationModeCommand,
  type RunCollaborationModeInput,
  type RuntimeModelsResult,
  type RuntimeSessionQuery,
  type RuntimeSessionResult,
  type RuntimeSessionsQuery,
  type RuntimeSessionsResult,
  type SendMessageCommand,
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
import type {
  AgentRunCommand,
  ChatRunCommand,
} from "./agent/runtimes/types.js";
import { createTaskResult } from "./agent/commands/responses.js";
import { messageFromError } from "./error.js";

const collaborationBusyMessage = "当前 Agent runtime 已有运行中的协作任务，无法启动新协作";
const runningTaskMessage = "当前 Agent runtime 已有运行中的任务，无法启动新任务";
const runningTaskChatMessage = "当前 Agent runtime 已有运行中的任务，无法启动 chat";

type RequestCommand = {
  requestId?: string | null;
};

const commandInputFrom = <TCommand extends { type: unknown; requestId?: string | null }>(
  command: TCommand,
): Omit<TCommand, "type" | "requestId"> => {
  const { type: _type, requestId: _requestId, ...input } = command;
  return input;
};

type NativeRuntimeCommandRouterDeps = {
  emitEvent(event: AgentRuntimeEvent): void;
  emitResult(result: AgentRuntimeResult): void;
  ping(): Promise<PongResult>;
  shutdown(): Promise<ShutdownAckResult>;
  listAgents(): Promise<AgentDefinitionsResult>;
  listAgentTools(input?: AgentToolsQuery): Promise<AgentToolsResult>;
  listRuntimeModels(): Promise<RuntimeModelsResult>;
  answerQuestion(input: AnswerQuestionInput): Promise<void>;
  chat(input: ChatInput): Promise<ChatResult>;
  runAgentCommand(command: AgentRunCommand): Promise<TaskResult>;
  createSession(input: CreateSessionInput): Promise<SessionMutationResult>;
  readSession(input: ReadSessionInput): Promise<SessionResult>;
  compactSession(input: CompactSessionInput): Promise<SessionMutationResult>;
  rebuildAgentSession(input: RebuildAgentSessionInput): Promise<SessionMutationResult>;
  summarizeSession(input: SummarizeSessionInput): Promise<SessionMutationResult>;
  editSessionMessage(input: EditSessionMessageInput): Promise<SessionMutationResult>;
  deleteSessionMessage(input: DeleteSessionMessageInput): Promise<SessionMutationResult>;
  appendSessionMessages(input: AppendSessionMessagesInput): Promise<SessionMutationResult>;
  rebuildSession(input: RebuildSessionInput): Promise<SessionMutationResult>;
  listRuntimeSessions(input: RuntimeSessionsQuery): Promise<RuntimeSessionsResult>;
  readRuntimeSession(input: RuntimeSessionQuery): Promise<RuntimeSessionResult>;
  readCollaborationTimeline(input: CollaborationTimelineQuery): Promise<CollaborationTimelineResult>;
  listCollaborationModes(): Promise<CollaborationModesRuntimeResult>;
  runCollaboration(input: RunCollaborationInput): Promise<CollaborationRuntimeResult>;
  runCollaborationMode(input: RunCollaborationModeInput): Promise<CollaborationRuntimeResult>;
};

export const createNativeRuntimeCommandRouter = (
  deps: NativeRuntimeCommandRouterDeps,
) => {
  let activeAgentRun: Promise<void> | null = null;
  let activeCollaborationRun: Promise<void> | null = null;

  const emitCommandResult = (command: RequestCommand, result: AgentRuntimeResult) => {
    deps.emitResult({
      ...result,
      requestId: command.requestId ?? null,
    } as AgentRuntimeResult);
  };

  const emitCommandError = (
    _command: RequestCommand,
    message: string,
    taskId?: string | null,
  ) => {
    deps.emitEvent({
      type: AgentEventType.Error,
      taskId: taskId || undefined,
      message,
    });
  };

  const emitCommandActionResult = async (
    command: RequestCommand,
    action: () => Promise<AgentRuntimeResult>,
  ) => {
    try {
      emitCommandResult(command, await action());
    } catch (error: unknown) {
      emitCommandError(command, messageFromError(error));
    }
  };

  const runChatCommand = async (
    command: ChatCommand | SendMessageCommand,
    chatCommand: ChatRunCommand,
  ) => {
    if (activeAgentRun) {
      emitCommandError(command, runningTaskChatMessage, chatCommand.streamId);
      return;
    }

    await emitCommandActionResult(command, () => deps.chat(chatCommand));
  };

  const runAgentCommandWhenIdle = (
    command: SendMessageCommand,
    agentCommand: AgentRunCommand,
  ) => {
    if (activeAgentRun) {
      emitCommandError(command, runningTaskMessage, agentCommand.taskId);
      emitCommandResult(command, createTaskResult(agentCommand, {
        success: false,
        message: runningTaskMessage,
      }));
      return;
    }

    activeAgentRun = deps.runAgentCommand(agentCommand)
      .then((result) => {
        emitCommandResult(command, result);
      })
      .finally(() => {
        activeAgentRun = null;
      });
  };

  const runSendMessageCommand = async (command: SendMessageCommand) => {
    const runtimeCommand = runtimeCommandFromSendMessage(command);
    if (runtimeCommand.mode === "chat") {
      await runChatCommand(command, runtimeCommand.command);
      return;
    }

    runAgentCommandWhenIdle(command, runtimeCommand.command);
  };

  const taskIdFor = (command: RunCollaborationCommand | RunCollaborationModeCommand) =>
    command.requestId?.trim() || command.input.requestId?.trim() || "";

  const emitCollaborationBusyResult = (
    command: RunCollaborationCommand | RunCollaborationModeCommand,
  ) => {
    deps.emitEvent({
      type: AgentEventType.Error,
      message: collaborationBusyMessage,
    });
    deps.emitResult({
      type: AgentRuntimeResultType.CollaborationResult,
      requestId: command.requestId ?? null,
      workflowRunId: "",
      steps: [],
      success: false,
      message: collaborationBusyMessage,
    });
    deps.emitResult({
      type: AgentResultType.TaskResult,
      requestId: command.requestId ?? null,
      taskId: taskIdFor(command),
      success: false,
      message: collaborationBusyMessage,
    });
  };

  const runCollaborationCommand = (
    command: RunCollaborationCommand | RunCollaborationModeCommand,
  ) => {
    if (activeCollaborationRun) {
      emitCollaborationBusyResult(command);
      return;
    }

    const run = command.type === AgentRuntimeCommandType.RunCollaborationMode
      ? deps.runCollaborationMode(command.input)
      : deps.runCollaboration(command.input);

    activeCollaborationRun = run.then((result) => {
      emitCommandResult(command, result);
      deps.emitResult({
        type: AgentResultType.TaskResult,
        requestId: command.requestId ?? null,
        taskId: taskIdFor(command),
        success: true,
      });
    }).catch((error: unknown) => {
      const message = messageFromError(error);
      deps.emitEvent({
        type: AgentEventType.Error,
        taskId: taskIdFor(command) || undefined,
        message,
      });
      deps.emitResult({
        type: AgentResultType.TaskResult,
        requestId: command.requestId ?? null,
        taskId: taskIdFor(command),
        success: false,
        message,
      });
    }).finally(() => {
      activeCollaborationRun = null;
    });
  };

  const handle = async (command: AgentRuntimeCommand): Promise<boolean> => {
    switch (command.type) {
      case AgentTaskCommandType.Ping:
        emitCommandResult(command, await deps.ping());
        return true;

      case AgentTaskCommandType.Shutdown:
        emitCommandResult(command, await deps.shutdown());
        return false;

      case AgentTaskCommandType.ListAgents:
        emitCommandResult(command, await deps.listAgents());
        return true;

      case AgentTaskCommandType.ListAgentTools:
        emitCommandResult(command, await deps.listAgentTools(commandInputFrom(command)));
        return true;

      case AgentTaskCommandType.ListRuntimeModels:
        emitCommandResult(command, await deps.listRuntimeModels());
        return true;

      case AgentTaskCommandType.AnswerQuestion:
        await deps.answerQuestion(commandInputFrom(command));
        return true;

      case AgentTaskCommandType.SendMessage:
        await runSendMessageCommand(command);
        return true;

      case AgentTaskCommandType.Chat:
        await runChatCommand(command, chatRunCommandFromChat(command));
        return true;

      case AgentSessionCommandType.CreateSession:
        await emitCommandActionResult(command, () =>
          deps.createSession(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.ReadSession:
        await emitCommandActionResult(command, () =>
          deps.readSession(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.Compact:
        await emitCommandActionResult(command, () =>
          deps.compactSession(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.RebuildAgentSession:
        if (activeAgentRun) {
          emitCommandError(command, runningTaskMessage);
          return true;
        }
        await emitCommandActionResult(command, () =>
          deps.rebuildAgentSession(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.SummarizeSession:
        await emitCommandActionResult(command, () =>
          deps.summarizeSession(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.MessageEdit:
        await emitCommandActionResult(command, () =>
          deps.editSessionMessage(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.MessageDelete:
        await emitCommandActionResult(command, () =>
          deps.deleteSessionMessage(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.MessageAppend:
        await emitCommandActionResult(command, () =>
          deps.appendSessionMessages(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.Rebuild:
        await emitCommandActionResult(command, () =>
          deps.rebuildSession(commandInputFrom(command)));
        return true;

      case AgentRuntimeCommandType.ListCollaborationModes:
        emitCommandResult(command, await deps.listCollaborationModes());
        return true;

      case AgentRuntimeCommandType.ListRuntimeSessions:
        await emitCommandActionResult(command, () =>
          deps.listRuntimeSessions(commandInputFrom(command)));
        return true;

      case AgentRuntimeCommandType.ReadRuntimeSession:
        await emitCommandActionResult(command, () =>
          deps.readRuntimeSession(commandInputFrom(command)));
        return true;

      case AgentRuntimeCommandType.ReadCollaborationTimeline:
        await emitCommandActionResult(command, () =>
          deps.readCollaborationTimeline(commandInputFrom(command)));
        return true;

      case AgentRuntimeCommandType.RunCollaboration:
      case AgentRuntimeCommandType.RunCollaborationMode:
        runCollaborationCommand(command);
        return true;
    }
  };

  const waitForRunningTask = async () => {
    if (activeAgentRun) {
      await activeAgentRun.catch(() => undefined);
    }
    if (activeCollaborationRun) {
      await activeCollaborationRun.catch(() => undefined);
    }
  };

  return {
    handle,
    waitForRunningTask,
  };
};

export type NativeRuntimeCommandRouter = ReturnType<typeof createNativeRuntimeCommandRouter>;
