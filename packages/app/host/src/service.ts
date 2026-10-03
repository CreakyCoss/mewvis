import { productId } from "@mewvis/product-config";
import type { ProductId } from "@mewvis/product-config";
import type { AgentAccess } from "@mewvis/chat-contracts";
import { createNativeApplicationChat } from "./chat.js";
import { createNativeApplicationData } from "./data.js";
import { readToolPolicy, writeToolPolicy } from "./tool-policy.js";
import { createInterface } from "node:readline";
import { format } from "node:util";
import {
  ApplicationHost,
  type ApplicationRuntimeKind,
  type ApplicationToolSchema,
} from "./index.js";
import {
  loadApplicationUiManifest,
  type ApplicationCompatibilityInfo,
  type ApplicationUiContribution,
  type ApplicationUiDocument,
} from "./ui-manifest.js";

type RuntimeApplication = Readonly<{
  kind: ApplicationRuntimeKind;
  id: string;
  name: string;
  version: string;
  description: string;
  source: string;
  entry: string;
  packageRoot: string;
  patchPath?: string | null;
  permissions: readonly string[];
  agentAccess?: AgentAccess | null;
  permissionStatus:
    "declared" | ProductId<"-upgrade-required"> | "dsh-unsupported";
  dataConnection?: string | null;
}>;

type HostConfiguration = Readonly<{
  settingsPath: string;
  applications: readonly RuntimeApplication[];
}>;

type RpcRequest = Readonly<{
  id: string | number;
  method: string;
  params?: unknown;
}>;

type UiApplication = Readonly<{
  runtimeKind: ApplicationRuntimeKind;
  id: string;
  name: string;
  version: string;
  description: string;
  source: string;
  tools: readonly ApplicationToolSchema[];
  error: string | null;
  ui: ApplicationUiContribution | null;
  uiError: string | null;
  compatibility: readonly ApplicationCompatibilityInfo[];
  permissions: readonly string[];
  agentAccess?: AgentAccess | null;
  permissionStatus:
    "declared" | ProductId<"-upgrade-required"> | "dsh-unsupported";
}>;

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_UI_DOCUMENT_RESPONSE_BYTES = 24 * 1024 * 1024;
const TOOL_TIMEOUT_MS = 60_000;
const protocolWrite = process.stdout.write.bind(process.stdout);
const writeLog = (...values: unknown[]) =>
  process.stderr.write(`${format(...values)}\n`);

console.log = writeLog;
console.info = writeLog;
console.warn = writeLog;
console.error = writeLog;

let host: ApplicationHost | null = null;
let applicationSettingsRoot: string | undefined;
let applications: readonly UiApplication[] = Object.freeze([]);
let uiDocuments = new Map<string, ApplicationUiDocument>();
const nativeChat = createNativeApplicationChat(
  (message) => protocolWrite(JSON.stringify(message) + "\n"),
  (applicationId) =>
    applications
      .find((application) => application.id === applicationId)
      ?.tools.map((tool) => tool.name) ?? [],
);
const createDataConnection = () =>
  createNativeApplicationData((message) =>
    protocolWrite(JSON.stringify(message) + "\n"),
  );
let nativeData = createDataConnection();

const asObject = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label}必须是对象。`);
  return value as Record<string, unknown>;
};

const requiredString = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${key}不能为空。`);
  return value;
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const disposeHost = async () => {
  const current = host;
  host = null;
  applications = Object.freeze([]);
  uiDocuments = new Map();
  if (current) await current.dispose();
  nativeChat.dispose();
  nativeData.dispose();
};

const configure = async (value: unknown) => {
  const input = asObject(value, "Application Host 配置");
  const settingsPath = requiredString(input, "settingsPath");
  if (!Array.isArray(input.applications))
    throw new Error("applications 必须是数组。");
  const runtimeApplications = input.applications as RuntimeApplication[];

  await disposeHost();
  applicationSettingsRoot = settingsPath;
  nativeData = createDataConnection();
  const nextHost = await ApplicationHost.create({
    applicationSettingsRoot: settingsPath,
    data: (id) =>
      nativeData.client(
        runtimeApplications.find((application) => application.id === id)
          ?.dataConnection,
      ),
    chat: (id) =>
      runtimeApplications
        .find((application) => application.id === id)
        ?.permissions?.includes("chat")
        ? nativeChat.client(id)
        : undefined,
  });
  const nextApplications: UiApplication[] = [];
  try {
    for (const application of runtimeApplications) {
      const uiManifest = await loadApplicationUiManifest(
        application.packageRoot,
      );
      const before = new Set(nextHost.toolSchemas().map((tool) => tool.name));
      let error: string | null = null;
      let tools: ApplicationToolSchema[] = [];
      try {
        await nextHost.load(application);
        tools = nextHost.toolSchemas().filter((tool) => !before.has(tool.name));
      } catch (caught) {
        error = errorMessage(caught);
        await nextHost.unload(application.id);
      }
      const uiError = uiManifest.error;
      if (uiManifest.contribution?.kind === "sandbox" && uiManifest.document) {
        uiDocuments.set(application.id, uiManifest.document);
      }
      nextApplications.push({
        runtimeKind: application.kind,
        id: application.id,
        name: application.name,
        version: application.version,
        description: application.description,
        source: application.source,
        tools,
        error,
        ui: uiManifest.contribution,
        uiError,
        compatibility: uiManifest.compatibility,
        permissions: Array.isArray(application.permissions)
          ? application.permissions
          : [],
        agentAccess: application.agentAccess,
        permissionStatus:
          application.permissionStatus === "declared" ||
          application.permissionStatus === productId("-upgrade-required") ||
          application.permissionStatus === "dsh-unsupported"
            ? application.permissionStatus
            : application.kind === "dsh"
              ? "dsh-unsupported"
              : productId("-upgrade-required"),
      });
    }
    host = nextHost;
    applications = Object.freeze(nextApplications);
    return { applications };
  } catch (error) {
    await nextHost.dispose();
    throw error;
  }
};

