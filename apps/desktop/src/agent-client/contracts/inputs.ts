import type {
  AgentRunInput,
  ChatInput,
  ChatResult,
  CollaborationModeRunInput,
  CollaborationRunInput,
  TaskResult,
} from "@agent-runtime/engines/protocol";
import type { AgentClientChatOutputHandlers } from "./events";

type AgentClientResourceInput = {
  allowedTools?: string[];
  enabledSkills?: string[];
};

export type AgentClientAgentInput = Pick<
  AgentRunInput,
  | "workspacePath"
  | "sessionRootDir"
  | "agentRoleId"
  | "userMessage"
  | "systemPrompt"
  | "requestContext"
  | "runtimeInstruction"
  | "bootstrapInstruction"
  | "runtimeModel"
> &
  AgentClientResourceInput;

export type AgentClientAgentTask = Pick<TaskResult, "taskId">;

export type AgentClientCollaborationInput = Omit<CollaborationRunInput, "requestId" | "resources"> &
  AgentClientResourceInput;

export type AgentClientCollaborationModeInput = Omit<CollaborationModeRunInput, "requestId" | "resources"> &
  AgentClientResourceInput;

export type AgentClientChatInput = Pick<
  ChatInput,
  | "workspacePath"
  | "sessionRootDir"
  | "streamId"
  | "stream"
  | "runtimeModel"
  | "systemPrompt"
  | "userMessage"
  | "requestContext"
  | "runtimeInstruction"
  | "bootstrapInstruction"
> &
  AgentClientChatOutputHandlers & {
    messages?: ChatInput["messages"];
  };

export type AgentClientChatResult = Omit<ChatResult, "type" | "requestId">;
