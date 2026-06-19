import type {
  RuntimeAgentToolName,
  RuntimeModelInput,
} from "@/agent-client/protocol";
import type { AgentClientSession } from "./session";

export type AgentClientAgentTaskInput = {
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

export type AgentClientAgentTask = {
  taskId: string;
};

export type AgentClientChatMessage = {
  role: string;
  content: string;
};

export type AgentClientChatInput = {
  type: "chat";
  agentId?: string | null;
  workspacePath?: string | null;
  sessionRootDir?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  systemPrompt: string;
  userMessage?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  messages?: AgentClientChatMessage[];
  stream?: boolean;
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

export type AgentClientAgentInput = AgentClientAgentTaskInput & {
  type: "agent";
};

export type AgentClientChatResult = {
  text: string;
  thinking?: string | null;
  agentSession?: AgentClientSession | null;
};
