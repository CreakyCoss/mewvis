import {
  createExtensionHostClient,
  extensionHostMethods,
  type ExtensionHostServices,
} from "../../services/contracts.js";
import {
  toolSchema,
  commandSchema,
  skillSchema,
  validateExtensionResult,
} from "@isle/extension-host/agent/resources";
import {
  createFacetHost,
  defineService,
  isJsonValue,
  type Facet,
} from "@earendil-works/chord";
import {
  extensionToolName,
  extensionEventCapabilities,
  type ExtensionCatalog,
  type ExtensionDefinition,
  type ExtensionSource,
  type ExtensionTool,
  type ExtensionToolResult,
  type ExtensionCapability,
  type ExtensionMiddlewareHandler,
  type ExtensionMiddlewareType,
} from "@isle/extension-host";
import { AsyncLocalStorage } from "node:async_hooks";
import type {
  ExtensionAgentEvent,
  ExtensionCommand,
  JsonValue,
} from "@isle/extension-host";
type ExtensionState = Record<string, import("../../shared.js").JsonObject>;
import { Ajv } from "ajv";
import { pathToFileURL } from "node:url";
import {
  applyMiddlewareResult,
  middlewareTypes,
  validateMiddlewareData,
} from "@isle/extension-host/agent/middleware";
import { validateExtensionEvent } from "@isle/extension-host/agent/events";

