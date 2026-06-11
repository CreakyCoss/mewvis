import type { AgentRuntimeModelInput } from "./config";
import type { AgentToolName } from "./tools";

export type AgentRuntimeAgentTaskInput = {
  agentId?: string | null;
  workspacePath: string;
  chatSessionId?: string | null;
  prompt: string;
  bootstrapContext?: string | null;
  runtimeModel?: AgentRuntimeModelInput | null;
  allowedTools?: AgentToolName[];
  enabledSkills?: string[];
};

export type AgentRuntimeAgentTask = {
  taskId: string;
};

export type AgentRuntimeChatMessage = {
  role: string;
  content: string;
};

export type AgentRuntimeChatInput = {
  type: "chat";
  agentId?: string | null;
  runtimeModel?: AgentRuntimeModelInput | null;
  systemPrompt: string;
  messages: AgentRuntimeChatMessage[];
  stream?: boolean;
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

export type AgentRuntimeAgentInput = AgentRuntimeAgentTaskInput & {
  type: "agent";
};

export type AgentRuntimeChatResult = {
  text: string;
  thinking?: string | null;
};
