import type { Context } from "@deepseek-ai/cordis";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { SettingsProvider, type SettingsNamespace } from "@deepseek-ai/dsh-settings";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { dump, JSON_SCHEMA, load as loadYaml } from "js-yaml";

const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/;
const SETTINGS_FILENAME = "settings.yaml";

type JsonObject = Record<string, unknown>;

export type NamespacedSettingsProviderConfig = Readonly<{
  root: string;
}>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isENOENT = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

const readOptionalText = async (path: string) => {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isENOENT(error)) return undefined;
    throw error;
  }
};

const parseObject = (text: string, path: string) => {
  let parsed: unknown;
  try {
    parsed = text.trim() ? loadYaml(text, { schema: JSON_SCHEMA }) : {};
  } catch (error) {
    throw new Error(`插件设置文件无法解析：${path}：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isObject(parsed)) throw new Error(`插件设置文件必须是 YAML 对象：${path}`);
  return parsed;
};

const renderObject = (value: JsonObject) =>
  dump(value, {
    schema: JSON_SCHEMA,
    noRefs: true,
    lineWidth: 120,
    quotingType: '"',
  });

/**
 * Isle's namespaced settings provider for Cordis plugins.
 *
 * Plugins own ordinary kebab-case settings namespaces. Isle maps
 * each namespace to `<root>/<namespace>/settings.yaml`, keeping the DSH
 * the settings contract to physically isolated plugin data.
 */
export class NamespacedFileSettingsProvider extends SettingsProvider {
  readonly writable = true;

  private readonly root: string;

  constructor(ctx: Context, config: NamespacedSettingsProviderConfig) {
    super(ctx);
    this.root = resolve(config.root);
  }

  protected async load(): Promise<Record<string, unknown>> {
    let entries;
    try {
      entries = await readdir(this.root, { withFileTypes: true });
    } catch (error) {
      if (isENOENT(error)) return {};
      throw error;
    }

    const document: Record<string, unknown> = {};
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isDirectory() || !NAMESPACE_PATTERN.test(entry.name)) continue;
      const path = this.pathFor(entry.name);
      const text = await readOptionalText(path);
      if (text === undefined) continue;
      document[entry.name] = parseObject(text, path);
    }
    return document;
  }

  protected async persist(namespace: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    const path = this.pathFor(namespace);
    await mkdir(join(this.root, namespace), { recursive: true, mode: 0o700 });
    await withFileLock(path, () =>
      writeFileAtomic(path, renderObject(section), {
        mode: 0o600,
        dirMode: 0o700,
      }),
    );
  }

  private pathFor(namespace: string) {
    if (!NAMESPACE_PATTERN.test(namespace)) throw new Error(`非法插件设置 namespace：${namespace}`);
    return join(this.root, namespace, SETTINGS_FILENAME);
  }
}
