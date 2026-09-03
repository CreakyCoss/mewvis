import type {
  PluginAdapter,
  PluginRuntimeKind,
  PluginSkillDefinition,
  PluginSkillSummary,
  PluginSkillViewOptions,
  PluginToolCall,
  PluginToolResult,
  PluginToolSchema,
  RuntimePlugin,
} from "./contracts.js";
import {
  CordisPluginHost,
  type CordisPluginHostOptions,
} from "./cordis-host.js";
import { DshPluginAdapter } from "./dsh-compat/adapter.js";
import { IslePluginAdapter } from "./isle-adapter.js";

export type PluginHostOptions = CordisPluginHostOptions;

const createAdapters = (cordis: CordisPluginHost): readonly PluginAdapter[] => [
  new IslePluginAdapter(cordis),
  new DshPluginAdapter(cordis),
];

/**
 * Isle's plugin runtime facade. Cordis owns lifecycle and dependency injection;
 * package formats stay behind this boundary. Native Isle plugins are ordinary
 * Cordis entry modules, while DSH bundles are loaded through the compatibility
 * adapter.
 */
export class PluginHost {
  private readonly adapters: ReadonlyMap<PluginRuntimeKind, PluginAdapter>;

  private constructor(private readonly cordis: CordisPluginHost) {
    this.adapters = new Map(createAdapters(cordis).map((adapter) => [adapter.kind, adapter]));
  }

  static async create(options: PluginHostOptions = {}) {
    return new PluginHost(await CordisPluginHost.create(options));
  }

  get pluginIds(): readonly string[] {
    return this.cordis.pluginIds;
  }

  async load(plugin: RuntimePlugin) {
    const adapter = this.adapters.get(plugin.kind);
    if (!adapter) throw new Error(`不支持的插件运行时：${String(plugin.kind)}`);
    await adapter.load(plugin);
  }

  unload(id: string) {
    return this.cordis.unload(id);
  }

  toolSchemas(): PluginToolSchema[] {
    return this.cordis.toolSchemas();
  }

  executeTool(call: PluginToolCall): Promise<PluginToolResult> {
    return this.cordis.executeTool(call) as unknown as Promise<PluginToolResult>;
  }

  listSkills(options?: PluginSkillViewOptions): Promise<PluginSkillSummary[]> {
    return this.cordis.listSkills(options) as unknown as Promise<PluginSkillSummary[]>;
  }

  getSkill(name: string, options?: PluginSkillViewOptions): Promise<PluginSkillDefinition | undefined> {
    return this.cordis.getSkill(name, options) as unknown as Promise<PluginSkillDefinition | undefined>;
  }

  dispose() {
    return this.cordis.dispose();
  }
}
