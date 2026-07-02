export type AgentToolDefinition = Readonly<{
  name: string;
  label: string;
  description: string;
  enabledByDefault: boolean;
}>;

export const AGENT_TOOL_DEFINITIONS = Object.freeze([
  {
    name: "read",
    label: "读取",
    description: "读取工作区文件内容",
    enabledByDefault: true,
  },
  {
    name: "edit",
    label: "编辑",
    description: "编辑已有文件",
    enabledByDefault: true,
  },
  {
    name: "write",
    label: "写入",
    description: "写入或创建文件",
    enabledByDefault: true,
  },
  {
    name: "ls",
    label: "列目录",
    description: "列出目录内容",
    enabledByDefault: true,
  },
  {
    name: "find",
    label: "查找文件",
    description: "按文件名查找工作区文件",
    enabledByDefault: true,
  },
  {
    name: "grep",
    label: "搜索文本",
    description: "在工作区文件中搜索文本",
    enabledByDefault: true,
  },
  {
    name: "ask_user",
    label: "询问用户",
    description: "在缺少必要信息时向用户提问",
    enabledByDefault: true,
  },
  {
    name: "bash",
    label: "Shell",
    description: "执行工作区 shell 命令",
    enabledByDefault: false,
  },
] as const satisfies readonly AgentToolDefinition[]);

export type KnownAgentToolName = (typeof AGENT_TOOL_DEFINITIONS)[number]["name"];
export type AgentToolName = KnownAgentToolName | (string & {});

export const DEFAULT_ALLOWED_AGENT_TOOLS: readonly AgentToolName[] = Object.freeze(
  AGENT_TOOL_DEFINITIONS.filter((tool) => tool.enabledByDefault).map((tool) => tool.name),
);

export const normalizeAllowedAgentTools = (
  tools: readonly string[] | undefined,
): AgentToolName[] => {
  if (!tools) {
    return [...DEFAULT_ALLOWED_AGENT_TOOLS];
  }

  return [...new Set(tools)] as AgentToolName[];
};
