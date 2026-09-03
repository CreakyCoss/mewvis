import type { Context } from "@deepseek-ai/cordis";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { SettingsProvider, deepEqualJson, type SettingsNamespace } from "@deepseek-ai/dsh-settings";
import { access, mkdir, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { dump, JSON_SCHEMA, load as loadYaml } from "js-yaml";

const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/;
const SETTINGS_FILENAME = "settings.yaml";
const LEGACY_BACKUP_SUFFIX = ".pre-namespace-migration.bak";

type JsonObject = Record<string, unknown>;

export type NamespacedSettingsProviderConfig = Readonly<{
  root: string;
  legacyPath?: string;
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
 * Isle's DSH settings provider.
 *
 * DSH plugins still own ordinary kebab-case settings namespaces. Isle maps
 * each namespace to `<root>/<namespace>/settings.yaml`, keeping the DSH
 * contract intact while physically isolating plugin data.
 */
export class NamespacedFileSettingsProvider extends SettingsProvider {
  readonly writable = true;

  private readonly root: string;
  private readonly legacyPath: string;

  constructor(ctx: Context, config: NamespacedSettingsProviderConfig) {
    super(ctx);
    this.root = resolve(config.root);
    this.legacyPath = resolve(config.legacyPath ?? join(this.root, SETTINGS_FILENAME));
  }

  protected async load(): Promise<Record<string, unknown>> {
    await this.migrateLegacyDocument();
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

  private async migrateLegacyDocument() {
    const initial = await readOptionalText(this.legacyPath);
    if (initial === undefined || !initial.trim()) return;

    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await withFileLock(this.legacyPath, async () => {
      const legacyText = await readOptionalText(this.legacyPath);
      if (legacyText === undefined || !legacyText.trim()) return;
      const legacy = parseObject(legacyText, this.legacyPath);
      const remaining = { ...legacy };
      let changed = false;

      const backupPath = `${this.legacyPath}${LEGACY_BACKUP_SUFFIX}`;
      try {
        await access(backupPath);
      } catch (error) {
        if (!isENOENT(error)) throw error;
        await writeFileAtomic(backupPath, legacyText, { mode: 0o600, dirMode: 0o700 });
      }

      for (const [namespace, section] of Object.entries(legacy)) {
        if (!NAMESPACE_PATTERN.test(namespace) || !isObject(section)) continue;
        const targetPath = this.pathFor(namespace);
        await mkdir(join(this.root, namespace), { recursive: true, mode: 0o700 });
        let migrated = false;

        await withFileLock(targetPath, async () => {
          const targetText = await readOptionalText(targetPath);
          if (targetText === undefined) {
            await writeFileAtomic(targetPath, renderObject(section), { mode: 0o600, dirMode: 0o700 });
            migrated = true;
            return;
          }
          const target = parseObject(targetText, targetPath);
          if (deepEqualJson(target, section)) {
            migrated = true;
            return;
          }
          this.ctx.logger.warn(
            "插件设置迁移跳过 namespace %s：独立文件与旧共享文件内容不同（%s）",
            namespace,
            targetPath,
          );
        });

        if (migrated) {
          delete remaining[namespace];
          changed = true;
          this.ctx.logger.info("插件设置 namespace %s 已迁移到 %s", namespace, targetPath);
        }
      }

      if (changed) {
        await writeFileAtomic(this.legacyPath, renderObject(remaining), {
          mode: 0o600,
          dirMode: 0o700,
        });
      }
    });
  }
}
