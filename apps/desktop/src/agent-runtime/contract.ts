import type { RuntimeModelConfig } from "@/features/llm-settings/model-catalog";

export type CodingAgentProviderConfig = {
  id: string;
  name: string;
  vendor: string;
  provider: string;
  apiKey?: string | null;
  baseUrl?: string | null;
};

export type CodingAgentModelConfig = RuntimeModelConfig;

export type AgentToolCategory = "file" | "search" | "shell" | "interaction" | "custom";
export type AgentToolRiskLevel = "low" | "medium" | "high";

export type BuiltInAgentToolName =
  | "read"
  | "bash"
  | "edit"
  | "write"
  | "grep"
  | "find"
  | "ls";

export type NovelClawAgentToolName = "ask_user";
export type KnownAgentToolName = BuiltInAgentToolName | NovelClawAgentToolName;
export type AgentToolName = KnownAgentToolName | (string & {});

export type AgentToolDefinition = {
  name: AgentToolName;
  label: string;
  description: string;
  category: AgentToolCategory;
  riskLevel: AgentToolRiskLevel;
  source: "agent-runtime" | "novel-claw" | "extension";
  enabledByDefault: boolean;
};

export const AGENT_TOOL_DEFINITIONS = [
  {
    name: "read",
    label: "读取",
    description: "读取工作区文件内容",
    category: "file",
    riskLevel: "low",
    source: "agent-runtime",
    enabledByDefault: true,
  },
  {
    name: "edit",
    label: "编辑",
    description: "编辑已有文件",
    category: "file",
    riskLevel: "medium",
    source: "agent-runtime",
    enabledByDefault: true,
  },
  {
    name: "write",
    label: "写入",
    description: "写入或创建文件",
    category: "file",
    riskLevel: "medium",
    source: "agent-runtime",
    enabledByDefault: true,
  },
  {
    name: "ls",
    label: "列目录",
    description: "列出目录内容",
    category: "search",
    riskLevel: "low",
    source: "agent-runtime",
    enabledByDefault: true,
  },
  {
    name: "find",
    label: "查找文件",
    description: "按文件名查找工作区文件",
    category: "search",
    riskLevel: "low",
    source: "agent-runtime",
    enabledByDefault: true,
  },
  {
    name: "grep",
    label: "搜索文本",
    description: "在工作区文件中搜索文本",
    category: "search",
    riskLevel: "low",
    source: "agent-runtime",
    enabledByDefault: true,
  },
  {
    name: "ask_user",
    label: "询问用户",
    description: "在缺少必要信息时向用户提问",
    category: "interaction",
    riskLevel: "low",
    source: "novel-claw",
    enabledByDefault: true,
  },
  {
    name: "bash",
    label: "Shell",
    description: "执行工作区 shell 命令",
    category: "shell",
    riskLevel: "high",
    source: "agent-runtime",
    enabledByDefault: false,
  },
] as const satisfies readonly AgentToolDefinition[];

export const DEFAULT_ALLOWED_AGENT_TOOLS = AGENT_TOOL_DEFINITIONS
  .filter((tool) => tool.enabledByDefault)
  .map((tool) => tool.name);

export const getAgentToolDefinition = (name: string): AgentToolDefinition | undefined =>
  AGENT_TOOL_DEFINITIONS.find((tool) => tool.name === name);

export const normalizeAllowedAgentTools = (
  tools: readonly AgentToolName[] | undefined,
): AgentToolName[] => {
  if (!tools) {
    return [...DEFAULT_ALLOWED_AGENT_TOOLS];
  }

  return [...new Set(tools)];
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

export type CodingAgentTaskInput = {
  workspacePath: string;
  prompt: string;
  provider: CodingAgentProviderConfig;
  model: CodingAgentModelConfig;
  allowedTools?: AgentToolName[];
  enabledSkills?: string[];
};

export type CodingAgentTask = {
  taskId: string;
};
