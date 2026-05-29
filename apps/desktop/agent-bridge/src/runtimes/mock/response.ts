import type { ChatCommand, StartTaskCommand } from "../../contracts/protocol.js";

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

export const createMockChatText = (command: ChatCommand) => {
  const latestUserMessage = [...command.messages]
    .reverse()
    .find((message) => message.role === "user");
  const summary = latestUserMessage?.content
    ? compact(latestUserMessage.content)
    : "没有收到用户消息";

  return [
    "这是 Mock agent 的模拟回复。",
    "",
    `收到的最后一条用户消息：${summary}`,
    "",
    "当前没有调用真实模型，也不会读写工作区。这个回复用于验证前端、Tauri、agent-bridge 的链路是否通畅。",
  ].join("\n");
};

export const createMockAgentText = (command: StartTaskCommand) => {
  const enabledTools = command.allowedTools?.length
    ? command.allowedTools.join(", ")
    : "未传入工具列表";
  const enabledSkills = command.enabledSkills?.length
    ? command.enabledSkills.join(", ")
    : "未启用技能";

  return [
    "Mock agent 已完成模拟任务。",
    "",
    `工作区：${command.workspacePath}`,
    `任务摘要：${compact(command.prompt)}`,
    `允许工具：${enabledTools}`,
    `启用技能：${enabledSkills}`,
    "",
    "这是本地生成的结果，不会启动真实 coding agent，也不会修改文件。",
  ].join("\n");
};
