import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import {
  AgentCommandType,
  type AgentCommand,
} from "../protocol/agent.js";
import type { AgentEvent } from "../engine/agent/contracts/events.js";
import {
  AgentRuntimeCommandType,
  type AgentRuntimeCommand,
} from "../protocol/index.js";

export type StdioRuntimeReader = ReturnType<typeof createInterface>;

export const createStdioRuntimeReader = (): StdioRuntimeReader =>
  createInterface({ input });

export const writeJsonLine = (value: unknown) => {
  output.write(`${JSON.stringify(value)}\n`);
};

export const writeAgentEvent = (event: AgentEvent) => {
  writeJsonLine(event);
};

export const parseAgentCommand = (line: string): AgentCommand => {
  if (!line.trim()) {
    throw new Error("未收到 Agent runtime 命令");
  }

  const command = JSON.parse(line) as AgentCommand;
  if (!Object.values(AgentCommandType).includes(command.type)) {
    throw new Error(`未知 Agent runtime 命令：${(command as { type?: string }).type}`);
  }

  return command;
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

export const readInitialAgentCommand = async (
  reader: StdioRuntimeReader,
): Promise<AgentCommand> => {
  const iterator = reader[Symbol.asyncIterator]();
  const line = await iterator.next();

  if (line.done) {
    throw new Error("未收到 Agent runtime 命令");
  }

  return parseAgentCommand(line.value);
};
