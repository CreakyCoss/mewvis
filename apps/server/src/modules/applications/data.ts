import * as fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  Packages,
  applicationDirectory,
  assertApplicationPath,
} from "./packages.js";
import { exists, safePath } from "../../infrastructure/filesystem/paths.js";
import {
  jsonOptional,
  jsonWrite,
} from "../../infrastructure/filesystem/json.js";
import { Serial } from "../../shared/serial.js";
import {
  invalid,
  object,
  onlyKeys,
  nonempty,
  ServiceError,
  type JsonObject,
} from "../../shared/validation.js";
import {
  normalizeWorkspacePath,
  initializeWorkspaceDirectory,
} from "../../storage/workspace.js";

import type { EventHub } from "../../infrastructure/events/event-hub.js";
function fail(code: string, message: string): never {
  throw new ServiceError(400, code, message);
}
export class ApplicationData {
  private connections = new Map<string, string>();
  private serial = new Serial();
  private pending = new Map<
    string,
    {
      owner: string;
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  constructor(
    private packages: Packages,
    private events: EventHub,
  ) {}
  async connect(id: unknown) {
    const p = await this.packages.authorize(id);
    if (
      !p.permissions.some((x: string) =>
        ["application-data", "application-workspaces"].includes(x),
      )
    )
      fail("PERMISSION_DENIED", "应用未声明 SDK 数据权限");
    if (this.connections.size >= 4096)
      fail("CONNECTION_LIMIT", "应用数据连接过多");
    const token = randomUUID();
    this.connections.set(token, p.id);
    return token;
  }
  disconnect(connection: unknown) {
    this.connections.delete(nonempty(connection, "connection"));
  }
  revoke(id: string) {
    for (const [key, owner] of this.connections)
      if (owner === id) this.connections.delete(key);
    for (const [key, p] of this.pending)
      if (p.owner === id) {
        clearTimeout(p.timer);
        this.pending.delete(key);
        p.reject(new ServiceError(403, "PERMISSION_DENIED", "应用已停用"));
      }
  }
  close() {
    for (const id of new Set(this.connections.values())) this.revoke(id);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Server 已关闭"));
    }
    this.pending.clear();
  }
  private ask(owner: string, kind: string, details: JsonObject): Promise<any> {
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          new ServiceError(
            408,
            "CONFIRMATION_UNAVAILABLE",
            "宿主未在 60 秒内回应",
          ),
        );
      }, 60000);
      timer.unref();
      this.pending.set(requestId, { owner, resolve, reject, timer });
      this.events.publish("application-workspace:interaction", {
        requestId,
        applicationId: owner,
        kind,
        ...details,
      });
    });
  }
  answer(i: JsonObject) {
    onlyKeys(i, ["requestId", "value"]);
    const id = nonempty(i.requestId, "requestId"),
      p = this.pending.get(id);
    if (!p) fail("CONFIRMATION_UNAVAILABLE", "交互已结束");
    clearTimeout(p.timer);
    this.pending.delete(id);
    p.resolve(i.value);
    return null;
  }
  private async db(owner: string, create = false) {
    const directory = applicationDirectory(this.packages.path, owner);
    await assertApplicationPath(this.packages.path, directory);
    await fs.mkdir(this.packages.path, { recursive: true });
    const checked = await safePath(
      this.packages.path,
      directory.slice(this.packages.path.length + 1),
    );
    if (checked !== directory)
      fail("STORAGE_ERROR", "应用数据目录不能是符号链接");
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      const path = join(directory, "storage.sqlite" + suffix);
      if (
        (await exists(path)) &&
        ((await fs.lstat(path)).isSymbolicLink() ||
          (await fs.lstat(path)).nlink > 1)
      )
        fail("STORAGE_ERROR", "应用数据库不能是符号链接");
    }
    const path = join(directory, "storage.sqlite");
    if (!create && !(await exists(path))) return null;
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(path);
    try {
      db.exec("PRAGMA busy_timeout=100");
      const version = Number(
          db.prepare("PRAGMA user_version").get()!.user_version,
        ),
        ownerId = Number(
          db.prepare("PRAGMA application_id").get()!.application_id,
        );
      if (version > 2 || ![0, 0x49534c50].includes(ownerId))
        fail("STORAGE_ERROR", "应用数据库版本不可用");
      if (version < 2)
        db.exec(
          `BEGIN IMMEDIATE;CREATE TABLE IF NOT EXISTS application_kv(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS application_workspaces(id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,path TEXT UNIQUE NOT NULL,is_default INTEGER NOT NULL CHECK(is_default IN(0,1)));CREATE UNIQUE INDEX IF NOT EXISTS application_workspace_default ON application_workspaces(is_default) WHERE is_default=1;PRAGMA application_id=1230195792;PRAGMA user_version=2;COMMIT;`,
        );
      await fs.chmod(path, 0o600);
      return db;
    } catch (e) {
      db.close();
      throw e;
    }
  }
  private async records(owner: string) {
    const db = await this.db(owner);
    try {
      return (
        db
          ?.prepare(
            "SELECT id,name,path,is_default FROM application_workspaces ORDER BY is_default DESC,rowid",
          )
          .all()
          .map((r) => ({
            id: String(r.id),
            name: String(r.name),
            path: String(r.path),
            isDefault: !!r.is_default,
          })) ?? []
      );
    } finally {
      db?.close();
    }
  }
  private async marker(path: string) {
    const target = join(path, ".mewvis", "workspace.json");
    if (
      (await exists(join(path, ".mewvis"))) &&
      (await fs.lstat(join(path, ".mewvis"))).isSymbolicLink()
    )
      fail("WORKSPACE_MARKER_INVALID", "工作区标识目录不能是符号链接");
    if (await exists(target)) {
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024)
        fail("WORKSPACE_MARKER_INVALID", "工作区标识文件无效");
    }
    const marker = await jsonOptional(target);
    if (
      marker &&
      (marker.version !== 1 ||
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(marker.id) ||
        !Array.isArray(marker.applications) ||
        marker.applications.length > 1024 ||
        new Set(marker.applications).size !== marker.applications.length ||
        marker.applications.some(
          (id: any) =>
            typeof id !== "string" ||
            !id ||
            id.length > 512 ||
            /[\x00-\x1f]/.test(id),
        ))
    )
      fail("WORKSPACE_MARKER_INVALID", "工作区标识格式无效");
    return marker;
  }
  private async validate(owner: string, r: any) {
    if (
      !(await exists(r.path)) ||
      (await normalizeWorkspacePath(r.path)) !== r.path
    )
      fail("WORKSPACE_UNAVAILABLE", "工作区已丢失或移动");
    const m = await this.marker(r.path);
    if (!m || m.id !== r.id || !m.applications.includes(owner))
      fail("WORKSPACE_MARKER_INVALID", "工作区标识与登记不一致");
  }
  private async create(
    owner: string,
    name: string,
    selected: string,
    check: () => Promise<void>,
    defaultOnly = false,
  ) {
    const path = await normalizeWorkspacePath(selected),
      snapshot = await this.marker(path),
      records = await this.records(owner);
    const prior = records.find((r) => r.path === path);
    if (prior) {
      await this.validate(owner, prior);
      return prior;
    }
    if (snapshot && records.some((r) => r.id === snapshot.id))
      fail("WORKSPACE_MARKER_INVALID", "已登记的标识不能绑定其他路径");
    if (snapshot) {
      if (defaultOnly)
        fail("CONFIRMATION_UNAVAILABLE", "默认工作区包含未登记标识");
      if (
        (await this.ask(owner, "confirm-share", {
          path,
          applications: snapshot.applications,
        })) !== true
      )
        return null;
    }
    await check();
    return this.serial.run(async () => {
      await check();
      if (
        (await normalizeWorkspacePath(selected)) !== path ||
        JSON.stringify(await this.marker(path)) !== JSON.stringify(snapshot)
      )
        fail("WORKSPACE_UNAVAILABLE", "工作区标识已更改，请重新确认");
      const previous = (await this.records(owner)).find((r) => r.path === path);
      if (previous) {
        await this.validate(owner, previous);
        return previous;
      }
      await initializeWorkspaceDirectory(path);
      const marker = structuredClone(snapshot) ?? {
        version: 1,
        id: randomUUID(),
        applications: [],
        createdAt: Date.now(),
      };
      if (!marker.applications.includes(owner)) marker.applications.push(owner);
      const result = {
        id: marker.id,
        name,
        path,
        isDefault:
          path ===
          (await normalizeWorkspacePath(
            join(applicationDirectory(this.packages.path, owner), "workspace"),
          )),
      };
      const db = (await this.db(owner, true))!;
      try {
        await check();
        db.exec("BEGIN IMMEDIATE");
        db.prepare("INSERT INTO application_workspaces VALUES(?,?,?,?)").run(
          result.id,
          name,
          path,
          result.isDefault ? 1 : 0,
        );
        await jsonWrite(join(path, ".mewvis", "workspace.json"), marker);
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        if (snapshot)
          await jsonWrite(join(path, ".mewvis", "workspace.json"), snapshot);
        else
          await fs.rm(join(path, ".mewvis", "workspace.json"), { force: true });
        throw error;
      } finally {
        db.close();
      }
    });
  }
  async request(connection: unknown, value: unknown) {
    try {
      const token = nonempty(connection, "connection"),
        owner = this.connections.get(token);
      if (!owner) fail("PERMISSION_DENIED", "应用数据连接已失效");
      const request = object(value);
      onlyKeys(request, ["version", "method", "params"]);
      if (Buffer.byteLength(JSON.stringify(request)) > 256 * 1024)
        invalid("应用数据请求超过 256 KiB");
      if (request.version !== 1)
        fail("CAPABILITY_UNAVAILABLE", "不支持的数据协议版本");
      const method = nonempty(request.method, "method"),
        workspace = method.startsWith("workspaces.");
      const check = async () => {
        if (this.connections.get(token) !== owner)
          fail("PERMISSION_DENIED", "应用数据连接已失效");
        await this.packages.authorize(
          owner,
          workspace ? "application-workspaces" : "application-data",
        );
      };
      await check();
      let result: any = null;
      if (workspace) {
        if (method === "workspaces.selectDirectory") {
          if (request.params != null) invalid("selectDirectory 不接受参数");
          result = await this.ask(owner, "pick-directory", {});
          await check();
        } else if (method === "workspaces.list") {
          if (request.params != null) invalid("list 不接受参数");
          if (!(await this.records(owner)).some((r) => r.isDefault))
            await this.create(
              owner,
              "默认工作区",
              join(
                applicationDirectory(this.packages.path, owner),
                "workspace",
              ),
              check,
              true,
            );
          result = await this.records(owner);
        } else {
          const p = object(request.params);
          if (method === "workspaces.get") {
            onlyKeys(p, ["id"]);
            result = (await this.records(owner)).find(
              (r) => r.id === nonempty(p.id, "id"),
            );
            if (!result) fail("WORKSPACE_NOT_FOUND", "当前应用未登记此工作区");
            await this.validate(owner, result);
          } else if (method === "workspaces.remove") {
            onlyKeys(p, ["id", "deleteContent"]);
            if (
              p.deleteContent !== undefined &&
              typeof p.deleteContent !== "boolean"
            )
              invalid("deleteContent 必须为布尔值");
            const record = (await this.records(owner)).find(
              (r) => r.id === nonempty(p.id, "id"),
            );
            if (!record) fail("WORKSPACE_NOT_FOUND", "当前应用未登记此工作区");
            if (record.isDefault)
              fail("INVALID_ARGUMENT", "默认工作区不能移除");
            await this.serial.run(async () => {
              await check();
              if (await exists(record.path)) {
                await this.validate(owner, record);
                const marker = await this.marker(record.path);
                if (p.deleteContent) {
                  if (
                    marker.applications.length !== 1 ||
                    dirname(record.path) === record.path
                  )
                    fail("PERMISSION_DENIED", "共享工作区或根目录不能删除");
                  await fs.rm(record.path, { recursive: true });
                } else {
                  marker.applications = marker.applications.filter(
                    (id: string) => id !== owner,
                  );
                  await jsonWrite(
                    join(record.path, ".mewvis/workspace.json"),
                    marker,
                  );
                }
              }
              const db = (await this.db(owner))!;
              try {
                db.prepare("DELETE FROM application_workspaces WHERE id=?").run(
                  record.id,
                );
              } finally {
                db.close();
              }
            });
          } else if (method === "workspaces.create") {
            onlyKeys(p, ["name", "path", "exclusive"]);
            if (p.exclusive !== undefined && typeof p.exclusive !== "boolean")
              invalid("exclusive 必须为布尔值");
            const name = nonempty(p.name, "name");
            if (name.length > 512) invalid("name 过长");
            let path = p.path;
            if (path == null)
              path = await this.ask(owner, "pick-directory", {});
            if (path != null && p.exclusive) {
              await check();
              const directory = await normalizeWorkspacePath(
                nonempty(path, "path"),
              );
              try {
                await fs.mkdir(directory);
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "EEXIST")
                  fail(
                    "WORKSPACE_UNAVAILABLE",
                    "目录已存在，请选择新名称或导入工作区",
                  );
                throw error;
              }
            }
            if (path != null)
              result = await this.create(
                owner,
                name,
                nonempty(path, "path"),
                check,
              );
          } else invalid("工作区方法无效");
        }
      } else {
        const allowed = [
          "storage.getItem",
          "storage.setItem",
          "storage.removeItem",
          "storage.clear",
          "storage.keys",
        ];
        if (!allowed.includes(method)) invalid("应用数据方法无效");
        let key = "";
        if (["storage.clear", "storage.keys"].includes(method)) {
          if (request.params != null) invalid("此方法不接受参数");
        } else {
          const p = object(request.params);
          onlyKeys(
            p,
            method === "storage.setItem" ? ["key", "value"] : ["key"],
          );
          if (typeof p.key !== "string" || Buffer.byteLength(p.key) > 4096)
            invalid("存储键无效");
          if (method === "storage.setItem" && !Object.hasOwn(p, "value"))
            invalid("缺少 value");
          key = p.key;
        }
        const db = await this.db(owner, method === "storage.setItem");
        try {
          await check();
          switch (method) {
            case "storage.getItem": {
              const v = db
                ?.prepare("SELECT value FROM application_kv WHERE key=?")
                .get(key)?.value;
              result = v == null ? null : JSON.parse(String(v));
              break;
            }
            case "storage.setItem":
              db!
                .prepare(
                  "INSERT INTO application_kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                )
                .run(key, JSON.stringify(object(request.params).value));
              break;
            case "storage.removeItem":
              db?.prepare("DELETE FROM application_kv WHERE key=?").run(key);
              break;
            case "storage.clear":
              db?.exec("DELETE FROM application_kv");
              break;
            case "storage.keys":
              result =
                db
                  ?.prepare("SELECT key FROM application_kv ORDER BY key")
                  .all()
                  .map((r) => r.key) ?? [];
          }
        } finally {
          db?.close();
        }
      }
      if (Buffer.byteLength(JSON.stringify(result)) > 4 * 1024 * 1024)
        fail("STORAGE_ERROR", "响应超过 4 MiB");
      return { ok: true, value: result };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: error instanceof ServiceError ? error.code : "STORAGE_ERROR",
          message:
            error instanceof ServiceError ? error.message : "应用数据操作失败",
        },
      };
    }
  }
}
