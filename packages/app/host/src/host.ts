import type {
  ApplicationAdapter,
  ApplicationRuntimeKind,
  ApplicationRuntimeResources,
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
import { existsSync } from "node:fs";
import { dirname } from "node:path";

export type ApplicationHostOptions = CordisApplicationHostOptions;

const createAdapters = (
  cordis: CordisApplicationHost,
): readonly ApplicationAdapter[] => [
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
  private readonly declarations = new Map<
    string,
    { tools: Set<string>; skills: Set<string> }
  >();
  private readonly adapters: ReadonlyMap<
    ApplicationRuntimeKind,
    ApplicationAdapter
  >;

  private constructor(private readonly cordis: CordisApplicationHost) {
    this.adapters = new Map(
      createAdapters(cordis).map((adapter) => [adapter.kind, adapter]),
    );
  }

  static async create(options: ApplicationHostOptions = {}) {
    return new ApplicationHost(await CordisApplicationHost.create(options));
  }

  get applicationIds(): readonly string[] {
    return this.cordis.applicationIds;
  }

  async load(application: RuntimeApplication) {
    const adapter = this.adapters.get(application.kind);
    if (!adapter)
      throw new Error(`不支持的应用运行时：${String(application.kind)}`);
    const tools = new Set(this.toolSchemas().map((tool) => tool.name));
    const skills = new Set(
      (await this.listSkills()).map((skill) => skill.name),
    );
    await adapter.load(application);
    this.declarations.set(application.id, {
      tools: new Set(
        this.toolSchemas()
          .filter((tool) => !tools.has(tool.name))
          .map((tool) => tool.name),
      ),
      skills: new Set(
        (await this.listSkills())
          .filter((skill) => !skills.has(skill.name))
          .map((skill) => skill.name),
      ),
    });
  }

  async unload(id: string) {
    const removed = await this.cordis.unload(id);
    this.declarations.delete(id);
    return removed;
  }

  async runtimeResources(
    id: string,
    options?: ApplicationSkillViewOptions,
  ): Promise<ApplicationRuntimeResources> {
    const names = this.declarations.get(id);
    if (!names) throw new Error(`应用未加载：${id}`);
    const skills: ApplicationRuntimeResources["skills"][number][] = [];
    for (const summary of await this.listSkills(options)) {
      if (!names.skills.has(summary.name)) continue;
      const skill = await this.getSkill(summary.name, options);
      const baseDir =
        skill?.resourceBase?.kind === "directory"
          ? skill.resourceBase.path
          : skill?.path && existsSync(skill.path)
            ? dirname(skill.path)
            : undefined;
      if (skill)
        skills.push({
          name: skill.name,
          description: skill.description,
          content: skill.content,
          modelInvocable: skill.invocation.modelInvocable,
          ...(baseDir ? { baseDir } : {}),
        });
    }
    return {
      id,
      tools: this.toolSchemas().filter((tool) => names.tools.has(tool.name)),
      skills,
    };
  }

  toolSchemas(): ApplicationToolSchema[] {
    return this.cordis.toolSchemas();
  }

  executeTool(call: ApplicationToolCall): Promise<ApplicationToolResult> {
    return this.cordis.executeTool(
      call,
    ) as unknown as Promise<ApplicationToolResult>;
  }

  listSkills(
    options?: ApplicationSkillViewOptions,
  ): Promise<ApplicationSkillSummary[]> {
    return this.cordis.listSkills(options) as unknown as Promise<
      ApplicationSkillSummary[]
    >;
  }

  getSkill(
    name: string,
    options?: ApplicationSkillViewOptions,
  ): Promise<ApplicationSkillDefinition | undefined> {
    return this.cordis.getSkill(name, options) as unknown as Promise<
      ApplicationSkillDefinition | undefined
    >;
  }

  dispose() {
    this.declarations.clear();
    return this.cordis.dispose();
  }
}
