import type {
  ApplicationAdapter,
  ApplicationRuntimeKind,
  ApplicationSkillDefinition,
  ApplicationSkillSummary,
  ApplicationSkillViewOptions,
  ApplicationToolCall,
  ApplicationToolResult,
  ApplicationToolSchema,
  RuntimeApplication,
} from "./contracts.js";
import {
  CordisApplicationHost,
  type CordisApplicationHostOptions,
} from "./cordis-host.js";
import { DshApplicationAdapter } from "./dsh-compat/adapter.js";
import { MewvisApplicationAdapter } from "./application-adapter.js";

export type ApplicationHostOptions = CordisApplicationHostOptions;

const createAdapters = (cordis: CordisApplicationHost): readonly ApplicationAdapter[] => [
  new MewvisApplicationAdapter(cordis),
  new DshApplicationAdapter(cordis),
];

/**
 * Mewvis's application runtime facade. Cordis owns lifecycle and dependency injection;
 * package formats stay behind this boundary. Native Mewvis applications are ordinary
 * Cordis entry modules, while DSH bundles are loaded through the compatibility
 * adapter.
 */
export class ApplicationHost {
  private readonly adapters: ReadonlyMap<ApplicationRuntimeKind, ApplicationAdapter>;

  private constructor(private readonly cordis: CordisApplicationHost) {
    this.adapters = new Map(createAdapters(cordis).map((adapter) => [adapter.kind, adapter]));
  }

  static async create(options: ApplicationHostOptions = {}) {
    return new ApplicationHost(await CordisApplicationHost.create(options));
  }

  get applicationIds(): readonly string[] {
    return this.cordis.applicationIds;
  }

  async load(application: RuntimeApplication) {
    const adapter = this.adapters.get(application.kind);
    if (!adapter) throw new Error(`不支持的应用运行时：${String(application.kind)}`);
    await adapter.load(application);
  }

  unload(id: string) {
    return this.cordis.unload(id);
  }

  toolSchemas(): ApplicationToolSchema[] {
    return this.cordis.toolSchemas();
  }

  executeTool(call: ApplicationToolCall): Promise<ApplicationToolResult> {
    return this.cordis.executeTool(call) as unknown as Promise<ApplicationToolResult>;
  }

  listSkills(options?: ApplicationSkillViewOptions): Promise<ApplicationSkillSummary[]> {
    return this.cordis.listSkills(options) as unknown as Promise<ApplicationSkillSummary[]>;
  }

  getSkill(name: string, options?: ApplicationSkillViewOptions): Promise<ApplicationSkillDefinition | undefined> {
    return this.cordis.getSkill(name, options) as unknown as Promise<ApplicationSkillDefinition | undefined>;
  }

  dispose() {
    return this.cordis.dispose();
  }
}
