import type {
  JsonObject,
  JsonValue,
  ExtensionToolResult,
  ExtensionContextMessage,
  ExtensionResultView,
  ExtensionMessage,
  ExtensionMessageChange,
  ExtensionCompactionRequest,
  ExtensionCompactionResult,
} from "@isle/extension-sdk";
import { randomUUID } from "node:crypto";

export interface MockCall {
  id: string;
  input: JsonObject;
  signal?: AbortSignal;
  update(value: ExtensionToolResult): void;
}
export interface MockPluginAPI {
  beforeCompact(
    handler: (request: ExtensionCompactionRequest, signal?: AbortSignal) => Promise<string | undefined>,
  ): void;
  onCompact(handler: (result: ExtensionCompactionResult) => Promise<void>): void;
  onMessage(
    listener: (event: {
      phase: "start" | "update" | "end";
      message: ExtensionMessage;
      change?: ExtensionMessageChange;
    }) => Promise<void>,
  ): void;
  onTurn(
    listener: (
      event:
        | { phase: "start"; index: number; timestamp: number }
        | { phase: "end"; index: number; message: ExtensionMessage; results: ExtensionMessage[] },
    ) => Promise<void>,
  ): void;
  onInput(handler: (text: string) => Promise<string>): void;
  onSystemPrompt(handler: (text: string) => Promise<string>): void;
  onContext(handler: (messages: ExtensionContextMessage[]) => Promise<ExtensionContextMessage[]>): void;
  beforeTool(handler: (name: string, call: MockCall) => Promise<{ input: JsonObject; blocked?: string }>): void;
  afterTool(handler: (name: string, call: MockCall, result: ExtensionResultView) => Promise<ExtensionResultView>): void;
  addTool(name: string, invoke: (call: MockCall) => Promise<ExtensionToolResult>): void;
  addCommand(name: string, invoke: (call: MockCall) => Promise<JsonValue>): void;
  addInstructions(text: string): void;
  onTool(
    listener: (event: { phase: "start" | "end"; id: string; name: string; failed?: boolean }) => Promise<void>,
  ): void;
}
export type MockPlugin = (api: MockPluginAPI) => void;