/** One host per live session instance (or ephemeral run), including module evaluation in the worker. */
export async function createExtensionHost(
  sources: readonly ExtensionSource[],
  workspacePath: string,
  services?: (source: ExtensionSource) => ExtensionHostServices,
) {
  const catalog: ExtensionCatalog = {
    tools: [],
    skills: [],
    commands: [],
    subscriptions: [],
    middleware: [],
  };
  const middleware = new Map<
    string,
    {
      type: ExtensionMiddlewareType;
      handle: ExtensionMiddlewareHandler<ExtensionMiddlewareType>;
    }
  >();
  const commands = new Map<
    string,
    { command: ExtensionCommand; validate: ReturnType<Ajv["compile"]> }
  >();
  const handlers = new Map<
    string,
    Array<{
      type: ExtensionAgentEvent["type"];
      handle: (
        event: ExtensionAgentEvent,
        context: { signal: AbortSignal },
      ) => void | Promise<void>;
    }>
  >();
  const invocation = new AsyncLocalStorage<{
    state: ExtensionState;
    active: boolean;
  }>();
  const frameFor = (id: string) => {
    const frame = invocation.getStore();
    if (!frame?.active)
      throw new Error("插件状态只能在工具、命令、事件或中间件处理期间访问");
    if (!Object.hasOwn(frame.state, id))
      Object.defineProperty(frame.state, id, {
        value: {},
        writable: true,
        enumerable: true,
        configurable: true,
      });
    return frame.state[id];
  };
  const validateKey = (key: string) => {
    if (!/^[a-z][a-z0-9_.-]{0,63}$/.test(key))
      throw new Error("无效的插件状态 key");
  };
  const tools = new Map<
    string,
    { tool: ExtensionTool; validate: ReturnType<Ajv["compile"]> }
  >();
  const ajv = new Ajv({ allErrors: true });
  const directory = defineService<{
    add(source: ExtensionSource, tool: ExtensionTool): void;
  }>("isle.extension.tools", {
    local: true,
  });
  const facets: Facet[] = [
    {
      id: "isle.extension.directory",
      setup(env) {
        env.provide(directory, {
          add(source, definition) {
            const tool = toolSchema.parse(definition) as ExtensionTool;
            if (!isJsonValue(tool.parameters))
              throw new Error("插件工具 schema 必须为 JSON");
            const name = extensionToolName(source.id, tool.name);
            if (name.length > 64 || tools.has(name))
              throw new Error(`插件工具名称冲突或过长：${name}`);
            const parameters = structuredClone(tool.parameters);
            tools.set(name, { tool, validate: ajv.compile(parameters) });
            catalog.tools.push({
              id: `${source.id}/${tool.name}`,
              name,
              label: tool.label,
              description: tool.description,
              parameters,
            });
          },
        });
      },
    },
  ];
  const ids = new Set<string>();
  for (const source of sources) {
    if (ids.has(source.id)) throw new Error(`重复插件：${source.id}`);
    ids.add(source.id);
    const module = await import(pathToFileURL(source.entry).href);
    const extension = module.default as ExtensionDefinition | undefined;
    if (
      extension?.id !== source.id ||
      extension.protocolVersion !== 1 ||
      typeof extension.setup !== "function"
    )
      throw new Error(`插件身份或 API 版本不匹配：${source.id}`);
    const requireCapability = (capability: ExtensionCapability) => {
      if (source.capabilities && !source.capabilities.includes(capability))
        throw new Error(`插件 ${source.id} 未声明能力：${capability}`);
    };
    const freezeConfig = (value: unknown): void => {
      if (value && typeof value === "object") {
        for (const child of Object.values(value)) freezeConfig(child);
        Object.freeze(value);
      }
    };
    const config = structuredClone(source.config ?? {});
    freezeConfig(config);
    const observers: NonNullable<ReturnType<typeof handlers.get>> = [];
    handlers.set(source.id, observers);
    catalog.subscriptions.push({ extensionId: source.id, events: [] });
    facets.push({
      id: `extension:${source.id}`,
      setup(env) {
        const registry = env.use(directory);
        const pending: ExtensionTool[] = [];
        let declaring = true;
        const assertSetup = () => {
          if (!declaring) throw new Error("插件只能在 setup 中声明资源");
        };
        env.onActivate(() => {
          for (const tool of pending) registry.add(source, tool);
        });
        try {
          const result: unknown = extension.setup({
            services:
              services?.(source) ??
              createExtensionHostClient(
                async () => {
                  throw new Error("宿主服务不可用");
                },
                Object.keys(extensionHostMethods).map((capability) => ({
                  capability,
                  status: "unsupported",
                })) as ExtensionHostServices["capabilities"],
              ),
            workspacePath,
            config,
            session: {
              get(key) {
                requireCapability("session.state");
                validateKey(key);
                const state = frameFor(source.id);
                return Object.hasOwn(state, key)
                  ? structuredClone(state[key])
                  : undefined;
              },
              set(key, value) {
                requireCapability("session.state");
                validateKey(key);
                if (!isJsonValue(value))
                  throw new Error("插件状态值必须为 JSON");
                Object.defineProperty(frameFor(source.id), key, {
                  value: structuredClone(value),
                  writable: true,
                  enumerable: true,
                  configurable: true,
                });
              },
              delete(key) {
                requireCapability("session.state");
                validateKey(key);
                delete frameFor(source.id)[key];
              },
            },
            registerCommand(definition) {
              requireCapability("commands");
              assertSetup();
              const command = commandSchema.parse(
                definition,
              ) as ExtensionCommand;
              if (!isJsonValue(command.parameters))
                throw new Error("命令 schema 必须为 JSON");
              const id = `${source.id}/${command.name}`;
              if (commands.has(id)) throw new Error(`重复插件命令：${id}`);
              const parameters = structuredClone(command.parameters);
              commands.set(id, { command, validate: ajv.compile(parameters) });
              catalog.commands.push({
                id,
                ...(command.inputMode && { inputMode: command.inputMode }),
                ...(command.label && { label: command.label }),
                description: command.description,
                parameters,
              });
            },
            use(type, handler) {
              assertSetup();
              if (
                !middlewareTypes.includes(type) ||
                typeof handler !== "function"
              )
                throw new Error("无效的插件中间件");
              requireCapability(`middleware.${type}`);
              const id = `${source.id}/${middleware.size}`;
              middleware.set(id, {
                type,
                handle:
                  handler as unknown as ExtensionMiddlewareHandler<ExtensionMiddlewareType>,
              });
              catalog.middleware.push({ id, extensionId: source.id, type });
            },
            on(type, handler) {
              assertSetup();
              if (
                !Object.hasOwn(extensionEventCapabilities, type) ||
                typeof handler !== "function"
              )
                throw new Error("无效的插件事件订阅");
              requireCapability(extensionEventCapabilities[type]);
              observers.push({
                type,
                handle: handler as (
                  event: ExtensionAgentEvent,
                  context: { signal: AbortSignal },
                ) => void | Promise<void>,
              });
              const subscription = catalog.subscriptions.find(
                (item) => item.extensionId === source.id,
              )!;
              if (!subscription.events.includes(type))
                subscription.events.push(type);
            },
            registerTool(tool) {
              requireCapability("tools");
              assertSetup();
              pending.push(tool);
            },
            registerSkill(input) {
              requireCapability("skills");
              assertSetup();
              const skill = skillSchema.parse(input);
              const id = `${source.id}/${skill.name}`;
              if (catalog.skills.some((item) => item.id === id))
                throw new Error(`重复插件技能：${id}`);
              catalog.skills.push({
                id,
                description: skill.description,
                content: skill.content,
              });
            },
            own(dispose) {
              assertSetup();
              env.own(dispose);
            },
            onActivate(callback) {
              assertSetup();
              env.onActivate(callback);
            },
          });
          if (result !== undefined) {
            if (result instanceof Promise) void result.catch(() => undefined);
            throw new Error("插件 setup 必须同步且无返回值");
          }
        } finally {
          declaring = false;
        }
      },
    });
  }
  const host = await createFacetHost({ facets });
  let disposed = false;
  return {
    catalog,
    async intercept(id: string, data: unknown, signal: AbortSignal) {
      signal.throwIfAborted();
      const handler = middleware.get(id);
      if (!handler) throw new Error(`中间件未注册：${id}`);
      const input = validateMiddlewareData(handler.type, data);
      const reply = await handler.handle(structuredClone(input), { signal });
      signal.throwIfAborted();
      return applyMiddlewareResult(handler.type, input, reply);
    },
    async transact<T>(state: ExtensionState, operation: () => Promise<T>) {
      if (disposed) throw new Error("插件资源已释放");
      const frame = { state: structuredClone(state), active: true };
      try {
        const value = await invocation.run(frame, operation);
        return { value, state: frame.state };
      } finally {
        frame.active = false;
      }
    },
    async command(
      id: string,
      input: unknown,
      signal: AbortSignal,
    ): Promise<JsonValue> {
      signal.throwIfAborted();
      const entry = commands.get(id);
      if (!entry) throw new Error(`插件命令未注册：${id}`);
      if (!isJsonValue(input) || !entry.validate(input))
        throw new Error(`插件命令参数无效：${id}`);
      const result = await entry.command.execute(
        input as Parameters<ExtensionCommand["execute"]>[0],
        { signal },
      );
      signal.throwIfAborted();
      if (!isJsonValue(result)) throw new Error("插件命令结果必须为 JSON");
      return result;
    },
    async notify(
      extensionId: string,
      event: ExtensionAgentEvent,
      signal: AbortSignal,
    ) {
      event = validateExtensionEvent(event);
      for (const handler of handlers.get(extensionId) ?? []) {
        signal.throwIfAborted();
        if (handler.type === event.type)
          await handler.handle(structuredClone(event), { signal });
      }
      signal.throwIfAborted();
      return null;
    },
    async execute(
      name: string,
      input: unknown,
      callId: string,
      signal: AbortSignal,
      progress: (value: ExtensionToolResult) => void,
    ) {
      signal.throwIfAborted();
      if (disposed) throw new Error("插件资源已释放");
      const entry = tools.get(name);
      if (!entry) throw new Error(`插件工具未注册：${name}`);
      if (!isJsonValue(input) || !entry.validate(input))
        throw new Error(`插件工具参数无效：${name}`);
      const result = await entry.tool.execute(
        input as Parameters<ExtensionTool["execute"]>[0],
        {
          callId,
          signal,
          progress: (value) => {
            signal.throwIfAborted();
            progress(validateExtensionResult(value));
          },
        },
      );
      signal.throwIfAborted();
      return validateExtensionResult(result);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await host.dispose();
    },
  };
}
