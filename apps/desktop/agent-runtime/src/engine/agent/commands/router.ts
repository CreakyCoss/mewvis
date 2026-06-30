import { randomUUID } from "node:crypto";
import {
  AgentSessionCommandType,
  AgentResultType,
  AgentTaskCommandType,
  type AgentCommand,
  type ChatCommand,
  type ChatResult,
  type SendMessageCommand,
} from "../contracts/index.js";
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
  createPongResult,
  createShutdownAckResult,
  emitCommandError,
  writeTaskResult,
  type WriteAgentRuntimeJsonLine,
} from "./responses.js";

type AgentCommandRouterDeps = {
  callbacks?: Partial<AgentRuntimeCallbacks>;
  close: () => void;
  emit: EmitAgentEvent;
  writeJsonLine: WriteAgentRuntimeJsonLine;
};

const runningTaskMessage = "当前 Agent runtime 已有运行中的任务，无法启动新任务";
const runningTaskChatMessage = "当前 Agent runtime 已有运行中的任务，无法启动 chat";

const sendMessageRunsAgent = (command: SendMessageCommand) =>
  command.runtime?.mode === "agent" || Boolean(command.agent?.agentRoleId?.trim());

const chatRunCommandFromSendMessage = (command: SendMessageCommand): ChatRunCommand => ({
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

const agentRunCommandFromSendMessage = (command: SendMessageCommand): AgentRunCommand => ({
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

const runtimeCommandFromSendMessage = (command: SendMessageCommand) =>
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

const runChat = async (
  command: ChatRunCommand,
  errorCommand: AgentCommand,
  deps: Pick<AgentCommandRouterDeps, "emit" | "writeJsonLine">,
) => {
  try {
    deps.writeJsonLine(await handleChatCommand(command, deps.emit));
  } catch (error: unknown) {
    emitCommandError(errorCommand, deps.emit, messageFromError(error));
  }
};

const runAgentRun = async (
  command: AgentRunCommand,
  errorCommand: AgentCommand,
  deps: Pick<AgentCommandRouterDeps, "emit" | "writeJsonLine"> & {
    callbacks: AgentRuntimeCallbacks;
  },
) => {
  try {
    await handleAgentRunCommand(command, deps.emit, deps.callbacks);
    writeTaskResult(command, deps.writeJsonLine, { success: true });
  } catch (error: unknown) {
    const message = messageFromError(error);
    emitCommandError(errorCommand, deps.emit, message);
    writeTaskResult(command, deps.writeJsonLine, { success: false, message });
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
      writeTaskResult(command, deps.writeJsonLine, {
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

  const chatRunCommandFromChat = (command: ChatCommand): ChatRunCommand => ({
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

  const handle = async (command: AgentCommand): Promise<boolean> => {
    switch (command.type) {
      case AgentTaskCommandType.AnswerQuestion:
        userInput.handleAnswer(command);
        return true;

      case AgentTaskCommandType.Ping:
        deps.writeJsonLine(createPongResult(command));
        return true;

      case AgentTaskCommandType.Shutdown:
        deps.writeJsonLine(createShutdownAckResult(command));
        deps.close();
        return false;

      case AgentTaskCommandType.ListAgents:
        deps.writeJsonLine(createAgentDefinitionsResult(command));
        return true;

      case AgentSessionCommandType.CreateSession:
        try {
          deps.writeJsonLine(await createRuntimeSession(command));
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
          deps.writeJsonLine(await readRuntimeSession(command));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case AgentSessionCommandType.Compact:
        try {
          deps.writeJsonLine(await compactRuntimeSession(command, {
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
          deps.writeJsonLine(await rebuildRuntimeAgentSession(command, {
            callbacks,
            emit: () => {},
          }));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case AgentSessionCommandType.SummarizeSession:
        try {
          deps.writeJsonLine(await summarizeRuntimeSession(command));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case AgentSessionCommandType.MessageEdit:
        try {
          deps.writeJsonLine(await editRuntimeSessionMessage(command));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case AgentSessionCommandType.MessageDelete:
        try {
          deps.writeJsonLine(await deleteRuntimeSessionMessage(command));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case AgentSessionCommandType.MessageAppend:
        try {
          deps.writeJsonLine(await appendRuntimeSessionMessages(command));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case AgentSessionCommandType.Rebuild:
        try {
          deps.writeJsonLine(await rebuildRuntimeSession(command));
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
    callbacks,
    handle,
    waitForRunningTask,
  };
};

export type AgentCommandRouter = ReturnType<typeof createAgentCommandRouter>;
