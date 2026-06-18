import { randomUUID } from "node:crypto";
import {
  BridgeContextCommandType,
  BridgeTaskCommandType,
  type BridgeCommand,
  type ChatCommand,
  type ChatResult,
  type SendMessageCommand,
} from "../contracts/protocol.js";
import {
  executeChatCommand,
  executeAgentRunCommand,
} from "./execution.js";
import {
  appendBridgeSessionMessages,
  compactBridgeSession,
  createBridgeSession,
  deleteBridgeSessionMessage,
  editBridgeSessionMessage,
  readBridgeSession,
  rebuildBridgeSession,
} from "./session.js";
import type { AgentRunCommand, AskUser, EmitBridgeEvent, RuntimeChatCommand } from "../runtimes/types.js";
import { createBridgeQuestionManager } from "./questions.js";
import { messageFromError } from "../utils/error.js";
import {
  createAgentDefinitionsResult,
  createPongResult,
  createShutdownAckResult,
  emitCommandError,
  writeTaskResult,
  type WriteBridgeJsonLine,
} from "./responses.js";

type BridgeCommandHandlerDeps = {
  close: () => void;
  emit: EmitBridgeEvent;
  writeJsonLine: WriteBridgeJsonLine;
};

const runningTaskMessage = "当前 Agent bridge 已有运行中的任务，无法启动新任务";
const runningTaskChatMessage = "当前 Agent bridge 已有运行中的任务，无法启动 chat";

const sendMessageRunsAgent = (command: SendMessageCommand) =>
  command.runtime?.mode === "agent" || Boolean(command.agent?.agentRoleId?.trim());

const chatCommandFromSendMessage = (command: SendMessageCommand): RuntimeChatCommand => ({
  type: BridgeTaskCommandType.Chat,
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
  messages: command.input.messages ?? [],
});

const agentRunCommandFromSendMessage = (command: SendMessageCommand): AgentRunCommand => ({
  runtimeMode: "agent",
  requestId: command.requestId ?? null,
  agentId: command.agent?.agentId ?? null,
  taskId: command.runtime?.taskId?.trim() || command.requestId?.trim() || `bridge-task-${randomUUID()}`,
  workspacePath: command.session.workspacePath,
  sessionRootDir: command.session.sessionRootDir ?? null,
  agentRoleId: command.agent?.agentRoleId ?? null,
  userMessage: command.input.userMessage,
  systemPrompt: command.input.systemPrompt ?? null,
  requestContext: command.input.requestContext ?? null,
  runtimeInstruction: command.input.runtimeInstruction ?? null,
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
      command: chatCommandFromSendMessage(command),
    };

const handleChatCommand = async (
  command: RuntimeChatCommand,
  emit: EmitBridgeEvent,
): Promise<ChatResult> => {
  const result = await executeChatCommand(command, { emit });
  return {
    ...result,
    requestId: command.requestId ?? null,
  };
};

const handleAgentRunCommand = async (
  command: AgentRunCommand,
  emit: EmitBridgeEvent,
  askUser: AskUser,
) => {
  await executeAgentRunCommand(command, {
    askUser,
    emit,
  });
};

const runChat = async (
  command: RuntimeChatCommand,
  errorCommand: BridgeCommand,
  deps: Pick<BridgeCommandHandlerDeps, "emit" | "writeJsonLine">,
) => {
  try {
    deps.writeJsonLine(await handleChatCommand(command, deps.emit));
  } catch (error: unknown) {
    emitCommandError(errorCommand, deps.emit, messageFromError(error));
  }
};

const runAgentRun = async (
  command: AgentRunCommand,
  errorCommand: BridgeCommand,
  deps: Pick<BridgeCommandHandlerDeps, "emit" | "writeJsonLine"> & {
    askUser: AskUser;
  },
) => {
  try {
    await handleAgentRunCommand(command, deps.emit, deps.askUser);
    writeTaskResult(command, deps.writeJsonLine, { success: true });
  } catch (error: unknown) {
    const message = messageFromError(error);
    emitCommandError(errorCommand, deps.emit, message);
    writeTaskResult(command, deps.writeJsonLine, { success: false, message });
  }
};

export const createBridgeCommandRouter = (deps: BridgeCommandHandlerDeps) => {
  let runningTask: Promise<void> | null = null;
  const questions = createBridgeQuestionManager(deps.emit);

  const runAgentWhenIdle = (
    command: AgentRunCommand,
    errorCommand: BridgeCommand,
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
      askUser: questions.askUser,
    }).finally(() => {
      runningTask = null;
    });
  };

  const runChatWhenIdle = async (
    command: RuntimeChatCommand,
    errorCommand: BridgeCommand,
  ) => {
    if (runningTask) {
      emitCommandError(errorCommand, deps.emit, runningTaskChatMessage);
      return;
    }

    await runChat(command, errorCommand, deps);
  };

  const runtimeChatCommandFromChat = (command: ChatCommand): RuntimeChatCommand => ({
    type: BridgeTaskCommandType.Chat,
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
    messages: command.input.messages ?? [],
  });

  const handle = async (command: BridgeCommand): Promise<boolean> => {
    switch (command.type) {
      case BridgeTaskCommandType.AnswerQuestion:
        questions.handleAnswer(command);
        return true;

      case BridgeTaskCommandType.Ping:
        deps.writeJsonLine(createPongResult(command));
        return true;

      case BridgeTaskCommandType.Shutdown:
        deps.writeJsonLine(createShutdownAckResult(command));
        deps.close();
        return false;

      case BridgeTaskCommandType.ListAgents:
        deps.writeJsonLine(createAgentDefinitionsResult(command));
        return true;

      case BridgeContextCommandType.CreateSession:
        try {
          deps.writeJsonLine(await createBridgeSession(command));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case BridgeTaskCommandType.SendMessage:
        {
          const runtimeCommand = runtimeCommandFromSendMessage(command);
          if (runtimeCommand.mode === "agent") {
            runAgentWhenIdle(runtimeCommand.command, command);
          } else {
            await runChatWhenIdle(runtimeCommand.command, command);
          }
        }
        return true;

      case BridgeTaskCommandType.Chat:
        await runChatWhenIdle(runtimeChatCommandFromChat(command), command);
        return true;

      case BridgeContextCommandType.ReadSession:
        try {
          deps.writeJsonLine(await readBridgeSession(command));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case BridgeContextCommandType.Compact:
        try {
          deps.writeJsonLine(await compactBridgeSession(command));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case BridgeContextCommandType.MessageEdit:
        try {
          deps.writeJsonLine(await editBridgeSessionMessage(command));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case BridgeContextCommandType.MessageDelete:
        try {
          deps.writeJsonLine(await deleteBridgeSessionMessage(command));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case BridgeContextCommandType.MessageAppend:
        try {
          deps.writeJsonLine(await appendBridgeSessionMessages(command));
        } catch (error: unknown) {
          emitCommandError(command, deps.emit, messageFromError(error));
        }
        return true;

      case BridgeContextCommandType.Rebuild:
        try {
          deps.writeJsonLine(await rebuildBridgeSession(command));
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
    handle,
    waitForRunningTask,
  };
};
