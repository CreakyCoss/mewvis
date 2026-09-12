import type { IsleToolRisk } from "@isle/app-sdk";
import { isRiskLevel } from "@isle/chat-contracts";
import { createApplicationChatClient, type ApplicationChatClient } from "@isle/app-sdk/chat";
import { createApplicationDataClient, type ApplicationDataClient } from "@isle/app-sdk/data";
import { Context, Inject, type Fiber, type Plugin } from "@deepseek-ai/cordis";
import { SkillRegistry, type SkillDefinition, type SkillSummary, type SkillViewOptions } from "@deepseek-ai/dsh-skill";
import { SettingsProvider, type SettingsNamespace } from "@deepseek-ai/dsh-settings";
import { FileSettingsProvider } from "@deepseek-ai/dsh-settings-file";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { ToolRuntime, type ToolExecutionInput, type ToolExecutionResult } from "@deepseek-ai/dsh-tools";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { load as loadYaml, JSON_SCHEMA } from "js-yaml";
import { NamespacedFileSettingsProvider } from "./settings-provider.js";
import { applicationDirectory } from "./application-paths.js";

export type CordisToolSchema = ReturnType<ToolRuntime["schemas"]>[number] & {
  risk?: IsleToolRisk;
};

export type CordisApplicationId = string;

export type CordisToolCall = Readonly<{
  callId: string;
  name: string;
  arguments: unknown;
  signal?: AbortSignal;
}>;

export type CordisApplicationHostOptions = Readonly<{
  chat?: (applicationId: string) => ApplicationChatClient | undefined;
  data?: (applicationId: string) => ApplicationDataClient;
  toolPresentation?: "native" | "code" | "both";
  /** A YAML/JSON file keeps DSH's monolithic mode; a directory enables Isle namespace isolation. */
  settingsPath?: string;
  /** Desktop-owned settings, isolated by full application identity. Layout migration must run before opening the host. */
  applicationSettingsRoot?: string;
}>;

export type DshCompatBundleOptions = Readonly<{
  packageRoot: string;
  packageName: string;
  patchPath: string;
  entrySpecifier?: string;
}>;

type LoadedApplication = Readonly<{
  application: Plugin;
  fiber: Fiber;
  releaseChat?: () => void;
}>;

type BundleEntry = Readonly<{
  id: string;
  name: string;
  config?: unknown;
  group?: boolean | null;
  disabled?: boolean | null;
  inject?: unknown;
}>;

type BundlePatch = Readonly<{
  id?: string;
  insert?: unknown;
}>;

const APPLICATION_START_TIMEOUT_MS = 15_000;

class MemorySettingsProvider extends SettingsProvider {
  readonly writable = true;

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve({});
  }

  protected persist(_namespace: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve();
  }
}

