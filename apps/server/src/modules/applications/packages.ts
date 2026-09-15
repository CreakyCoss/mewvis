import * as fs from "node:fs/promises";
import { join, basename, relative, dirname } from "node:path";
import {
  exists,
  root,
  safePath,
  under,
} from "../../infrastructure/filesystem/paths.js";
import {
  jsonOptional,
  jsonWrite,
} from "../../infrastructure/filesystem/json.js";
import { invalid, nonempty, ServiceError } from "../../shared/validation.js";

export function applicationDirectory(root: string, id: string) {
  const component = (s: string) =>
    [...Buffer.from(s)]
      .map((b, i) =>
        ((b >= 97 && b <= 122) ||
          (b >= 48 && b <= 57) ||
          b === 45 ||
          b === 95) &&
        !(
          i === 0 &&
          /^(data|packages|pnpm-store|con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(
            s,
          )
        )
          ? String.fromCharCode(b)
          : "%" + b.toString(16).padStart(2, "0"),
      )
      .join("");
  const scoped = /^@([^/]+)\/([^/]+)$/.exec(id);
  const parts = scoped
    ? ["@" + component(scoped[1]), component(scoped[2])]
    : [component(id)];
  if (!id || parts.some((p) => p.length > 200))
    return join(
      root,
      ".ids",
      ...(id
        ? Buffer.from(id)
            .toString("hex")
            .match(/.{1,96}/g)!
        : ["empty"]),
    );
  return join(root, ...parts);
}
const permissions = [
  "network",
  "application-data",
  "application-workspaces",
  "workspace-files",
  "open-external",
  "process",
  "chat",
  "chat-knowledge",
];
export type Application = Record<string, any>;
export async function assertApplicationPath(base: string, path: string) {
  let current = path;
  while (current !== dirname(base)) {
    if (await exists(current)) {
      const s = await fs.lstat(current);
      if (s.isSymbolicLink()) invalid("应用路径不能包含符号链接");
    }
    if (current === dirname(current)) break;
    current = dirname(current);
  }
}

export async function readPackage(
  path: string,
  source = "installed",
): Promise<Application> {
  path = await root(path);
  const manifest = await jsonOptional(join(path, "package.json"));
  if (!manifest) invalid("应用缺少 package.json");
  const id = nonempty(manifest.name, "name"),
    isle = manifest.isle ?? {},
    declared = Array.isArray(isle.permissions);
  if (isle.permissions != null && !declared)
    invalid("isle.permissions 必须是数组");
  const list = isle.permissions ?? [];
  if (
    new Set(list).size !== list.length ||
    list.some((p: unknown) => !permissions.includes(String(p)))
  )
    invalid("isle.permissions 无效或重复");
  async function file(value: string) {
    const p = await safePath(path, value);
    if (!(await fs.stat(p)).isFile()) invalid("应用入口必须是文件");
    return p;
  }
  let runtimeKind: string,
    entry = "";
  let patchPath: string | null = null;
  if (manifest.dsh?.bundle?.patch)
    patchPath = await file(manifest.dsh.bundle.patch);
  if (isle.app) {
    if (isle.app.version !== 1) invalid("不支持的 Isle 应用协议版本");
    runtimeKind = "isle";
    entry = await file(nonempty(isle.app.entry, "isle.app.entry"));
  } else if (patchPath) {
    runtimeKind = "dsh";
    const resolveExport = (value: any): string | undefined =>
      typeof value === "string"
        ? value
        : value && typeof value === "object"
          ? resolveExport(
              value["."] ?? value.import ?? value.default ?? value.require,
            )
          : undefined;
    const main = manifest.main ?? resolveExport(manifest.exports);
    if (main) entry = await file(main);
  } else invalid("应用缺少 isle.app 或 DSH bundle 声明");
  const permissionStatus = declared
    ? "declared"
    : runtimeKind === "isle"
      ? "isle-upgrade-required"
      : "dsh-unsupported";
  return {
    id,
    name: isle.displayName ?? id,
    version: manifest.version ?? "",
    description: manifest.description ?? "",
    source,
    enabled: false,
    defaultEnabled: isle.defaultEnabled ?? false,
    path,
    runtimeKind,
    entry,
    patchPath,
    compatibility: patchPath ? [{ adapter: "dsh" }] : [],
    permissions: list,
    agentAccess: isle.agentAccess ?? null,
    permissionStatus,
    origin: await jsonOptional(join(path, ".isle-origin.json")),
  };
}
export function descriptor(application: Application) {
  const { patchPath, ...value } = application;
  return value;
}
export function installable(a: Application) {
  if (a.permissionStatus === "isle-upgrade-required")
    invalid("请为 Isle 应用声明 isle.permissions，没有额外权限时声明空数组");
}
export async function copyPackage(
  source: string,
  dest: string,
  includeDependencies = false,
) {
  let bytes = 0,
    count = 0;
  async function copy(from: string, to: string) {
    for (const e of await fs.readdir(from, { withFileTypes: true })) {
      if (
        e.name === ".git" ||
        (!includeDependencies && e.name === "node_modules")
      )
        continue;
      const p = join(from, e.name),
        q = join(to, e.name);
      if (e.isSymbolicLink()) invalid("应用安装包不能包含符号链接");
      if (++count > (includeDependencies ? 100000 : 20000))
        invalid("应用文件数量超过限制");
      if (e.isDirectory()) {
        await fs.mkdir(q);
        await copy(p, q);
      } else if (e.isFile()) {
        const s = await fs.stat(p);
        bytes += s.size;
        if (bytes > (includeDependencies ? 768 : 256) * 1024 * 1024)
          invalid("应用大小超过限制");
        await fs.copyFile(p, q, fs.constants.COPYFILE_EXCL);
      } else invalid("应用包不能包含特殊文件");
    }
  }
  await copy(source, dest);
}
export class Packages {
  constructor(
    readonly path: string,
    private bundled?: string,
  ) {}
  async registry() {
    await assertApplicationPath(this.path, join(this.path, "registry.json"));
    const registry = (await jsonOptional(join(this.path, "registry.json"))) ?? {
      schemaVersion: 1,
      enabled: {},
    };
    if (
      registry.schemaVersion !== 1 ||
      !registry.enabled ||
      typeof registry.enabled !== "object"
    )
      invalid("应用登记格式无效");
    return registry;
  }
  async list(): Promise<Application[]> {
    const found = new Map<string, Application>();
    if (this.bundled && (await exists(this.bundled)))
      for (const e of await fs.readdir(this.bundled, { withFileTypes: true })) {
        if (e.isDirectory() && !e.name.startsWith(".")) {
          const p = await readPackage(join(this.bundled, e.name), "bundled");
          found.set(p.id, p);
        }
      }
    const scan = async (path: string, depth = 0) => {
      if (!(await exists(path)) || depth > 20) return;
      for (const e of await fs.readdir(path, { withFileTypes: true })) {
        if (e.isSymbolicLink()) continue;
        if (!e.isDirectory() || (e.name.startsWith(".") && e.name !== ".ids"))
          continue;
        const child = join(path, e.name);
        if (await exists(join(child, "package", "package.json"))) {
          const p = await readPackage(join(child, "package"));
          if (applicationDirectory(this.path, p.id) !== child)
            invalid("应用 ID 与安装目录不一致");
          found.set(p.id, p);
        } else if (
          e.name.startsWith("@") ||
          e.name === ".ids" ||
          path.includes("/.ids")
        )
          await scan(child, depth + 1);
      }
    };
    await scan(this.path);
    const r = await this.registry();
    return [...found.values()]
      .map((p): Application => ({
        ...p,
        enabled:
          p.permissionStatus !== "isle-upgrade-required" &&
          (r.enabled[p.id] ?? p.defaultEnabled),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  async get(id: unknown) {
    const value = (await this.list()).find(
      (p) => p.id === nonempty(id, "applicationId"),
    );
    if (!value) throw new ServiceError(404, "NOT_FOUND", "应用不存在");
    return value;
  }
  async authorize(id: unknown, permission?: string) {
    const p = await this.get(id);
    if (
      !p.enabled ||
      p.permissionStatus !== "declared" ||
      (permission && !p.permissions.includes(permission))
    )
      throw new ServiceError(
        403,
        "PERMISSION_DENIED",
        "应用未启用或未声明所需权限",
      );
    return p;
  }
  async enable(id: unknown, enabled: boolean): Promise<Application> {
    const p = await this.get(id);
    if (typeof enabled !== "boolean") invalid("enabled 必须是布尔值");
    if (enabled) installable(p);
    const r = await this.registry();
    Object.defineProperty(r.enabled, p.id, {
      value: enabled,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    await jsonWrite(join(this.path, "registry.json"), r);
    return { ...p, enabled };
  }
  async install(source: string, enable?: boolean, dependencies = false) {
    const p = await readPackage(source);
    installable(p);
    const namespace = applicationDirectory(this.path, p.id),
      dest = join(namespace, "package");
    await assertApplicationPath(this.path, dest);
    if (
      relative(source, namespace) === "" ||
      !relative(source, namespace).startsWith("..")
    )
      invalid("应用源目录不能包含安装目录");
    if (await exists(dest))
      throw new ServiceError(409, "CONFLICT", "应用已安装");
    await fs.mkdir(namespace, { recursive: true });
    const stage = await fs.mkdtemp(join(namespace, ".install-"));
    try {
      await copyPackage(source, stage, dependencies);
      await readPackage(stage);
      await fs.rename(stage, dest);
      try {
        return await this.enable(
          p.id,
          p.runtimeKind === "isle" && (enable ?? true),
        );
      } catch (error) {
        await fs.rm(dest, { recursive: true, force: true });
        throw error;
      }
    } finally {
      await fs.rm(stage, { recursive: true, force: true });
    }
  }
  async remove(id: unknown) {
    const p = await this.get(id);
    if (p.source !== "installed") invalid("内置应用不能移除");
    const expected = join(applicationDirectory(this.path, p.id), "package");
    await assertApplicationPath(this.path, expected);
    if (p.path !== expected) invalid("应用安装路径异常");
    const registry = await this.registry();
    delete registry.enabled[p.id];
    const tomb = expected + ".remove";
    if (await exists(tomb))
      throw new ServiceError(409, "CONFLICT", "上次应用移除尚未清理");
    await fs.rename(expected, tomb);
    try {
      await jsonWrite(join(this.path, "registry.json"), registry);
    } catch (e) {
      await fs.rename(tomb, expected);
      throw e;
    }
    await fs.rm(tomb, { recursive: true });
    return { id: p.id, path: expected };
  }
}
