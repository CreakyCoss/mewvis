import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import {
  BridgeCommandType,
  type BridgeCommand,
  type BridgeEvent,
} from "../engine/agent/contracts/protocol.js";
import {
  AgentRuntimeCommandType,
  type AgentRuntimeCommand,
} from "../protocol/index.js";

export type StdioBridgeReader = ReturnType<typeof createInterface>;

export const createStdioBridgeReader = (): StdioBridgeReader =>
  createInterface({ input });

export const writeJsonLine = (value: unknown) => {
  output.write(`${JSON.stringify(value)}\n`);
};

export const writeBridgeEvent = (event: BridgeEvent) => {
  writeJsonLine(event);
};

export const parseBridgeCommand = (line: string): BridgeCommand => {
  if (!line.trim()) {
    throw new Error("未收到 Agent runtime 命令");
  }

  const command = JSON.parse(line) as BridgeCommand;
  if (!Object.values(BridgeCommandType).includes(command.type)) {
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
    !Object.values(BridgeCommandType).includes(type as BridgeCommandType) &&
    !Object.values(AgentRuntimeCommandType).includes(type as AgentRuntimeCommandType)
  ) {
    throw new Error(`未知 Agent runtime 命令：${type}`);
  }

  return command;
};

export const readInitialBridgeCommand = async (
  reader: StdioBridgeReader,
): Promise<BridgeCommand> => {
  const iterator = reader[Symbol.asyncIterator]();
  const line = await iterator.next();

  if (line.done) {
    throw new Error("未收到 Agent runtime 命令");
  }

  return parseBridgeCommand(line.value);
};
