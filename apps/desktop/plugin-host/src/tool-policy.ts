import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { lstat, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { dump, JSON_SCHEMA, load } from "js-yaml";
import { pluginDirectory } from "./plugin-paths.js";

// Settings namespaces accept kebab-case names only; plugins cannot register this host section.
const HOST_SECTION = "$isleHost";
export type PluginToolPolicy = { allowedToolNames: string[] };
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function parseToolPolicy(value: unknown): PluginToolPolicy {
  if (
    !object(value) ||
    Object.keys(value).some((key) => key !== "allowedToolNames") ||
    !Array.isArray(value.allowedToolNames) ||
    value.allowedToolNames.length > 1024 ||
    value.allowedToolNames.some((name) => typeof name !== "string" || !name.trim() || name.length > 256)
  )
    throw new Error("插件工具授权配置无效");
  return { allowedToolNames: [...new Set(value.allowedToolNames as string[])] };
}

async function settingsPath(root: string, pluginId: string) {
  const directory = pluginDirectory(root, pluginId);
  for (let path = directory; ; path = dirname(path)) {
    try {
      const info = await lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("插件配置目录不能重定向");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (path === resolve(root) || path === dirname(path)) break;
  }
  return join(directory, "settings.yaml");
}

async function readDocument(path: string): Promise<Record<string, unknown>> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.nlink > 1) throw new Error("插件配置文件不能重定向");
    const doc: unknown = load(await readFile(path, "utf8"), { schema: JSON_SCHEMA });
    if (!object(doc)) throw new Error("插件配置文件必须是 YAML 对象");
    return doc;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function readToolPolicy(root: string, pluginId: string): Promise<PluginToolPolicy | null> {
  const doc = await readDocument(await settingsPath(root, pluginId));
  if (!(HOST_SECTION in doc)) return null;
  const section = doc[HOST_SECTION];
  if (!object(section)) throw new Error("宿主插件配置无效");
  return "tools" in section ? parseToolPolicy(section.tools) : null;
}

export async function writeToolPolicy(root: string, pluginId: string, value: unknown): Promise<PluginToolPolicy> {
  const policy = parseToolPolicy(value);
  const path = await settingsPath(root, pluginId);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  // Use the same cross-process lock as FileSettingsProvider, preserving all business namespaces.
  await withFileLock(path, async () => {
    const doc = await readDocument(path);
    const section = doc[HOST_SECTION];
    if (section !== undefined && !object(section)) throw new Error("宿主插件配置无效");
    doc.$islePluginSettings = 1;
    doc[HOST_SECTION] = { ...(section as Record<string, unknown>), tools: policy };
    await writeFileAtomic(path, dump(doc, { schema: JSON_SCHEMA, noRefs: true, lineWidth: 120 }), {
      mode: 0o600,
      dirMode: 0o700,
    });
  });
  return policy;
}
