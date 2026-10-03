import { APP_DISPLAY_NAME, PRODUCT_KEYS } from "@mewvis/product-config";
import type { ApplicationAdapter, RuntimeApplication } from "./contracts.js";
import type { CordisApplicationHost } from "./cordis-host.js";

/** Native Mewvis packages expose one Cordis application entry in `mewvis.app`. */
export class MewvisApplicationAdapter implements ApplicationAdapter {
  readonly kind = PRODUCT_KEYS.applicationManifest;

  constructor(private readonly cordis: CordisApplicationHost) {}

  async load(application: RuntimeApplication) {
    if (!application.entry.trim())
      throw new Error(`${APP_DISPLAY_NAME} 应用 ${application.id} 缺少入口。`);
    await this.cordis.loadSpecifier(
      application.id,
      application.entry,
      application.config ?? undefined,
    );
  }
}
