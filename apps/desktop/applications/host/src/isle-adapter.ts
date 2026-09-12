import type { ApplicationAdapter, RuntimeApplication } from "./contracts.js";
import type { CordisApplicationHost } from "./cordis-host.js";

/** Native Isle packages expose one Cordis application entry in `isle.app`. */
export class IsleApplicationAdapter implements ApplicationAdapter {
  readonly kind = "isle" as const;

  constructor(private readonly cordis: CordisApplicationHost) {}

  async load(application: RuntimeApplication) {
    if (!application.entry.trim()) throw new Error(`Isle 应用 ${application.id} 缺少入口。`);
    await this.cordis.loadSpecifier(application.id, application.entry, application.config ?? undefined);
  }
}
