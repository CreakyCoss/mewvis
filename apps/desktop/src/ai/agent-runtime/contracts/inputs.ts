import type {
  RuntimeAgentToolName,
  RuntimeModelInput,
} from "@/ai/runtime-protocol";

export type AgentRuntimeAgentTaskInput = {
  agentId?: string | null;
  workspacePath: string;
  sessionRootDir?: string | null;
  agentRoleId?: string | null;
  userMessage: string;
  systemPrompt?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
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
  workspacePath?: string | null;
  sessionRootDir?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  systemPrompt: string;
  userMessage?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  messages?: AgentRuntimeChatMessage[];
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
  bridgeSession?: {
    sessionRootDir: string;
    userMessageRecordId?: string | null;
    requestContextRecordId?: string | null;
    runtimeInstructionRecordId?: string | null;
    assistantMessageRecordId?: string | null;
  } | null;
};
