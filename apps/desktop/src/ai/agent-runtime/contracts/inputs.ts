import type {
  RuntimeAgentToolName,
  RuntimeModelInput,
} from "@/ai/runtime-protocol";

export type AgentRuntimeAgentTaskInput = {
  agentId?: string | null;
  workspacePath: string;
  chatSessionId?: string | null;
  prompt: string;
  bootstrapContext?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  allowedTools?: RuntimeAgentToolName[];
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
  runtimeModel?: RuntimeModelInput | null;
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