/** Mock's own registration and dispatch API; it does not know Isle bindings or worker RPC. */
export function createMockPluginRegistry() {
  const tools = new Map<string, (call: MockCall) => Promise<ExtensionToolResult>>();
  const commands = new Map<string, (call: MockCall) => Promise<JsonValue>>();
  const instructions: string[] = [];
  const observers: Parameters<MockPluginAPI["onTool"]>[0][] = [];
  const inputs: Parameters<MockPluginAPI["onInput"]>[0][] = [];
  const systems: Parameters<MockPluginAPI["onSystemPrompt"]>[0][] = [];
  const contexts: Parameters<MockPluginAPI["onContext"]>[0][] = [];
  const before: Parameters<MockPluginAPI["beforeTool"]>[0][] = [];
  const after: Parameters<MockPluginAPI["afterTool"]>[0][] = [];
  const beforeCompact: Parameters<MockPluginAPI["beforeCompact"]>[0][] = [];
  const compactObservers: Parameters<MockPluginAPI["onCompact"]>[0][] = [];
  const messageObservers: Parameters<MockPluginAPI["onMessage"]>[0][] = [];
  const turnObservers: Parameters<MockPluginAPI["onTurn"]>[0][] = [];
  const api: MockPluginAPI = {
    beforeCompact(handler) {
      beforeCompact.push(handler);
    },
    onCompact(handler) {
      compactObservers.push(handler);
    },
    onMessage(listener) {
      messageObservers.push(listener);
    },
    onTurn(listener) {
      turnObservers.push(listener);
    },
    onInput(handler) {
      inputs.push(handler);
    },
    onSystemPrompt(handler) {
      systems.push(handler);
    },
    onContext(handler) {
      contexts.push(handler);
    },
    beforeTool(handler) {
      before.push(handler);
    },
    afterTool(handler) {
      after.push(handler);
    },
    addTool(name, invoke) {
      if (tools.has(name)) throw new Error(`重复 Mock 工具：${name}`);
      tools.set(name, invoke);
    },
    addCommand(name, invoke) {
      if (commands.has(name)) throw new Error(`重复 Mock 命令：${name}`);
      commands.set(name, invoke);
    },
    addInstructions(text) {
      instructions.push(text);
    },
    onTool(listener) {
      observers.push(listener);
    },
  };
  return {
    async compact(
      request: Omit<ExtensionCompactionRequest, "operationId">,
      perform: () => Promise<string | null>,
      signal?: AbortSignal,
    ) {
      const data = { ...request, operationId: randomUUID() };
      let result: ExtensionCompactionResult = {
        operationId: data.operationId,
        reason: data.reason,
        status: "skipped",
        summary: null,
        message: null,
      };
      let failure: unknown;
      let failed = false;
      try {
        signal?.throwIfAborted();
        for (const handler of beforeCompact) {
          const blocked = await handler(structuredClone(data), signal);
          if (blocked !== undefined) {
            result = { ...result, status: "blocked", message: blocked };
            break;
          }
        }
        signal?.throwIfAborted();
        if (result.status !== "blocked") {
          const summary = await perform();
          signal?.throwIfAborted();
          result = { ...result, status: summary === null ? "skipped" : "completed", summary };
        }
      } catch (error) {
        failed = true;
        failure = error;
        result = {
          ...result,
          status: signal?.aborted ? "cancelled" : "failed",
          message: error instanceof Error ? error.message : String(error),
        };
      }
      for (const observer of compactObservers) await observer(structuredClone(result));
      if (failed) throw failure;
      return result;
    },
    async notifyMessage(event: Parameters<Parameters<MockPluginAPI["onMessage"]>[0]>[0]) {
      for (const listener of messageObservers) await listener(structuredClone(event));
    },
    async notifyTurn(event: Parameters<Parameters<MockPluginAPI["onTurn"]>[0]>[0]) {
      for (const listener of turnObservers) await listener(structuredClone(event));
    },
    async prepareRequest(text: string, systemPrompt: string) {
      for (const handler of inputs) text = await handler(text);
      systemPrompt = [systemPrompt, ...instructions].filter(Boolean).join("\n\n");
      for (const handler of systems) systemPrompt = await handler(systemPrompt);
      let messages: ExtensionContextMessage[] = [{ id: randomUUID(), role: "user", text }];
      for (const handler of contexts) messages = await handler(structuredClone(messages));
      return { text, systemPrompt, messages };
    },
    register(plugin: MockPlugin) {
      plugin(api);
    },
    get instructions() {
      return instructions.join("\n\n");
    },
    async tool(name: string, call: MockCall) {
      const invoke = tools.get(name);
      if (!invoke) throw new Error(`Mock 工具未启用：${name}`);
      let current = { ...call, input: structuredClone(call.input) };
      for (const handler of before) {
        const reply = await handler(name, current);
        if (reply.blocked)
          return { content: [{ type: "text" as const, text: reply.blocked }], details: {}, isError: true };
        current = { ...current, input: reply.input };
      }
      let failed = false;
      let result: ExtensionResultView;
      try {
        result = { ...(await invoke(current)), isError: false };
      } catch (error) {
        failed = true;
        result = {
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          details: null,
          isError: true,
        };
      }
      for (const handler of after) result = await handler(name, current, structuredClone(result));
      // A script has no model to recover from an execution error. Preserve its failure unless
      // middleware explicitly replaces the error result with a successful one.
      if (failed && result.isError)
        throw new Error(result.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n"));
      return result;
    },
    async command(name: string, call: MockCall) {
      const invoke = commands.get(name);
      if (!invoke) throw new Error(`Mock 命令未启用：${name}`);
      return invoke(call);
    },
    async notify(event: Parameters<Parameters<MockPluginAPI["onTool"]>[0]>[0]) {
      for (const listener of observers) await listener(event);
    },
  };
}