const uiDocument = (value: unknown) => {
  const input = asObject(value, "应用 UI 文档参数");
  const applicationId = requiredString(input, "applicationId");
  const application = applications.find(
    (candidate) => candidate.id === applicationId,
  );
  if (!application) throw new Error(`应用未启用或不存在：${applicationId}`);
  if (application.uiError)
    throw new Error(
      `应用 ${application.name} 的 UI 声明无效：${application.uiError}`,
    );
  if (!application.ui)
    throw new Error(`应用 ${application.name} 没有声明沙箱 UI。`);
  const document = uiDocuments.get(applicationId);
  if (!document)
    throw new Error(`应用 ${application.name} 的沙箱 UI 文档不可用。`);
  return document;
};

const execute = async (value: unknown) => {
  if (!host) throw new Error("Application Host 尚未配置。");
  const input = asObject(value, "工具调用参数");
  const applicationId = requiredString(input, "applicationId");
  const toolName = requiredString(input, "toolName");
  const application = applications.find(
    (candidate) => candidate.id === applicationId,
  );
  if (!application) throw new Error(`应用未启用或不存在：${applicationId}`);
  if (application.error)
    throw new Error(`应用 ${application.name} 加载失败：${application.error}`);
  if (!application.tools.some((tool) => tool.name === toolName)) {
    throw new Error(`应用 ${application.name} 没有注册工具：${toolName}`);
  }
  const policy = await readToolPolicy(applicationSettingsRoot!, applicationId);
  if (policy && !policy.allowedToolNames.includes(toolName))
    throw new Error(`用户已禁用工具：${toolName}`);

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
        callId: `application-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
    case "toolPolicy.get":
    case "toolPolicy.set": {
      const input = asObject(request.params, "工具授权参数");
      const id = requiredString(input, "applicationId");
      if (
        !host ||
        !applicationSettingsRoot ||
        !applications.some((application) => application.id === id)
      )
        throw new Error("应用未启用或不存在");
      return request.method === "toolPolicy.get"
        ? readToolPolicy(applicationSettingsRoot, id)
        : writeToolPolicy(applicationSettingsRoot, id, input.policy);
    }
    case "configure":
      return configure(request.params);
    case "catalog":
      return { applications };
    case "execute":
      return execute(request.params);
    case "uiDocument":
      return uiDocument(request.params);
    case "shutdown":
      await disposeHost();
      return { ok: true };
    default:
      throw new Error(`未知 Application Host 方法：${request.method}`);
  }
};

const send = (payload: unknown, method?: string) => {
  const maxBytes =
    method === "uiDocument"
      ? MAX_UI_DOCUMENT_RESPONSE_BYTES
      : MAX_RESPONSE_BYTES;
  const responseId =
    payload && typeof payload === "object" && "id" in payload
      ? (payload as { id?: unknown }).id
      : null;
  let line: string;
  try {
    line = JSON.stringify(payload);
  } catch (error) {
    line = JSON.stringify({
      id: responseId,
      error: {
        message: `Application Host 响应无法序列化：${errorMessage(error)}`,
      },
    });
  }
  if (Buffer.byteLength(line) > maxBytes) {
    line = JSON.stringify({
      id: responseId,
      error: {
        message: `Application Host 响应超过 ${maxBytes / 1024 / 1024} MiB 上限。`,
      },
    });
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
    if (nativeData.receive(request)) continue;
    if (request.id === undefined || typeof request.method !== "string")
      throw new Error("请求缺少 id 或 method。");
  } catch (error) {
    send({
      id: null,
      error: { message: `Application Host 请求无效：${errorMessage(error)}` },
    });
    continue;
  }

  const job = (async () => {
    try {
      send({ id: request.id, result: await dispatch(request) }, request.method);
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