/** An unused settings service stays read-only; the first actual save creates its format marker. */
class ApplicationFileSettingsProvider extends FileSettingsProvider {
  private async prepareMarker() {
    const path = this.documentPath;
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    try {
      await writeFile(path, "$isleApplicationSettings: 1\n", { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const info = await lstat(path);
      if (!info.isFile() || info.nlink > 1) throw new Error(`应用配置文件不能重定向：${path}`);
    }
  }

  protected async persist(namespace: SettingsNamespace, section: Record<string, unknown>) {
    await this.prepareMarker();
    await super.persist(namespace, section);
  }

  async prepareDocument() {
    await this.prepareMarker();
    return super.prepareDocument();
  }
}

const requiredApplicationId = (id: string) => {
  const value = id.trim();
  if (!value) throw new Error("应用 ID 不能为空。");
  return value;
};

const awaitApplicationStart = async (task: PromiseLike<unknown>, label: string) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`应用启动超时：${label}。它可能依赖 Isle 尚未提供的宿主服务。`)),
          APPLICATION_START_TIMEOUT_MS,
        );
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseBundleEntries = async (patchPath: string): Promise<BundleEntry[]> => {
  let parsed: unknown;
  try {
    parsed = loadYaml(await readFile(patchPath, "utf8"), { schema: JSON_SCHEMA });
  } catch (error) {
    throw new Error(
      `无法解析 DSH bundle patch（Isle 不执行 !!js 表达式）：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(parsed)) throw new Error("DSH bundle patch 顶层必须是数组。");

  const entries: BundleEntry[] = [];
  const appendEntries = (value: unknown, parent = "insert") => {
    if (!Array.isArray(value)) throw new Error(`DSH bundle ${parent} 必须是数组。`);
    for (const candidate of value) {
      if (!isObject(candidate)) throw new Error("DSH bundle entry 必须是对象。");
      const id = typeof candidate.id === "string" ? requiredApplicationId(candidate.id) : "";
      const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
      const group = candidate.group === true;
      const disabled = candidate.disabled === true;
      if (!id) throw new Error("DSH bundle entry 缺少 id。");
      if (group) {
        if (!disabled) appendEntries(candidate.config, `group ${id} config`);
        continue;
      }
      if (!name) throw new Error(`DSH bundle entry ${id} 缺少 name。`);
      if (!disabled) entries.push({ id, name, config: candidate.config, inject: candidate.inject });
    }
  };

  for (const candidate of parsed) {
    if (!isObject(candidate)) throw new Error("DSH bundle patch 必须由对象组成。");
    const patch = candidate as BundlePatch;
    // A bundle is applied over Isle's intentionally small empty profile. Rows
    // that only override a full DSH base entry have no target here.
    if (patch.insert !== undefined && patch.id === undefined) appendEntries(patch.insert);
  }
  if (entries.length === 0) throw new Error("DSH bundle 没有可注入 Isle 宿主的顶层 insert entry。");
  return entries;
};

const resolveBundleEntry = (entry: BundleEntry, options: DshCompatBundleOptions): string => {
  const packageRoot = resolve(options.packageRoot);
  if (entry.name === options.packageName && options.entrySpecifier) return options.entrySpecifier;
  if (entry.name.startsWith("./") || entry.name.startsWith("../")) {
    const candidate = resolve(packageRoot, entry.name);
    if (candidate !== packageRoot && !candidate.startsWith(`${packageRoot}${sep}`)) {
      throw new Error(`DSH bundle entry ${entry.id} 的相对模块越过了应用目录。`);
    }
    return candidate;
  }
  if (isAbsolute(entry.name)) throw new Error(`DSH bundle entry ${entry.id} 不允许使用绝对模块路径。`);
  try {
    return createRequire(join(packageRoot, "package.json")).resolve(entry.name);
  } catch (error) {
    throw new Error(
      `无法从应用包解析 DSH bundle entry ${entry.id} (${entry.name})：${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Resolve the entry point exported by an ESM DSH application package.
 *
 * DSH packages commonly use named `apply`/`inject` exports, while ordinary
 * Cordis packages may default-export a function, class, or object application.
 */
export const resolveCordisApplicationModule = (module: object): Plugin => {
  const namespace = module as Readonly<{ default?: unknown }>;
  for (const candidate of [namespace.default, namespace]) {
    if (
      typeof candidate === "function" ||
      (typeof candidate === "object" &&
        candidate !== null &&
        typeof (candidate as { apply?: unknown }).apply === "function")
    ) {
      return candidate as Plugin;
    }
  }
  throw new Error("模块没有导出 Cordis 应用入口；需要 default application 或具名 apply(ctx, config)。");
};

/**
 * Cordis-backed runtime kernel shared by native Isle applications and compatibility
 * adapters. Isle owns the package protocol; Cordis owns application lifecycle and
 * dependency injection.
 */
export class CordisApplicationHost {
  readonly context: Context;

  private readonly loaded = new Map<CordisApplicationId, LoadedApplication>();
  private readonly settingsScopes = new Map<string, { scope: Context; fiber: Fiber }>();
  private disposed = false;

  private constructor(
    context: Context,
    private readonly tools: ToolRuntime,
    private readonly skills: SkillRegistry,
    private readonly chatFactory?: CordisApplicationHostOptions["chat"],
    private readonly dataFactory?: CordisApplicationHostOptions["data"],
    private readonly applicationSettingsRoot?: string,
  ) {
    this.context = context;
  }

  static async create(options: CordisApplicationHostOptions = {}) {
    const context = new Context();
    try {
      if (options.settingsPath && !options.applicationSettingsRoot) {
        const settingsLocation = resolve(options.settingsPath);
        if ([".yaml", ".yml", ".json"].includes(extname(settingsLocation).toLowerCase())) {
          await context.plugin(FileSettingsProvider, {
            path: settingsLocation,
            watch: false,
          });
        } else {
          await context.plugin(NamespacedFileSettingsProvider, {
            root: settingsLocation,
          });
        }
      } else {
        await context.plugin(MemorySettingsProvider);
      }
      await context.plugin(SystemPrompt, {
        includeHarnessIdentity: false,
        includeRuntimeContext: false,
      });
      await context.plugin(ToolRuntime, {
        mode: options.toolPresentation ?? "native",
      });
      await context.plugin(SkillRegistry);

      const tools = context.get("tools");
      const skills = context.get("skills");
      if (!(tools instanceof ToolRuntime) || !(skills instanceof SkillRegistry) || !context.get("settings")) {
        throw new Error("Isle 应用 tools/skills/settings 服务没有完成初始化。");
      }
      return new CordisApplicationHost(context, tools, skills, options.chat, options.data, options.applicationSettingsRoot);
    } catch (error) {
      await context.fiber.dispose();
      throw error;
    }
  }

  get applicationIds(): readonly CordisApplicationId[] {
    return Object.freeze([...this.loaded.keys()]);
  }

  private async settingsScope(id: string): Promise<Context> {
    if (!this.applicationSettingsRoot) return this.context;
    const existing = this.settingsScopes.get(id);
    if (existing) return existing.scope;
    const directory = applicationDirectory(this.applicationSettingsRoot, id);
    for (let path = directory; ; path = dirname(path)) {
      try {
        const info = await lstat(path);
        if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`应用配置目录不能重定向：${path}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (path === this.applicationSettingsRoot || path === dirname(path)) break;
    }
    const path = join(directory, "settings.yaml");
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.nlink > 1) throw new Error(`应用配置文件不能重定向：${path}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const scope = this.context.isolate("settings");
    const fiber = scope.registry.plugin(ApplicationFileSettingsProvider, { path, watch: false });
    try {
      await awaitApplicationStart(fiber, `${id} settings`);
    } catch (error) {
      await fiber.dispose();
      throw error;
    }
    this.settingsScopes.set(id, { scope, fiber });
    return scope;
  }

  private async releaseSettings(id: string) {
    const settings = this.settingsScopes.get(id);
    this.settingsScopes.delete(id);
    await settings?.fiber.dispose();
  }

  async load(id: CordisApplicationId, application: Plugin, config?: unknown) {
    this.assertActive();
    const applicationId = requiredApplicationId(id);
    if (this.loaded.has(applicationId)) throw new Error(`应用已经加载：${applicationId}`);

    const chat =
      this.chatFactory?.(applicationId) ??
      createApplicationChatClient({
        request: async () => {
          throw new Error("当前应用运行环境未提供桌面聊天连接或应用未声明 chat 权限");
        },
        subscribe: () => () => {},
      });
    const scope = (await this.settingsScope(applicationId)).isolate("chat").isolate("storage").isolate("workspaces");
    const data =
      this.dataFactory?.(applicationId) ??
      createApplicationDataClient({
        version: 1,
        request: async () => ({
          ok: false,
          error: { code: "CAPABILITY_UNAVAILABLE", message: "当前应用运行环境未提供持久化数据连接" },
        }),
      });
    const removeStorage = scope.provide("storage", data.storage);
    const removeWorkspaces = scope.provide("workspaces", data.workspaces);
    const removeChat = chat ? scope.provide("chat", chat) : undefined;
    const releaseChat = () => {
      chat?.dispose();
      void removeChat?.();
      void removeStorage();
      void removeWorkspaces();
    };
    const fiber = scope.registry.plugin(application, config);
    try {
      await awaitApplicationStart(fiber, applicationId);
      this.assertRequiredServices(applicationId, application, undefined, scope);
      this.loaded.set(applicationId, Object.freeze({ application, fiber, releaseChat }));
    } catch (error) {
      await fiber.dispose();
      releaseChat();
      await this.releaseSettings(applicationId);
      throw error;
    }
  }

  async loadModule(id: CordisApplicationId, module: object, config?: unknown) {
    await this.load(id, resolveCordisApplicationModule(module), config);
  }

  /**
   * Load the host-side entries inserted by a standard `dsh.bundle.patch`.
   *
   * Isle deliberately supports the portable tools/skills subset here. Patch
   * overrides that target the full DSH base profile are ignored, and `!!js`
   * expressions are rejected instead of evaluated.
   */
  async loadDshBundle(id: CordisApplicationId, options: DshCompatBundleOptions) {
    this.assertActive();
    const bundleId = requiredApplicationId(id);
    const entries = await parseBundleEntries(options.patchPath);
    const modules = await Promise.all(
      entries.map(async (entry) => {
        const specifier = resolveBundleEntry(entry, options);
        const importSpecifier = specifier.startsWith("file:")
          ? specifier
          : isAbsolute(specifier)
            ? pathToFileURL(specifier).href
            : specifier;
        const imported = (await import(importSpecifier)) as object;
        return { entry, application: resolveCordisApplicationModule(imported) };
      }),
    );

    const scope = await this.settingsScope(bundleId);
    const pending = modules.map(({ entry, application }) => {
      const applicationId = `${bundleId}:${entry.id}`;
      if (this.loaded.has(applicationId)) throw new Error(`DSH 应用已经加载：${applicationId}`);
      return {
        applicationId,
        entry,
        application,
        fiber: scope.registry.plugin(application, entry.config),
      };
    });

    try {
      await awaitApplicationStart(Promise.all(pending.map(({ fiber }) => fiber.await())), bundleId);
      for (const item of pending) {
        this.assertRequiredServices(item.applicationId, item.application, item.entry.inject, scope);
      }
      for (const item of pending) {
        this.loaded.set(item.applicationId, Object.freeze({ application: item.application, fiber: item.fiber }));
      }
    } catch (error) {
      await Promise.allSettled(pending.map(({ fiber }) => fiber.dispose()));
      await this.releaseSettings(bundleId);
      throw error;
    }
  }

  /** @deprecated Load DSH bundles through ApplicationHost's DSH adapter. */
  async loadBundle(id: CordisApplicationId, options: DshCompatBundleOptions) {
    await this.loadDshBundle(id, options);
  }

  /** Load an installed package name or absolute file URL through Node ESM. */
  async loadSpecifier(id: CordisApplicationId, specifier: string | URL, config?: unknown) {
    this.assertActive();
    const importSpecifier =
      specifier instanceof URL ? specifier.href : isAbsolute(specifier) ? pathToFileURL(specifier).href : specifier;
    const module = (await import(importSpecifier)) as object;
    await this.loadModule(id, module, config);
  }

  async unload(id: CordisApplicationId) {
    const applicationId = requiredApplicationId(id);
    const loaded = this.loaded.get(applicationId);
    if (loaded) {
      this.loaded.delete(applicationId);
      await loaded.fiber.dispose();
      loaded.releaseChat?.();
      await this.releaseSettings(applicationId);
      return true;
    }
    const bundleEntries = [...this.loaded.entries()].filter(([loadedId]) => loadedId.startsWith(`${applicationId}:`));
    if (bundleEntries.length === 0) return false;
    for (const [loadedId] of bundleEntries) this.loaded.delete(loadedId);
    await Promise.all(bundleEntries.map(([, entry]) => entry.fiber.dispose()));
    await this.releaseSettings(applicationId);
    return true;
  }

  toolSchemas(): CordisToolSchema[] {
    this.assertActive();
    return this.tools.schemas().map((schema) => {
      const definition = this.tools.get(schema.name);
      const risk = definition && "risk" in definition ? definition.risk : undefined;
      if (risk === undefined) return schema;
      if (!isRiskLevel(risk)) throw new Error(`工具 ${schema.name} 的 risk 必须是 low、medium 或 high`);
      return { ...schema, risk };
    });
  }

  executeTool(call: CordisToolCall): Promise<ToolExecutionResult> {
    this.assertActive();
    const input: ToolExecutionInput = {
      callId: call.callId as ToolExecutionInput["callId"],
      name: call.name,
      arguments: call.arguments,
      signal: call.signal ?? new AbortController().signal,
    };
    return this.tools.execute(input);
  }

  listSkills(options?: SkillViewOptions): Promise<SkillSummary[]> {
    this.assertActive();
    return this.skills.list(options);
  }

  getSkill(name: string, options?: SkillViewOptions): Promise<SkillDefinition | undefined> {
    this.assertActive();
    return this.skills.get(name, options);
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const loaded = [...this.loaded.values()];
    this.loaded.clear();
    await this.context.fiber.dispose();
    this.settingsScopes.clear();
    loaded.forEach((entry) => entry.releaseChat?.());
  }

  private assertActive() {
    if (this.disposed) throw new Error("Cordis 应用宿主已经关闭。");
  }

  private assertRequiredServices(id: string, application: Plugin, entryInject?: unknown, scope = this.context) {
    const required = Inject.resolve((application as { inject?: never }).inject);
    if (entryInject !== undefined) Inject.resolve(entryInject as never, required);
    const missing = Object.keys(required).filter((name) => scope.get(name as never) === undefined);
    if (missing.length > 0) {
      throw new Error(`应用 ${id} 依赖 Isle 尚未提供的服务：${missing.join("、")}`);
    }
  }
}
