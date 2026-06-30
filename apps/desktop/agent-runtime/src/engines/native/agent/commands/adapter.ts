import { randomUUID } from "node:crypto";
import type {
  ChatCommand,
  SendMessageCommand,
} from "../../../protocol/index.js";
import type {
  AgentRunCommand,
  ChatRunCommand,
} from "../runtimes/types.js";

const sendMessageRunsAgent = (command: SendMessageCommand) =>
  command.runtime?.mode === "agent" || Boolean(command.agent?.agentRoleId?.trim());

const chatRunCommandFromSendMessage = (
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

const agentRunCommandFromSendMessage = (
  command: SendMessageCommand,
): AgentRunCommand => ({
  runtimeMode: "agent",
  requestId: command.requestId ?? null,
  agentId: command.agent?.agentId ?? null,
  taskId: command.runtime?.taskId?.trim() ||
    command.requestId?.trim() ||
    `runtime-task-${randomUUID()}`,
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
