import {
  AgentEventType,
  AgentResultType,
  AgentRuntimeCommandType,
  AgentRuntimeResultType,
  AgentSessionCommandType,
  AgentTaskCommandType,
  type AgentRuntimeCommand,
  type AgentRuntimeResult,
  type ChatCommand,
  type RunCollaborationCommand,
  type RunCollaborationModeCommand,
  type SendMessageCommand,
  type TaskResult,
} from "../protocol/index.js";
import type {
  AgentRuntimeEngine,
  EmitAgentRuntimeEvent,
  EmitAgentRuntimeResult,
} from "../runtime.js";
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
  engine: AgentRuntimeEngine;
  emitEvent: EmitAgentRuntimeEvent;
  emitResult: EmitAgentRuntimeResult;
  runAgentCommand(command: AgentRunCommand): Promise<TaskResult>;
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

    await emitCommandActionResult(command, () => deps.engine.chat(chatCommand));
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
      ? deps.engine.runCollaborationMode(command.input)
      : deps.engine.runCollaboration(command.input);

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
        emitCommandResult(command, await deps.engine.ping());
        return true;

      case AgentTaskCommandType.Shutdown:
        emitCommandResult(command, await deps.engine.shutdown());
        return false;

      case AgentTaskCommandType.ListAgents:
        emitCommandResult(command, await deps.engine.listAgents());
        return true;

      case AgentTaskCommandType.ListAgentTools:
        emitCommandResult(command, await deps.engine.listAgentTools(commandInputFrom(command)));
        return true;

      case AgentTaskCommandType.ListRuntimeModels:
        emitCommandResult(command, await deps.engine.listRuntimeModels());
        return true;

      case AgentTaskCommandType.AnswerQuestion:
        await deps.engine.answerQuestion(commandInputFrom(command));
        return true;

      case AgentTaskCommandType.SendMessage:
        await runSendMessageCommand(command);
        return true;

      case AgentTaskCommandType.Chat:
        await runChatCommand(command, chatRunCommandFromChat(command));
        return true;

      case AgentSessionCommandType.CreateSession:
        await emitCommandActionResult(command, () =>
          deps.engine.createSession(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.ReadSession:
        await emitCommandActionResult(command, () =>
          deps.engine.readSession(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.Compact:
        await emitCommandActionResult(command, () =>
          deps.engine.compactSession(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.RebuildAgentSession:
        if (activeAgentRun) {
          emitCommandError(command, runningTaskMessage);
          return true;
        }
        await emitCommandActionResult(command, () =>
          deps.engine.rebuildAgentSession(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.SummarizeSession:
        await emitCommandActionResult(command, () =>
          deps.engine.summarizeSession(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.MessageEdit:
        await emitCommandActionResult(command, () =>
          deps.engine.editSessionMessage(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.MessageDelete:
        await emitCommandActionResult(command, () =>
          deps.engine.deleteSessionMessage(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.MessageAppend:
        await emitCommandActionResult(command, () =>
          deps.engine.appendSessionMessages(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.Rebuild:
        await emitCommandActionResult(command, () =>
          deps.engine.rebuildSession(commandInputFrom(command)));
        return true;

      case AgentRuntimeCommandType.ListCollaborationModes:
        emitCommandResult(command, await deps.engine.listCollaborationModes());
        return true;

      case AgentRuntimeCommandType.ListRuntimeSessions:
        await emitCommandActionResult(command, () =>
          deps.engine.listRuntimeSessions(commandInputFrom(command)));
        return true;

      case AgentRuntimeCommandType.ReadRuntimeSession:
        await emitCommandActionResult(command, () =>
          deps.engine.readRuntimeSession(commandInputFrom(command)));
        return true;

      case AgentRuntimeCommandType.ReadCollaborationTimeline:
        await emitCommandActionResult(command, () =>
          deps.engine.readCollaborationTimeline(commandInputFrom(command)));
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
