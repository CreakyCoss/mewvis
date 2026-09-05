import { createNativePluginChat } from "./chat.js";
import { createInterface } from "node:readline";
import { format } from "node:util";
import { PluginHost, type PluginRuntimeKind } from "./index.js";
import {
  loadPluginUiManifest,
  type PluginCompatibilityInfo,
  type PluginUiContribution,
  type PluginUiDocument,
} from "./ui-manifest.js";

type RuntimePlugin = Readonly<{
  kind: PluginRuntimeKind;
  id: string;
  name: string;
  version: string;
  description: string;
  source: string;
  entry: string;
  packageRoot: string;
  patchPath?: string | null;
  permissions: readonly string[];
  permissionStatus: "declared" | "isle-upgrade-required" | "dsh-unsupported";
}>;

type HostConfiguration = Readonly<{
  settingsPath: string;
  plugins: readonly RuntimePlugin[];
}>;

type RpcRequest = Readonly<{
  id: string | number;
  method: string;
  params?: unknown;
}>;

type UiTool = Readonly<{
  name: string;
  description: string;
  parameters: unknown;
}>;

type UiPlugin = Readonly<{
  runtimeKind: PluginRuntimeKind;
  id: string;
  name: string;
  version: string;
  description: string;
  source: string;
  tools: readonly UiTool[];
  error: string | null;
  ui: PluginUiContribution | null;
  uiError: string | null;
  compatibility: readonly PluginCompatibilityInfo[];
  permissions: readonly string[];
  permissionStatus: "declared" | "isle-upgrade-required" | "dsh-unsupported";
}>;

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const TOOL_TIMEOUT_MS = 60_000;
const protocolWrite = process.stdout.write.bind(process.stdout);
const writeLog = (...values: unknown[]) => process.stderr.write(`${format(...values)}\n`);

console.log = writeLog;
console.info = writeLog;
console.warn = writeLog;
console.error = writeLog;

let host: PluginHost | null = null;
let plugins: readonly UiPlugin[] = Object.freeze([]);
let uiDocuments = new Map<string, PluginUiDocument>();
const nativeChat = createNativePluginChat(
  (message) => protocolWrite(JSON.stringify(message) + "\n"),
  (pluginId) => plugins.find((plugin) => plugin.id === pluginId)?.tools.map((tool) => tool.name) ?? [],
);

const asObject = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}必须是对象。`);
  return value as Record<string, unknown>;
};

const requiredString = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key}不能为空。`);
  return value;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const disposeHost = async () => {
  const current = host;
  host = null;
  plugins = Object.freeze([]);
  uiDocuments = new Map();
  if (current) await current.dispose();
  nativeChat.dispose();
};

const configure = async (value: unknown) => {
  const input = asObject(value, "Plugin Host 配置");
  const settingsPath = requiredString(input, "settingsPath");
  if (!Array.isArray(input.plugins)) throw new Error("plugins 必须是数组。");
  const runtimePlugins = input.plugins as RuntimePlugin[];

  await disposeHost();
  const nextHost = await PluginHost.create({
    settingsPath,
    chat: (id) =>
      runtimePlugins.find((plugin) => plugin.id === id)?.permissions.includes("chat")
        ? nativeChat.client(id)
        : undefined,
  });
  const nextPlugins: UiPlugin[] = [];
  try {
    for (const plugin of runtimePlugins) {
      const uiManifest = await loadPluginUiManifest(plugin.packageRoot);
      const before = new Set(nextHost.toolSchemas().map((tool) => tool.name));
      let error: string | null = null;
      try {
        await nextHost.load(plugin);
      } catch (caught) {
        error = errorMessage(caught);
      }
      const tools = nextHost
        .toolSchemas()
        .filter((tool) => !before.has(tool.name))
        .map((tool): UiTool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        }));
      const uiError = uiManifest.error;
      if (uiManifest.contribution?.kind === "sandbox" && uiManifest.document) {
        uiDocuments.set(plugin.id, uiManifest.document);
      }
      nextPlugins.push({
        runtimeKind: plugin.kind,
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        description: plugin.description,
        source: plugin.source,
        tools,
        error,
        ui: uiManifest.contribution,
        uiError,
        compatibility: uiManifest.compatibility,
        permissions: Array.isArray(plugin.permissions) ? plugin.permissions : [],
        permissionStatus:
          plugin.permissionStatus === "declared" ||
          plugin.permissionStatus === "isle-upgrade-required" ||
          plugin.permissionStatus === "dsh-unsupported"
            ? plugin.permissionStatus
            : plugin.kind === "dsh"
              ? "dsh-unsupported"
              : "isle-upgrade-required",
      });
    }
    host = nextHost;
    plugins = Object.freeze(nextPlugins);
    return { plugins };
  } catch (error) {
    await nextHost.dispose();
    throw error;
  }
};

