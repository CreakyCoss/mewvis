import { join } from "node:path";
import {
  createExtensionPackageManager,
  readExtensionPackage,
  resolveExtensionPackages,
} from "@isle/extension-host";
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
  constructor(dataDir: string, bundledPath?: string) {
    this.manager = createExtensionPackageManager(
      join(dataDir, "extensions.json"),
      { bundledPath },
    );
  }

  list() {
    return this.manager.list().map((record) => {
      try {
        const pkg = readExtensionPackage(record.path);
        if (pkg.manifest.id !== record.id)
          throw new Error("插件身份与登记记录不一致");
        const [source] = resolveExtensionPackages([
          { path: record.path, config: record.config },
        ]);
        return {
          id: record.id,
          source: record.source,
          path: record.path,
          enabled: record.enabled,
          version: pkg.packageJson.version,
          description: String(pkg.packageJson.description ?? ""),
          capabilities: pkg.manifest.capabilities,
          config: source.config ?? {},
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
          capabilities: [],
          config: record.config ?? {},
          configSchema: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
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
        return this.list();
      }),
      remove_extension: guarded(async (input) => {
        onlyKeys(input, ["id"]);
        await this.manager.remove(nonempty(input.id, "id"));
        return this.list();
      }),
    };
  }
}
