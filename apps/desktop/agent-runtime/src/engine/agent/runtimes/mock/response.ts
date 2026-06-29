import type {
  ChatRunCommand,
  RuntimeAgentCommand,
} from "../types.js";
import {
  allowedRuntimeTools,
  enabledRuntimeSkillNames,
} from "../resources.js";

const compact = (value: string, maxLength = 180) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
};

export const chunkText = (text: string, chunkSize = 18): string[] => {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize));
  }
  return chunks;
};

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const createMockChatText = (command: ChatRunCommand) => {
  const latestUserMessage = [...command.messages]
    .reverse()
    .find((message) => message.role === "user");
  const summary = latestUserMessage?.content
    ? compact(latestUserMessage.content)
    : "没有收到用户消息";
  const systemPromptSummary = command.systemPrompt?.trim()
    ? compact(command.systemPrompt)
    : "无";
  const requestContextSummary = command.requestContext?.trim()
    ? compact(command.requestContext)
    : "无";

  return [
    "这是 Mock agent 的模拟回复。",
    "",
    `系统提示词：${systemPromptSummary}`,
    `请求上下文：${requestContextSummary}`,
    `收到的最后一条用户消息：${summary}`,
    "",
    "当前没有调用真实模型，也不会读写工作区。这个回复用于验证前端、Tauri、agent-runtime 的链路是否通畅。",
  ].join("\n");
};

export const createMockAgentText = (command: RuntimeAgentCommand) => {
  const allowedTools = allowedRuntimeTools(command);
  const enabledSkillNames = enabledRuntimeSkillNames(command);
  const enabledTools = allowedTools?.length
    ? allowedTools.join(", ")
    : "未传入工具列表";
  const activeSkills = enabledSkillNames.length
    ? enabledSkillNames.join(", ")
    : "不使用技能";
  const bootstrapSummary = command.sessionBootstrapContext?.trim()
    ? compact(command.sessionBootstrapContext)
    : "无";
  const bootstrapInstructionSummary = command.bootstrapInstruction?.trim()
    ? compact(command.bootstrapInstruction)
    : "无";
  const systemPromptSummary = command.systemPrompt?.trim()
    ? compact(command.systemPrompt)
    : "无";
  const requestContextSummary = command.requestContext?.trim()
    ? compact(command.requestContext)
    : "无";

  return [
    "Mock agent 已完成模拟任务。",
    "",
    `工作区：${command.workspacePath}`,
    `系统提示词：${systemPromptSummary}`,
    `用户消息：${compact(command.userMessage)}`,
    `请求上下文：${requestContextSummary}`,
    `任务摘要：${compact(command.agentTaskPrompt)}`,
    `Bootstrap指令：${bootstrapInstructionSummary}`,
    `Bootstrap摘要：${bootstrapSummary}`,
    `允许工具：${enabledTools}`,
    `当前技能：${activeSkills}`,
    "",
    "这是本地生成的结果，不会启动真实 coding agent，也不会修改文件。",
  ].join("\n");
};
