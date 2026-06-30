import { randomUUID } from "node:crypto";
import {
  AgentSessionCommandType,
  AgentResultType,
  AgentTaskCommandType,
  type AnswerQuestionCommand,
  type AgentCommand,
  type ChatCommand,
  type ChatResult,
  type SendMessageCommand,
} from "../../../protocol/index.js";
import {
  executeChatCommand,
  executeAgentRunCommand,
} from "./execution.js";
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
} from "../session/index.js";
import type {
  AgentRunCommand,
  AgentRuntimeCallbacks,
  EmitAgentEvent,
  ChatRunCommand,
} from "../runtimes/types.js";
import { createUserInputManager } from "./user-input.js";
import { messageFromError } from "../../error.js";
import {
  createAgentDefinitionsResult,
  createAgentToolsResult,
  createPongResult,
  createRuntimeModelsResult,
  createShutdownAckResult,
  emitCommandError,
  emitTaskResult,
  type EmitAgentRuntimeResult,
} from "./responses.js";

type AgentCommandRouterDeps = {
  callbacks?: Partial<AgentRuntimeCallbacks>;
  close: () => void;
  emit: EmitAgentEvent;
  emitResult: EmitAgentRuntimeResult;
};

const runningTaskMessage = "当前 Agent runtime 已有运行中的任务，无法启动新任务";
const runningTaskChatMessage = "当前 Agent runtime 已有运行中的任务，无法启动 chat";

const sendMessageRunsAgent = (command: SendMessageCommand) =>
  command.runtime?.mode === "agent" || Boolean(command.agent?.agentRoleId?.trim());

export const chatRunCommandFromSendMessage = (
  command: SendMessageCommand,
): ChatRunCommand => ({
  type: "chat",
  requestId: command.requestId ?? null,
  agentId: command.agent?.agentId ?? null,
  workspacePath: command.session.workspacePath,
  sessionRootDir: command.session.sessionRootDir ?? null,
  streamId: command.runtime?.streamId ?? null,
  stream: command.runtime?.stream,
  runtimeModel: command.runtime?.model ?? null,
  systemPrompt: command.input.systemPrompt ?? "",
  userMessage: command.input.userMessage,
  requestContext: command.input.requestContext ?? null,
  runtimeInstruction: command.input.runtimeInstruction ?? null,
  bootstrapInstruction: command.input.bootstrapInstruction ?? null,
  messages: command.input.messages ?? [],
});

export const agentRunCommandFromSendMessage = (
  command: SendMessageCommand,
): AgentRunCommand => ({
  runtimeMode: "agent",
  requestId: command.requestId ?? null,
  agentId: command.agent?.agentId ?? null,
  taskId: command.runtime?.taskId?.trim() || command.requestId?.trim() || `runtime-task-${randomUUID()}`,
  workspacePath: command.session.workspacePath,
  sessionRootDir: command.session.sessionRootDir ?? null,
  agentRoleId: command.agent?.agentRoleId ?? null,
  userMessage: command.input.userMessage,
  systemPrompt: command.input.systemPrompt ?? null,
  requestContext: command.input.requestContext ?? null,
  runtimeInstruction: command.input.runtimeInstruction ?? null,
  bootstrapInstruction: command.input.bootstrapInstruction ?? null,
  runtimeModel: command.runtime?.model ?? null,
  resources: command.runtime?.resources ?? null,
});

export const runtimeCommandFromSendMessage = (command: SendMessageCommand) =>
  sendMessageRunsAgent(command)
    ? {
      mode: "agent" as const,
      command: agentRunCommandFromSendMessage(command),
    }
    : {
      mode: "chat" as const,
      command: chatRunCommandFromSendMessage(command),
    };

const handleChatCommand = async (
  command: ChatRunCommand,
  emit: EmitAgentEvent,
): Promise<ChatResult> => {
  const result = await executeChatCommand(command, { emit });
  return {
    type: AgentResultType.ChatResult,
    ...result,
    requestId: command.requestId ?? null,
  };
};

const handleAgentRunCommand = async (
  command: AgentRunCommand,
  emit: EmitAgentEvent,
  callbacks: AgentRuntimeCallbacks,
) => {
  await executeAgentRunCommand(command, {
    callbacks,
    emit,
  });
};

export const chatRunCommandFromChat = (command: ChatCommand): ChatRunCommand => ({
  type: "chat",
  requestId: command.requestId ?? null,
  agentId: command.agent?.agentId ?? null,
  workspacePath: command.session?.workspacePath ?? null,
  sessionRootDir: command.session?.sessionRootDir ?? null,
  streamId: command.runtime?.streamId ?? null,
  stream: command.runtime?.stream,
  runtimeModel: command.runtime?.model ?? null,
  systemPrompt: command.input.systemPrompt ?? "",
  userMessage: command.input.userMessage ?? null,
  requestContext: command.input.requestContext ?? null,
  runtimeInstruction: command.input.runtimeInstruction ?? null,
  bootstrapInstruction: command.input.bootstrapInstruction ?? null,
  messages: command.input.messages ?? [],
});

