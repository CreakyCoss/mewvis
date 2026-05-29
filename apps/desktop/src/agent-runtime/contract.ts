import {
  AGENT_TOOL_DEFINITIONS as BRIDGE_AGENT_TOOL_DEFINITIONS,
  DEFAULT_ALLOWED_AGENT_TOOLS as BRIDGE_DEFAULT_ALLOWED_AGENT_TOOLS,
  normalizeAllowedAgentTools as normalizeBridgeAllowedAgentTools,
} from "@agent-bridge/contracts/tools";

export type AgentToolName = string;

export type AgentToolDefinition = Readonly<{
  name: AgentToolName;
  label: string;
  description: string;
  enabledByDefault: boolean;
}>;

type AgentToolDefinitions = readonly AgentToolDefinition[];

type BridgeAgentToolDefinition = (typeof BRIDGE_AGENT_TOOL_DEFINITIONS)[number];

const toAgentRuntimeToolDefinition = (tool: BridgeAgentToolDefinition): AgentToolDefinition =>
  Object.freeze({
    name: tool.name,
    label: tool.label,
    description: tool.description,
    enabledByDefault: tool.enabledByDefault,
  } satisfies AgentToolDefinition);

export const AGENT_TOOL_DEFINITIONS: AgentToolDefinitions = Object.freeze(
  BRIDGE_AGENT_TOOL_DEFINITIONS.map(toAgentRuntimeToolDefinition),
);

export const DEFAULT_ALLOWED_AGENT_TOOLS: readonly AgentToolName[] = Object.freeze([
  ...BRIDGE_DEFAULT_ALLOWED_AGENT_TOOLS,
]);

export const normalizeAllowedAgentTools = (
  tools: readonly AgentToolName[] | undefined,
): AgentToolName[] => normalizeBridgeAllowedAgentTools(tools);

export type AgentRuntimeProviderConfig = {
  id: string;
  name: string;
  vendor: string;
  provider: string;
  apiKey?: string | null;
  baseUrl?: string | null;
};

export type AgentRuntimeModelConfig = {
  id: string;
  modelId: string;
  modelName: string;
  baseUrl?: string;
  reasoning?: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  input?: Array<"text" | "image">;
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow?: number;
  maxTokens?: number;
  headers?: Record<string, string>;
  compat?: unknown;
};

export type CodingAgentQuestionInput = {
  type: "text" | "select";
  label?: string;
  options?: Array<{
    value: string;
    label: string;
    description?: string;
  }>;
  selected?: string;
};

export type CodingAgentEvent =
  | { type: "started"; taskId: string }
  | {
    type: "question";
    taskId: string;
    questionId: string;
    question: string;
    context?: string | null;
    input?: CodingAgentQuestionInput;
  }
  | { type: "question_answered"; taskId: string; questionId: string; answer: string }
  | { type: "replace_text"; taskId: string; text: string }
  | { type: "text_delta"; taskId: string; delta: string }
  | { type: "thinking_delta"; taskId: string; delta: string }
  | { type: "thinking_end"; taskId: string; content: string }
  | { type: "tool_start"; taskId: string; toolName: string; args: unknown }
  | { type: "tool_update"; taskId: string; toolName: string; partialResult: unknown }
  | { type: "tool_end"; taskId: string; toolName: string; isError: boolean; result: unknown }
  | { type: "done"; taskId: string; text: string }
  | { type: "stderr"; taskId: string; message: string }
  | { type: "exit"; taskId: string; success: boolean; code: number | null }
  | { type: "error"; taskId?: string; message: string; raw?: string };

export type CodingAgentDeltaEvent = Extract<
  CodingAgentEvent,
  { type: "text_delta" | "thinking_delta" }
>;

export type AgentRuntimeChatEvent = Omit<CodingAgentDeltaEvent, "taskId"> & {
  streamId: string;
};

export type CodingAgentTaskInput = {
  bridgeAgentId?: string | null;
  workspacePath: string;
  prompt: string;
  provider: AgentRuntimeProviderConfig;
  model: AgentRuntimeModelConfig;
  allowedTools?: AgentToolName[];
  enabledSkills?: string[];
};

export type CodingAgentTask = {
  taskId: string;
};

export type AgentRuntimeChatMessage = {
  role: string;
  content: string;
};

export type AgentRuntimeChatInput = {
  type: "chat";
  bridgeAgentId?: string | null;
  provider: AgentRuntimeProviderConfig;
  model: AgentRuntimeModelConfig;
  systemPrompt: string;
  messages: AgentRuntimeChatMessage[];
  stream?: boolean;
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

export type AgentRuntimeAgentInput = CodingAgentTaskInput & {
  type: "agent";
};

export type AgentRuntimeChatResult = {
  text: string;
  thinking?: string | null;
};
