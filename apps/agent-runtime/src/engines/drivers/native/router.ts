import {
  AgentRuntimeEventType,
  AgentRuntimeResultType,
  type AnswerApprovalParams,
  type AnswerQuestionParams,
} from "../../protocol/wire.js";
import {
  AgentRuntimeCommandType,
  AgentSessionCommandType,
  AgentTaskCommandType,
  type AgentRuntimeCommand,
  type AgentRuntimeResult,
  type ChatCommand,
  type RunAgentCommand,
  type RunCollaborationCommand,
  type RunCollaborationModeCommand,
  type TaskResult,
} from "../../protocol/index.js";
import type { AgentRuntimeEngine, EmitAgentRuntimeEvent, EmitAgentRuntimeResult } from "../../runtime.js";
import { agentRunCommandFromRunAgent } from "./agent/commands/adapter.js";
import type { AgentRunCommand } from "./agent/runtimes/types.js";
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
  answerApproval(input: AnswerApprovalParams): Promise<void>;
  answerQuestion(input: AnswerQuestionParams): Promise<void>;
  runAgentCommand(command: AgentRunCommand): Promise<TaskResult>;
};

export const createNativeRuntimeCommandRouter = (deps: NativeRuntimeCommandRouterDeps) => {
  let activeAgentRun: Promise<void> | null = null;
  let activeCollaborationRun: Promise<void> | null = null;

  const emitCommandResult = (command: RequestCommand, result: AgentRuntimeResult) => {
    deps.emitResult({
      ...result,
      requestId: command.requestId ?? null,
    } as AgentRuntimeResult);
  };

  const emitCommandError = (_command: RequestCommand, message: string, taskId?: string | null) => {
    deps.emitEvent({
      type: AgentRuntimeEventType.Error,
      taskId: taskId || undefined,
      message,
    });
  };

  const emitCommandActionResult = async (command: RequestCommand, action: () => Promise<AgentRuntimeResult>) => {
    try {
      emitCommandResult(command, await action());
    } catch (error: unknown) {
      emitCommandError(command, messageFromError(error));
    }
  };

  const handleChatCommand = async (command: ChatCommand) => {
    if (activeAgentRun) {
      emitCommandError(command, runningTaskChatMessage, command.streamId);
      return;
    }

    await emitCommandActionResult(command, () => deps.engine.agent.chat(commandInputFrom(command)));
  };

  const runAgentCommandWhenIdle = (command: RunAgentCommand, agentCommand: AgentRunCommand) => {
    if (activeAgentRun) {
      emitCommandError(command, runningTaskMessage, agentCommand.taskId);
      emitCommandResult(
        command,
        createTaskResult(agentCommand, {
          success: false,
          message: runningTaskMessage,
        }),
      );
      return;
    }

    activeAgentRun = deps
      .runAgentCommand(agentCommand)
      .then((result) => {
        emitCommandResult(command, result);
      })
      .finally(() => {
        activeAgentRun = null;
      });
  };

  const taskIdFor = (command: RunCollaborationCommand | RunCollaborationModeCommand) =>
    command.requestId?.trim() || command.input.requestId?.trim() || "";

  const emitCollaborationBusyResult = (command: RunCollaborationCommand | RunCollaborationModeCommand) => {
    deps.emitEvent({
      type: AgentRuntimeEventType.Error,
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
      type: AgentRuntimeResultType.TaskResult,
      requestId: command.requestId ?? null,
      taskId: taskIdFor(command),
      success: false,
      message: collaborationBusyMessage,
    });
  };

  const runCollaborationCommand = (command: RunCollaborationCommand | RunCollaborationModeCommand) => {
    if (activeCollaborationRun) {
      emitCollaborationBusyResult(command);
      return;
    }

    const run =
      command.type === AgentRuntimeCommandType.RunCollaborationMode
        ? deps.engine.collaboration.runMode(command.input)
        : deps.engine.collaboration.run(command.input);

    activeCollaborationRun = run
      .then((result) => {
        emitCommandResult(command, result);
        deps.emitResult({
          type: AgentRuntimeResultType.TaskResult,
          requestId: command.requestId ?? null,
          taskId: taskIdFor(command),
          success: true,
        });
      })
      .catch((error: unknown) => {
        const message = messageFromError(error);
        deps.emitEvent({
          type: AgentRuntimeEventType.Error,
          taskId: taskIdFor(command) || undefined,
          message,
        });
        deps.emitResult({
          type: AgentRuntimeResultType.TaskResult,
          requestId: command.requestId ?? null,
          taskId: taskIdFor(command),
          success: false,
          message,
        });
      })
      .finally(() => {
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

      case AgentTaskCommandType.ListAgentTools:
        emitCommandResult(command, await deps.engine.capabilities.listAgentTools(commandInputFrom(command)));
        return true;

      case AgentTaskCommandType.ListRuntimeModels:
        emitCommandResult(command, await deps.engine.capabilities.listRuntimeModels());
        return true;

      case AgentTaskCommandType.AnswerApproval:
        await deps.answerApproval(commandInputFrom(command));
        return true;
      case AgentTaskCommandType.AnswerQuestion:
        await deps.answerQuestion(commandInputFrom(command));
        return true;

      case AgentTaskCommandType.RunAgent:
        runAgentCommandWhenIdle(command, agentRunCommandFromRunAgent(command));
        return true;

      case AgentTaskCommandType.Chat:
        await handleChatCommand(command);
        return true;

      case AgentSessionCommandType.CreateSession:
        emitCommandError(command, "create_session 是 native session 内部初始化能力，不作为外部 runtime 命令暴露");
        return true;

      case AgentSessionCommandType.ReadSession:
        await emitCommandActionResult(command, () => deps.engine.session.admin.read(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.CompactAgentSession:
        await emitCommandActionResult(command, () => deps.engine.session.agent.compact(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.RebuildAgentSession:
        if (activeAgentRun) {
          emitCommandError(command, runningTaskMessage);
          return true;
        }
        await emitCommandActionResult(command, () => deps.engine.session.agent.rebuild(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.SummarizeSession:
        await emitCommandActionResult(command, () => deps.engine.session.admin.summarize(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.SummarizeAgentSession:
        await emitCommandActionResult(command, () => deps.engine.session.agent.summarize(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.MessageEdit:
        await emitCommandActionResult(command, () => deps.engine.session.admin.editMessage(commandInputFrom(command)));
        return true;

      case AgentSessionCommandType.MessageDelete:
        await emitCommandActionResult(command, () =>
          deps.engine.session.admin.deleteMessage(commandInputFrom(command)),
        );
        return true;

      case AgentSessionCommandType.MessageAppend:
        await emitCommandActionResult(command, () =>
          deps.engine.session.admin.appendMessages(commandInputFrom(command)),
        );
        return true;

      case AgentSessionCommandType.Rebuild:
        await emitCommandActionResult(command, () => deps.engine.session.admin.rebuild(commandInputFrom(command)));
        return true;

      case AgentRuntimeCommandType.ListCollaborationModes:
        emitCommandResult(command, await deps.engine.collaboration.listModes());
        return true;

      case AgentRuntimeCommandType.ListRuntimeSessions:
        await emitCommandActionResult(command, () => deps.engine.session.list(commandInputFrom(command)));
        return true;

      case AgentRuntimeCommandType.ReadRuntimeSession:
        await emitCommandActionResult(command, () => deps.engine.session.read(commandInputFrom(command)));
        return true;

      case AgentRuntimeCommandType.ReadRuntimeSessionDebug:
        await emitCommandActionResult(command, () => deps.engine.session.debug.read(commandInputFrom(command)));
        return true;

      case AgentRuntimeCommandType.ReadCollaborationTimeline:
        await emitCommandActionResult(command, () => deps.engine.collaboration.readTimeline(commandInputFrom(command)));
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