const runChat = async (
  command: ChatRunCommand,
  errorCommand: AgentCommand,
  deps: Pick<AgentCommandRouterDeps, "emit" | "emitResult">,
) => {
  try {
    deps.emitResult(await handleChatCommand(command, deps.emit));
  } catch (error: unknown) {
    emitCommandError(errorCommand, deps.emit, messageFromError(error));
  }
};

const runAgentRun = async (
  command: AgentRunCommand,
  errorCommand: AgentCommand,
  deps: Pick<AgentCommandRouterDeps, "emit" | "emitResult"> & {
    callbacks: AgentRuntimeCallbacks;
  },
) => {
  try {
    await handleAgentRunCommand(command, deps.emit, deps.callbacks);
    emitTaskResult(command, deps.emitResult, { success: true });
  } catch (error: unknown) {
    const message = messageFromError(error);
    emitCommandError(errorCommand, deps.emit, message);
    emitTaskResult(command, deps.emitResult, { success: false, message });
  }
};

export const createAgentCommandRouter = (deps: AgentCommandRouterDeps) => {
  let runningTask: Promise<void> | null = null;
  const userInput = createUserInputManager(deps.emit);
  const callbacks: AgentRuntimeCallbacks = {
    requestUserInput: deps.callbacks?.requestUserInput ??
      userInput.callbacks.requestUserInput,
  };

  const runAgentWhenIdle = (
    command: AgentRunCommand,
    errorCommand: AgentCommand,
  ) => {
    if (runningTask) {
      emitCommandError(errorCommand, deps.emit, runningTaskMessage);
      emitTaskResult(command, deps.emitResult, {
        success: false,
        message: runningTaskMessage,
      });
      return;
    }

    runningTask = runAgentRun(command, errorCommand, {
      ...deps,
      callbacks,
    }).finally(() => {
      runningTask = null;
    });
  };

  const runChatWhenIdle = async (
    command: ChatRunCommand,
    errorCommand: AgentCommand,
  ) => {
    if (runningTask) {
      emitCommandError(errorCommand, deps.emit, runningTaskChatMessage);
      return;
    }

    await runChat(command, errorCommand, deps);
  };

  const answerQuestion = (command: AnswerQuestionCommand) => {
    userInput.handleAnswer(command);
  };

  const handle = async (command: AgentCommand): Promise<boolean> => {
    switch (command.type) {
      case AgentTaskCommandType.AnswerQuestion:
        answerQuestion(command);
        return true;

      case AgentTaskCommandType.Ping:
        deps.emitResult(createPongResult(command));
        return true;

      case AgentTaskCommandType.Shutdown:
        deps.emitResult(createShutdownAckResult(command));
        deps.close();
        return false;

      case AgentTaskCommandType.ListAgents:
        deps.emitResult(createAgentDefinitionsResult(command));
        return true;

      case AgentTaskCommandType.ListAgentTools:
        deps.emitResult(createAgentToolsResult(command));
        return true;

      case AgentTaskCommandType.ListRuntimeModels:
        deps.emitResult(createRuntimeModelsResult(command));
        return true;

      case AgentSessionCommandType.CreateSession:
        try {
          deps.emitResult(await createRuntimeSession(command));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case AgentTaskCommandType.SendMessage:
        {
          const runtimeCommand = runtimeCommandFromSendMessage(command);
          if (runtimeCommand.mode === "agent") {
            runAgentWhenIdle(runtimeCommand.command, command);
          } else {
            await runChatWhenIdle(runtimeCommand.command, command);
          }
        }
        return true;

      case AgentTaskCommandType.Chat:
        await runChatWhenIdle(chatRunCommandFromChat(command), command);
        return true;

      case AgentSessionCommandType.ReadSession:
        try {
          deps.emitResult(await readRuntimeSession(command));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case AgentSessionCommandType.Compact:
        try {
          deps.emitResult(await compactRuntimeSession(command, {
            callbacks,
            emit: deps.emit,
          }));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case AgentSessionCommandType.RebuildAgentSession:
        if (runningTask) {
          emitCommandError(command, deps.emit, runningTaskMessage);
          return true;
        }
        try {
          deps.emitResult(await rebuildRuntimeAgentSession(command, {
            callbacks,
            emit: () => {},
          }));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case AgentSessionCommandType.SummarizeSession:
        try {
          deps.emitResult(await summarizeRuntimeSession(command));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case AgentSessionCommandType.MessageEdit:
        try {
          deps.emitResult(await editRuntimeSessionMessage(command));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case AgentSessionCommandType.MessageDelete:
        try {
          deps.emitResult(await deleteRuntimeSessionMessage(command));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case AgentSessionCommandType.MessageAppend:
        try {
          deps.emitResult(await appendRuntimeSessionMessages(command));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case AgentSessionCommandType.Rebuild:
        try {
          deps.emitResult(await rebuildRuntimeSession(command));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      default:
        return true;
    }
  };

  const waitForRunningTask = async () => {
    if (runningTask) {
      await runningTask.catch(() => undefined);
    }
  };

  return {
    answerQuestion,
    callbacks,
    handle,
    waitForRunningTask,
  };
};

export type AgentCommandRouter = ReturnType<typeof createAgentCommandRouter>;
