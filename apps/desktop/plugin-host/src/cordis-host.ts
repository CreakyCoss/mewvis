import { Context, Inject, type Fiber, type Plugin } from "@deepseek-ai/cordis";
import { SkillRegistry, type SkillDefinition, type SkillSummary, type SkillViewOptions } from "@deepseek-ai/dsh-skill";
import { SettingsProvider, type SettingsNamespace } from "@deepseek-ai/dsh-settings";
import { FileSettingsProvider } from "@deepseek-ai/dsh-settings-file";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { ToolRuntime, type ToolExecutionInput, type ToolExecutionResult } from "@deepseek-ai/dsh-tools";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, isAbsolute, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { load as loadYaml, JSON_SCHEMA } from "js-yaml";
import { NamespacedFileSettingsProvider } from "./settings-provider.js";

export type CordisToolSchema = ReturnType<ToolRuntime["schemas"]>[number];

export type CordisPluginId = string;

export type CordisToolCall = Readonly<{
  callId: string;
  name: string;
  arguments: unknown;
  signal?: AbortSignal;
}>;

export type CordisPluginHostOptions = Readonly<{
  toolPresentation?: "native" | "code" | "both";
  /** A YAML/JSON file keeps DSH's monolithic mode; a directory enables Isle namespace isolation. */
  settingsPath?: string;
}>;

export type DshCompatBundleOptions = Readonly<{
  packageRoot: string;
  packageName: string;
  patchPath: string;
  entrySpecifier?: string;
}>;

type LoadedPlugin = Readonly<{
  plugin: Plugin;
  fiber: Fiber;
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

const PLUGIN_START_TIMEOUT_MS = 15_000;

class MemorySettingsProvider extends SettingsProvider {
  readonly writable = true;

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve({});
  }

  protected persist(_namespace: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve();
  }
}

const requiredPluginId = (id: string) => {
  const value = id.trim();
  if (!value) throw new Error("插件 ID 不能为空。");
  return value;
};

