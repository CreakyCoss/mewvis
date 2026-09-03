import type { PluginAdapter, RuntimePlugin } from "./contracts.js";
import type { CordisPluginHost } from "./cordis-host.js";

/** Native Isle packages expose one Cordis plugin entry in `isle.plugin`. */
export class IslePluginAdapter implements PluginAdapter {
  readonly kind = "isle" as const;

  constructor(private readonly cordis: CordisPluginHost) {}

  async load(plugin: RuntimePlugin) {
    if (!plugin.entry.trim()) throw new Error(`Isle 插件 ${plugin.id} 缺少入口。`);
    await this.cordis.loadSpecifier(plugin.id, plugin.entry, plugin.config ?? undefined);
  }
}