const uiDocument = (value: unknown) => {
  const input = asObject(value, "插件 UI 文档参数");
  const pluginId = requiredString(input, "pluginId");
  const plugin = plugins.find((candidate) => candidate.id === pluginId);
  if (!plugin) throw new Error(`插件未启用或不存在：${pluginId}`);
  if (plugin.uiError) throw new Error(`插件 ${plugin.name} 的 UI 声明无效：${plugin.uiError}`);
  if (!plugin.ui) throw new Error(`插件 ${plugin.name} 没有声明沙箱 UI。`);
  const document = uiDocuments.get(pluginId);
  if (!document) throw new Error(`插件 ${plugin.name} 的沙箱 UI 文档不可用。`);
  return document;
};

const execute = async (value: unknown) => {
  if (!host) throw new Error("Plugin Host 尚未配置。");
  const input = asObject(value, "工具调用参数");
  const pluginId = requiredString(input, "pluginId");
  const toolName = requiredString(input, "toolName");
  const plugin = plugins.find((candidate) => candidate.id === pluginId);
  if (!plugin) throw new Error(`插件未启用或不存在：${pluginId}`);
  if (plugin.error) throw new Error(`插件 ${plugin.name} 加载失败：${plugin.error}`);
  if (!plugin.tools.some((tool) => tool.name === toolName)) {
    throw new Error(`插件 ${plugin.name} 没有注册工具：${toolName}`);
  }

  const controller = new AbortController();
  const timeoutError = new Error(`工具执行超过 ${TOOL_TIMEOUT_MS / 1000} 秒。`);
  let rejectTimeout: ((reason: Error) => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
  });
  const timer = setTimeout(() => {
    controller.abort(timeoutError);
    rejectTimeout?.(timeoutError);
  }, TOOL_TIMEOUT_MS);
  timer.unref?.();
  try {
    const result = await Promise.race([
      host.executeTool({
        callId: `plugin-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: toolName,
        arguments: input.arguments ?? {},
        signal: controller.signal,
      }),
      timeout,
    ]);
    if (result.isError) throw new Error(result.error.message);
    return {
      value: result.value,
      content: result.content,
      meta: result.meta ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
};

const dispatch = async (request: RpcRequest) => {
  switch (request.method) {
    case "configure":
      return configure(request.params);
    case "catalog":
      return { plugins };
    case "execute":
      return execute(request.params);
    case "uiDocument":
      return uiDocument(request.params);
    case "shutdown":
      await disposeHost();
      return { ok: true };
    default:
      throw new Error(`未知 Plugin Host 方法：${request.method}`);
  }
};

const send = (payload: unknown) => {
  const responseId =
    payload && typeof payload === "object" && "id" in payload ? (payload as { id?: unknown }).id : null;
  let line: string;
  try {
    line = JSON.stringify(payload);
  } catch (error) {
    line = JSON.stringify({ id: responseId, error: { message: `Plugin Host 响应无法序列化：${errorMessage(error)}` } });
  }
  if (Buffer.byteLength(line) > MAX_RESPONSE_BYTES) {
    line = JSON.stringify({ id: responseId, error: { message: "Plugin Host 响应超过 4 MiB 上限。" } });
  }
  protocolWrite(`${line}\n`);
};

const jobs = new Set<Promise<void>>();
const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of reader) {
  if (!line.trim()) continue;
  let request: RpcRequest;
  try {
    request = JSON.parse(line) as RpcRequest;
    if (nativeChat.receive(request)) continue;
    if (request.id === undefined || typeof request.method !== "string") throw new Error("请求缺少 id 或 method。");
  } catch (error) {
    send({ id: null, error: { message: `Plugin Host 请求无效：${errorMessage(error)}` } });
    continue;
  }

  const job = (async () => {
    try {
      send({ id: request.id, result: await dispatch(request) });
    } catch (error) {
      send({ id: request.id, error: { message: errorMessage(error) } });
    }
    if (request.method === "shutdown") reader.close();
  })();
  jobs.add(job);
  void job.finally(() => jobs.delete(job));
}
await Promise.allSettled(jobs);

await disposeHost();
process.stdin.unref();
