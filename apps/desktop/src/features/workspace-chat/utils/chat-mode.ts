import type { AgentToolName } from "@/ai/agent-runtime/contracts";
import type { ChatExecutionMode, ChatMode } from "../page-types";

const CHAT_AGENT_BLOCKED_TOOL_NAMES = new Set([
  "apply_patch",
  "bash",
  "edit",
  "exec",
  "run_command",
  "shell",
  "terminal",
  "write",
]);

export const isAgentTaskMode = (
  mode: ChatMode,
  chatExecutionMode: ChatExecutionMode,
) => mode === "agent" || (mode === "chat" && chatExecutionMode === "agent");

export const isChatAgentRestrictedTool = (toolName: AgentToolName) => {
  const normalizedName = toolName.trim().toLowerCase();
  return CHAT_AGENT_BLOCKED_TOOL_NAMES.has(normalizedName) ||
    normalizedName.includes("bash") ||
    normalizedName.includes("shell") ||
    normalizedName.includes("terminal") ||
    normalizedName.includes("exec") ||
    normalizedName.includes("write") ||
    normalizedName.includes("edit");
};

export const filterChatAgentAllowedTools = (
  tools: readonly AgentToolName[],
) => tools.filter((tool) => !isChatAgentRestrictedTool(tool));
