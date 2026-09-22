import { join } from "node:path";
import {
  createExtensionPackageManager,
  readExtensionPackage,
  resolveExtensionConfig,
} from "@isle/extension-host";
import { ExtensionViews, type ExtensionViewServices } from "./views.js";
import type { JsonObject as ExtensionConfig } from "@isle/extension-sdk";
import {
  object,
  onlyKeys,
  nonempty,
  ServiceError,
  type JsonObject,
} from "../../shared/validation.js";

/** Only this management surface can register paths. Agent command inputs never supply packages or risk grants. */
export class Extensions {
  private manager;
  private views;
  constructor(
    dataDir: string,
    bundledPath?: string,
    private services?: ExtensionViewServices,
  ) {
    this.manager = createExtensionPackageManager(
      join(dataDir, "extensions.json"),
      { bundledPath },
    );
    this.views = new ExtensionViews(this.manager, services);
  }

  list() {
    return this.manager.list().map((record) => {
      try {
        const pkg = readExtensionPackage(record.path);
        if (pkg.manifest.id !== record.id)
          throw new Error("插件身份与登记记录不一致");
        const config = resolveExtensionConfig(pkg.manifest, record.config);
        return {
          id: record.id,
          source: record.source,
          path: record.path,
          enabled: record.enabled,
          version: pkg.packageJson.version,
          description: String(pkg.packageJson.description ?? ""),
          modules: Object.keys(pkg.modules),
          capabilities: Object.entries(pkg.modules).flatMap(([kind, module]) =>
            module.capabilities.map(
              (capability: string) => `${kind}.${capability}`,
            ),
          ),
          config,
          configSchema: pkg.manifest.configuration?.schema ?? {
            type: "object",
            properties: {},
          },
          error: null,
        };
      } catch (error) {
        return {
          id: record.id,
          source: record.source,
          path: record.path,
          enabled: record.enabled,
          version: null,
          description: "",
          modules: [],
          capabilities: [],
          config: record.config ?? {},
          configSchema: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }

  private changed() {
    this.views.invalidate();
    this.services?.changed();
  }

  commands() {
    const guarded =
      (action: (input: JsonObject) => unknown) => async (input: JsonObject) => {
        try {
          return await action(input);
        } catch (error) {
          if (error instanceof ServiceError) throw error;
          throw new ServiceError(
            400,
            "EXTENSION_INVALID",
            error instanceof Error ? error.message : String(error),
          );
        }
      };
    return {
      ...this.views.commands(guarded),
      list_extensions: guarded((input) => {
        onlyKeys(input, []);
        return this.list();
      }),
      add_extension: guarded(async (input) => {
        onlyKeys(input, ["path", "config"]);
        await this.manager.add(
          nonempty(input.path, "path"),
          input.config === undefined
            ? {}
            : { config: object(input.config) as ExtensionConfig },
        );
        this.changed();
        return this.list();
      }),
      configure_extension: guarded(async (input) => {
        onlyKeys(input, ["id", "enabled", "config"]);
        if (input.enabled !== undefined && typeof input.enabled !== "boolean")
          throw new ServiceError(
            400,
            "INVALID_ARGUMENT",
            "enabled 必须为布尔值",
          );
        await this.manager.configure(nonempty(input.id, "id"), {
          ...(input.enabled !== undefined
            ? { enabled: input.enabled as boolean }
            : {}),
          ...(input.config !== undefined
            ? { config: object(input.config) as ExtensionConfig }
            : {}),
        });
        this.changed();
        return this.list();
      }),
      remove_extension: guarded(async (input) => {
        onlyKeys(input, ["id"]);
        await this.manager.remove(nonempty(input.id, "id"));
        this.changed();
        return this.list();
      }),
    };
  }
}
