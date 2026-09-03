import type { PluginAdapter, RuntimePlugin } from "../contracts.js";
import type { CordisPluginHost } from "../cordis-host.js";

/** Converts a standard DSH bundle into plugins mounted on Isle's Cordis host. */
export class DshPluginAdapter implements PluginAdapter {
  readonly kind = "dsh" as const;

  constructor(private readonly cordis: CordisPluginHost) {}

  async load(plugin: RuntimePlugin) {
    if (!plugin.patchPath?.trim()) throw new Error(`DSH 兼容插件 ${plugin.id} 缺少 bundle patch。`);
    await this.cordis.loadDshBundle(plugin.id, {
      packageRoot: plugin.packageRoot,
      packageName: plugin.id,
      patchPath: plugin.patchPath,
      entrySpecifier: plugin.entry || undefined,
    });
  }
}
