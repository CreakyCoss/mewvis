import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { AgentCommandType, AgentRuntimeCommandType, type AgentRuntimeCommand } from "../engines/protocol/index.js";

export type StdioRuntimeReader = ReturnType<typeof createInterface>;

export const createStdioRuntimeReader = (): StdioRuntimeReader => createInterface({ input });

export const writeJsonLine = (value: unknown) => {
  output.write(`${JSON.stringify(value)}\n`);
};

export const writeAgentEvent = (event: unknown) => {
  writeJsonLine(event);
};

export const parseAgentRuntimeCommand = (line: string): AgentRuntimeCommand => {
  if (!line.trim()) {
    throw new Error("未收到 Agent runtime 命令");
  }

  const command = JSON.parse(line) as AgentRuntimeCommand;
  const type = (command as { type?: string }).type;
  if (
    !Object.values(AgentCommandType).includes(type as AgentCommandType) &&
    !Object.values(AgentRuntimeCommandType).includes(type as AgentRuntimeCommandType)
  ) {
    throw new Error(`未知 Agent runtime 命令：${type}`);
  }

  return command;
};
