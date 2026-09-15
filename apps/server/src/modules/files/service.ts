import * as fs from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import { join, dirname, basename } from "node:path";
import { randomUUID } from "node:crypto";
import {
  root,
  safePath,
  relativePath,
  exists,
} from "../../infrastructure/filesystem/paths.js";
import {
  text,
  invalid,
  object,
  nonempty,
  ServiceError,
  type JsonObject,
} from "../../shared/validation.js";
import { Serial } from "../../shared/serial.js";
import { jsonRead } from "../../infrastructure/filesystem/json.js";

import type { EventHub } from "../../infrastructure/events/event-hub.js";
export class WorkspaceFiles {
  readonly serial = new Serial();
  private watchers = new Map<string, FSWatcher>();
  private closing = false;
  constructor(private events: EventHub) {}
  async read(input: JsonObject, optional = false) {
    const base = await root(input.workspacePath),
      rel = relativePath(input.relativePath),
      path = await safePath(base, rel);
    if (optional && !(await exists(path))) return null;
    const info = await fs.stat(path);
    if (!info.isFile()) invalid("只能读取文件");
    if (info.size > 16 * 1024 * 1024)
      throw new ServiceError(413, "FILE_TOO_LARGE", "文件超过 16 MiB");
    const content = new TextDecoder("utf-8", { fatal: true }).decode(
      await fs.readFile(path),
    );
    return { path: rel, content, updatedAt: Math.trunc(info.mtimeMs) };
  }
  async list(input: JsonObject) {
    const base = await root(input.workspacePath);
    const result: any[] = [];
    const skipped = new Set([
      "node_modules",
      "dist",
      "build",
      "target",
      "coverage",
      "out",
      "venv",
      "__pycache__",
    ]);
    const walk = async (rel: string) => {
      for (const item of await fs.readdir(join(base, rel), {
        withFileTypes: true,
      })) {
        if (
          item.isSymbolicLink() ||
          item.name === "workspace.db" ||
          (item.name.startsWith(".") && item.name !== ".gitignore") ||
          (item.isDirectory() && skipped.has(item.name))
        )
          continue;
        const path = [rel, item.name].filter(Boolean).join("/");
        const info = await fs.stat(await safePath(base, path));
        result.push({
          path,
          name: item.name,
          isDirectory: info.isDirectory(),
          size: info.isFile() ? info.size : null,
          updatedAt: Math.trunc(info.mtimeMs),
        });
        if (result.length > 100000)
          throw new ServiceError(413, "TOO_MANY_FILES", "工作区文件过多");
        if (info.isDirectory()) await walk(path);
      }
    };
    await walk("");
    return result.sort(
      (a, b) =>
        a.path.toLowerCase().localeCompare(b.path.toLowerCase()) ||
        a.path.localeCompare(b.path),
    );
  }
  async atomic(input: JsonObject) {
    return this.serial.run(async () => {
      const base = await root(input.workspacePath);
      if (!Array.isArray(input.files)) invalid("files 必须是数组");
      const writes = input.files.map((v) => {
        const f = object(v);
        return {
          path: relativePath(f.relativePath),
          content: text(f.content, "content"),
        };
      });
      const deletes = input.deletePaths ?? [];
      if (!Array.isArray(deletes)) invalid("deletePaths 必须是数组");
      const deletion = deletes.map(relativePath),
        paths = [...writes.map((w) => w.path), ...deletion];
      if (new Set(paths).size !== paths.length) invalid("事务包含重复路径");
      for (const a of paths)
        for (const b of paths)
          if (a !== b && b.startsWith(`${a}/`)) invalid("事务路径不能互为父子");
      if (input.revisionCondition != null) {
        const c = object(input.revisionCondition),
          target = await safePath(base, c.relativePath);
        const present = await exists(target);
        const expected = c.expectedRevision ?? null;
        if (expected !== null && !Number.isSafeInteger(expected))
          invalid("expectedRevision 必须是整数");
        if (
          expected === null
            ? present
            : !present || (await jsonRead(target)).revision !== expected
        )
          throw new ServiceError(409, "REVISION_CONFLICT", "故事项目版本冲突");
      }
      const targets = new Map<string, string>();
      for (const rel of paths) {
        const lexical = join(base, rel);
        const target = await safePath(base, rel);
        if (await exists(lexical)) {
          const info = await fs.lstat(lexical);
          if (!info.isFile() || info.isSymbolicLink())
            invalid("事务只能覆盖普通文件");
        }
        if ([...targets.values()].includes(target))
          invalid("事务包含指向同一文件的路径");
        targets.set(rel, target);
      }
      const stage = await fs.mkdtemp(join(base, ".isle-claw-txn-"));
      let preserve = false;
      const changed: string[] = [],
        backups = new Map<string, string>();
      try {
        for (let i = 0; i < writes.length; i++)
          await fs.writeFile(join(stage, `new-${i}`), writes[i].content);
        for (let i = 0; i < paths.length; i++) {
          const target = targets.get(paths[i])!;
          if (await exists(target)) {
            const backup = join(stage, `old-${i}`);
            await fs.copyFile(target, backup);
            backups.set(paths[i], backup);
          }
        }
        try {
          for (let i = 0; i < writes.length; i++) {
            const rel = writes[i].path,
              target = targets.get(rel)!;
            await fs.mkdir(dirname(target), { recursive: true });
            await safePath(base, rel);
            changed.push(rel);
            await fs.rename(join(stage, `new-${i}`), target);
          }
          for (const rel of deletion) {
            changed.push(rel);
            await fs.rm(targets.get(rel)!, { force: true });
          }
        } catch (e) {
          const errors: unknown[] = [];
          for (const rel of changed.reverse()) {
            try {
              const target = targets.get(rel)!;
              const backup = backups.get(rel);
              if (backup) await fs.copyFile(backup, target);
              else await fs.rm(target, { force: true });
            } catch (error) {
              errors.push(error);
            }
          }
          if (errors.length) {
            preserve = true;
            await fs.writeFile(
              join(stage, "recovery.json"),
              JSON.stringify(
                { targets: [...targets], backups: [...backups] },
                null,
                2,
              ),
            );
            throw new ServiceError(
              500,
              "ROLLBACK_FAILED",
              `文件回滚未完成，备份保留在 ${stage}`,
            );
          }
          throw e;
        }
        return {
          writtenPaths: writes.map((w) => w.path),
          deletedPaths: deletion,
        };
      } finally {
        if (!preserve) await fs.rm(stage, { recursive: true, force: true });
      }
    });
  }
  async write(input: JsonObject) {
    await this.atomic({
      ...input,
      files: [{ relativePath: input.relativePath, content: input.content }],
    });
    return this.read(input);
  }
  async remove(input: JsonObject) {
    await this.read(input);
    await this.atomic({
      ...input,
      files: [],
      deletePaths: [input.relativePath],
    });
    return null;
  }
  async watch(input: JsonObject) {
    const base = await root(input.workspacePath);
    if (this.closing)
      throw new ServiceError(503, "SERVER_STOPPING", "Server 正在停止");
    if (this.watchers.size >= 64)
      throw new ServiceError(429, "WATCH_LIMIT", "监听数量超过上限");
    const watchId = randomUUID();
    const watcher = watch(base, { recursive: true }, () =>
      this.events.publish("workspace_files_changed", { watchId }),
    );
    watcher.on("error", () => {
      watcher.close();
      this.watchers.delete(watchId);
      this.events.publish("workspace_file_watch_error", { watchId });
    });
    this.watchers.set(watchId, watcher);
    return watchId;
  }
  unwatch(input: JsonObject) {
    const id = nonempty(input.watchId, "watchId");
    this.watchers.get(id)?.close();
    this.watchers.delete(id);
    return null;
  }
  close() {
    this.closing = true;
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
  }
  commands() {
    return {
      list_workspace_files: (i: JsonObject) => this.list(i),
      read_workspace_file: (i: JsonObject) => this.read(i),
      read_workspace_file_optional: (i: JsonObject) => this.read(i, true),
      write_workspace_file: (i: JsonObject) => this.write(i),
      write_workspace_files_atomic: (i: JsonObject) => this.atomic(i),
      delete_workspace_file: (i: JsonObject) => this.remove(i),
      watch_workspace_files: (i: JsonObject) => this.watch(i),
      unwatch_workspace_files: (i: JsonObject) => this.unwatch(i),
    };
  }
}
