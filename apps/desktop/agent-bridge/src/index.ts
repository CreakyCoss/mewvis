import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";

type ProviderInput = {
  id: string;
  name: string;
  vendor: string;
  provider: string;
  apiKey?: string | null;
  baseUrl?: string | null;
};

type ModelInput = {
  id: string;
  modelId: string;
  modelName: string;
};

type StartTaskCommand = {
  type: "start_task";
  taskId: string;
  workspacePath: string;
  prompt: string;
  provider: ProviderInput;
  model: ModelInput;
  allowedTools?: string[];
};

type BridgeCommand = StartTaskCommand;

type BridgeEvent =
  | { type: "started"; taskId: string }
  | { type: "text_delta"; taskId: string; delta: string }
  | { type: "thinking_delta"; taskId: string; delta: string }
  | { type: "thinking_end"; taskId: string; content: string }
  | { type: "tool_start"; taskId: string; toolName: string; args: unknown }
  | { type: "tool_update"; taskId: string; toolName: string; partialResult: unknown }
  | { type: "tool_end"; taskId: string; toolName: string; isError: boolean; result: unknown }
  | { type: "done"; taskId: string; text: string }
  | { type: "error"; taskId?: string; message: string };

const writeEvent = (event: BridgeEvent) => {
  output.write(`${JSON.stringify(event)}\n`);
};

const apiForProvider = (provider: string): Api => {
  if (provider === "anthropic") {
    return "anthropic-messages";
  }

  if (provider === "google") {
    return "google-generative-ai";
  }

  return "openai-completions";
};

const createRuntimeModel = (
  provider: ProviderInput,
  selectedModel: ModelInput,
): Model<Api> => {
  return {
    id: selectedModel.modelId,
    name: selectedModel.modelName || selectedModel.modelId,
    api: apiForProvider(provider.provider),
    provider: provider.vendor || provider.provider,
    baseUrl: provider.baseUrl ?? "",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 128000,
    maxTokens: 8192,
  };
};

const runTask = async (command: StartTaskCommand) => {
  const apiKey = command.provider.apiKey?.trim();
  if (!apiKey) {
    throw new Error(`${command.provider.name} 未配置 API Key`);
  }

  const model = createRuntimeModel(command.provider, command.model);
  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey(model.provider, apiKey);

  const { session } = await createAgentSession({
    cwd: command.workspacePath,
    authStorage,
    modelRegistry: ModelRegistry.inMemory(authStorage),
    sessionManager: SessionManager.inMemory(command.workspacePath),
    model,
    tools: command.allowedTools ?? ["read", "edit", "write"],
  });

  let assistantText = "";
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_update") {
      if (event.assistantMessageEvent.type === "text_delta") {
        assistantText += event.assistantMessageEvent.delta;
        writeEvent({
          type: "text_delta",
          taskId: command.taskId,
          delta: event.assistantMessageEvent.delta,
        });
        return;
      }

      if (event.assistantMessageEvent.type === "thinking_delta") {
        writeEvent({
          type: "thinking_delta",
          taskId: command.taskId,
          delta: event.assistantMessageEvent.delta,
        });
        return;
      }

      if (event.assistantMessageEvent.type === "thinking_end") {
        writeEvent({
          type: "thinking_end",
          taskId: command.taskId,
          content: event.assistantMessageEvent.content,
        });
        return;
      }
    }

    if (event.type === "message_end") {
      const content = "content" in event.message && Array.isArray(event.message.content)
        ? event.message.content
        : [];
      const text = content
        .filter((item): item is { type: "text"; text: string } => item.type === "text")
        .map((item) => item.text)
        .join("")
        .trim();
      if (text) {
        assistantText = text;
      }
      const thinking = content
        .filter((item): item is { type: "thinking"; thinking: string } => item.type === "thinking")
        .map((item) => item.thinking)
        .join("")
        .trim();
      if (thinking) {
        writeEvent({
          type: "thinking_end",
          taskId: command.taskId,
          content: thinking,
        });
      }
      return;
    }

    if (event.type === "tool_execution_start") {
      writeEvent({
        type: "tool_start",
        taskId: command.taskId,
        toolName: event.toolName,
        args: event.args,
      });
      return;
    }

    if (event.type === "tool_execution_update") {
      writeEvent({
        type: "tool_update",
        taskId: command.taskId,
        toolName: event.toolName,
        partialResult: event.partialResult,
      });
      return;
    }

    if (event.type === "tool_execution_end") {
      writeEvent({
        type: "tool_end",
        taskId: command.taskId,
        toolName: event.toolName,
        isError: event.isError,
        result: event.result,
      });
    }
  });

  try {
    writeEvent({ type: "started", taskId: command.taskId });
    await session.prompt(command.prompt);
    writeEvent({
      type: "done",
      taskId: command.taskId,
      text: assistantText.trim(),
    });
  } finally {
    unsubscribe();
    session.dispose();
  }
};

const readCommand = async (): Promise<BridgeCommand> => {
  const reader = createInterface({ input });
  const iterator = reader[Symbol.asyncIterator]();
  const line = await iterator.next();
  reader.close();

  if (line.done || !line.value.trim()) {
    throw new Error("未收到 Agent bridge 命令");
  }

  const command = JSON.parse(line.value) as BridgeCommand;
  if (command.type !== "start_task") {
    throw new Error(`未知 Agent bridge 命令：${(command as { type?: string }).type}`);
  }

  return command;
};

const main = async () => {
  const command = await readCommand();
  await runTask(command);
};

main().catch((error: unknown) => {
  writeEvent({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
