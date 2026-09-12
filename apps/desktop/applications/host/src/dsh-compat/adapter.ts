import type { ApplicationAdapter, RuntimeApplication } from "../contracts.js";
import type { CordisApplicationHost } from "../cordis-host.js";

/** Converts a standard DSH bundle into applications mounted on Isle's Cordis host. */
export class DshApplicationAdapter implements ApplicationAdapter {
  readonly kind = "dsh" as const;

  constructor(private readonly cordis: CordisApplicationHost) {}

  async load(application: RuntimeApplication) {
    if (!application.patchPath?.trim()) throw new Error(`DSH 兼容应用 ${application.id} 缺少 bundle patch。`);
    await this.cordis.loadDshBundle(application.id, {
      packageRoot: application.packageRoot,
      packageName: application.id,
      patchPath: application.patchPath,
      entrySpecifier: application.entry || undefined,
    });
  }
}