const awaitPluginStart = async (task: PromiseLike<unknown>, label: string) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`插件启动超时：${label}。它可能依赖 Isle 尚未提供的宿主服务。`)),
          PLUGIN_START_TIMEOUT_MS,
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
      const id = typeof candidate.id === "string" ? requiredPluginId(candidate.id) : "";
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
      throw new Error(`DSH bundle entry ${entry.id} 的相对模块越过了插件目录。`);
    }
    return candidate;
  }
  if (isAbsolute(entry.name)) throw new Error(`DSH bundle entry ${entry.id} 不允许使用绝对模块路径。`);
  try {
    return createRequire(join(packageRoot, "package.json")).resolve(entry.name);
  } catch (error) {
    throw new Error(
      `无法从插件包解析 DSH bundle entry ${entry.id} (${entry.name})：${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Resolve the entry point exported by an ESM DSH plugin package.
 *
 * DSH packages commonly use named `apply`/`inject` exports, while ordinary
 * Cordis packages may default-export a function, class, or object plugin.
 */
export const resolveCordisPluginModule = (module: object): Plugin => {
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
  throw new Error("模块没有导出 Cordis 插件入口；需要 default plugin 或具名 apply(ctx, config)。");
};

/**
 * Cordis-backed runtime kernel shared by native Isle plugins and compatibility
 * adapters. Isle owns the package protocol; Cordis owns plugin lifecycle and
 * dependency injection.
 */
export class CordisPluginHost {
  readonly context: Context;

  private readonly loaded = new Map<CordisPluginId, LoadedPlugin>();
  private disposed = false;

  private constructor(
    context: Context,
    private readonly tools: ToolRuntime,
    private readonly skills: SkillRegistry,
  ) {
    this.context = context;
  }

  static async create(options: CordisPluginHostOptions = {}) {
    const context = new Context();
    try {
      if (options.settingsPath) {
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
        throw new Error("Isle 插件 tools/skills/settings 服务没有完成初始化。");
      }
      return new CordisPluginHost(context, tools, skills);
    } catch (error) {
      await context.fiber.dispose();
      throw error;
    }
  }

  get pluginIds(): readonly CordisPluginId[] {
    return Object.freeze([...this.loaded.keys()]);
  }

  async load(id: CordisPluginId, plugin: Plugin, config?: unknown) {
    this.assertActive();
    const pluginId = requiredPluginId(id);
    if (this.loaded.has(pluginId)) throw new Error(`插件已经加载：${pluginId}`);

    const fiber = this.context.registry.plugin(plugin, config);
    try {
      await awaitPluginStart(fiber, pluginId);
      this.assertRequiredServices(pluginId, plugin);
      this.loaded.set(pluginId, Object.freeze({ plugin, fiber }));
    } catch (error) {
      await fiber.dispose();
      throw error;
    }
  }

  async loadModule(id: CordisPluginId, module: object, config?: unknown) {
    await this.load(id, resolveCordisPluginModule(module), config);
  }

  /**
   * Load the host-side entries inserted by a standard `dsh.bundle.patch`.
   *
   * Isle deliberately supports the portable tools/skills subset here. Patch
   * overrides that target the full DSH base profile are ignored, and `!!js`
   * expressions are rejected instead of evaluated.
   */
  async loadDshBundle(id: CordisPluginId, options: DshCompatBundleOptions) {
    this.assertActive();
    const bundleId = requiredPluginId(id);
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
        return { entry, plugin: resolveCordisPluginModule(imported) };
      }),
    );

    const pending = modules.map(({ entry, plugin }) => {
      const pluginId = `${bundleId}:${entry.id}`;
      if (this.loaded.has(pluginId)) throw new Error(`DSH 插件已经加载：${pluginId}`);
      return {
        pluginId,
        entry,
        plugin,
        fiber: this.context.registry.plugin(plugin, entry.config),
      };
    });

    try {
      await awaitPluginStart(Promise.all(pending.map(({ fiber }) => fiber.await())), bundleId);
      for (const item of pending) {
        this.assertRequiredServices(item.pluginId, item.plugin, item.entry.inject);
      }
      for (const item of pending) {
        this.loaded.set(item.pluginId, Object.freeze({ plugin: item.plugin, fiber: item.fiber }));
      }
    } catch (error) {
      await Promise.allSettled(pending.map(({ fiber }) => fiber.dispose()));
      throw error;
    }
  }

  /** @deprecated Load DSH bundles through PluginHost's DSH adapter. */
  async loadBundle(id: CordisPluginId, options: DshCompatBundleOptions) {
    await this.loadDshBundle(id, options);
  }

  /** Load an installed package name or absolute file URL through Node ESM. */
  async loadSpecifier(id: CordisPluginId, specifier: string | URL, config?: unknown) {
    this.assertActive();
    const importSpecifier =
      specifier instanceof URL ? specifier.href : isAbsolute(specifier) ? pathToFileURL(specifier).href : specifier;
    const module = (await import(importSpecifier)) as object;
    await this.loadModule(id, module, config);
  }

  async unload(id: CordisPluginId) {
    const pluginId = requiredPluginId(id);
    const loaded = this.loaded.get(pluginId);
    if (loaded) {
      this.loaded.delete(pluginId);
      await loaded.fiber.dispose();
      return true;
    }
    const bundleEntries = [...this.loaded.entries()].filter(([loadedId]) => loadedId.startsWith(`${pluginId}:`));
    if (bundleEntries.length === 0) return false;
    for (const [loadedId] of bundleEntries) this.loaded.delete(loadedId);
    await Promise.all(bundleEntries.map(([, entry]) => entry.fiber.dispose()));
    return true;
  }

  toolSchemas(): CordisToolSchema[] {
    this.assertActive();
    return this.tools.schemas();
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
    this.loaded.clear();
    await this.context.fiber.dispose();
  }

  private assertActive() {
    if (this.disposed) throw new Error("Cordis 插件宿主已经关闭。");
  }

  private assertRequiredServices(id: string, plugin: Plugin, entryInject?: unknown) {
    const required = Inject.resolve((plugin as { inject?: never }).inject);
    if (entryInject !== undefined) Inject.resolve(entryInject as never, required);
    const missing = Object.keys(required).filter((name) => this.context.get(name as never) === undefined);
    if (missing.length > 0) {
      throw new Error(`插件 ${id} 依赖 Isle 尚未提供的服务：${missing.join("、")}`);
    }
  }
}
