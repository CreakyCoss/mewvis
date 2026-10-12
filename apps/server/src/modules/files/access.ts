import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { nonempty } from "../../shared/validation.js";
import { fileError as fail } from "./common.js";

export type FileScope = {
  dataPath: string;
  workspacePaths: string[];
  protectedPaths: string[];
};
export type FileScopeResolver = (
  applicationId: string | null,
) => Promise<FileScope>;
const inside = (root: string, path: string) => {
  const rel = relative(root, path);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
};

/** Resolves caller identity and enforces one path gate before every file operation. */
export class FileAccess {
  private connections = new Map<string, string | null>();
  private closed = false;
  constructor(private scope: FileScopeResolver) {}
  async connect(applicationId: string | null) {
    if (this.closed) fail("CONNECTION_CLOSED", "文件服务已关闭", 503);
    await this.scope(applicationId);
    if (this.connections.size >= 512)
      fail("LIMIT_EXCEEDED", "文件连接数量超过上限", 429);
    const connection = randomUUID();
    this.connections.set(connection, applicationId);
    return connection;
  }
  async caller(connection: string) {
    if (this.closed || !this.connections.has(connection))
      fail("PERMISSION_DENIED", "文件连接已失效", 403);
    const scope = await this.scope(this.connections.get(connection)!);
    if (!this.connections.has(connection))
      fail("PERMISSION_DENIED", "文件连接已失效", 403);
    return scope;
  }
  async canonical(path: string) {
    const missing: string[] = [];
    let parent = path;
    for (;;) {
      try {
        return resolve(await fs.realpath(parent), ...missing);
      } catch (error) {
        if (
          !["ENOENT", "ENOTDIR"].includes(
            (error as NodeJS.ErrnoException).code ?? "",
          )
        )
          throw error;
        if (dirname(parent) === parent) throw error;
        missing.unshift(basename(parent));
        parent = dirname(parent);
      }
    }
  }
  async authorize(
    connection: string,
    input: unknown,
    action: "read" | "write" | "delete",
  ) {
    const raw = nonempty(input, "filePath");
    if (
      !isAbsolute(raw) ||
      raw.includes("\0") ||
      raw.split(/[\\/]/).includes("..")
    )
      fail("INVALID_ARGUMENT", "filePath 必须是无父目录跳转的完整路径");
    const scope = await this.caller(connection);
    for (const allowed of [scope.dataPath, ...scope.workspacePaths]) {
      try {
        const rootInfo = await fs.lstat(allowed);
        if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory())
          fail("PERMISSION_DENIED", "允许目录已被替换或不是普通目录", 403);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const roots = await Promise.all(
      [scope.dataPath, ...scope.workspacePaths].map((p) =>
        this.canonical(resolve(p)),
      ),
    );
    const target = await this.canonical(resolve(raw));
    const root = roots
      .filter((p) => inside(p, target))
      .sort((a, b) => b.length - a.length)[0];
    if (!root)
      fail("PERMISSION_DENIED", "文件不在当前调用者的数据目录或工作区内", 403);
    // Resolve aliases of the root, then reject symlinks below it, including dangling links.
    let cursor = resolve(raw);
    while (!roots.includes(await this.canonical(cursor))) {
      try {
        if ((await fs.lstat(cursor)).isSymbolicLink())
          fail("PERMISSION_DENIED", "文件路径不能包含符号链接", 403);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (dirname(cursor) === cursor) break;
      cursor = dirname(cursor);
    }
    if (action !== "read") {
      if (roots.includes(target))
        fail(
          "PERMISSION_DENIED",
          "不能覆盖、移动或删除数据目录及工作区根目录",
          403,
        );
      const protectedPaths = await Promise.all(
        scope.protectedPaths.map((p) => this.canonical(p)),
      );
      const parts = relative(root, target).split(sep);
      if (
        parts.includes(".git") ||
        parts.includes(".mewvis") ||
        protectedPaths.some((p) => inside(p, target) || inside(target, p))
      )
        fail(
          "PERMISSION_DENIED",
          "不能修改宿主管理的配置、数据库、安装包或工作区标识",
          403,
        );
      try {
        if (
          (await fs.lstat(target)).nlink > 1 &&
          !(await fs.lstat(target)).isDirectory()
        )
          fail("PERMISSION_DENIED", "不能修改多硬链接文件", 403);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return target;
  }
  async openRead(connection: string, path: string) {
    const target = await this.authorize(connection, path, "read");
    const before = await fs.lstat(target);
    if (!before.isFile() || before.nlink > 1)
      fail("INVALID_FILE", "只允许读取普通且没有多硬链接的文件");
    const handle = await fs.open(
      target,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0),
    );
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink > 1)
        fail("INVALID_FILE", "只允许读取普通且没有多硬链接的文件");
      const actual = await fs.lstat(
        await this.authorize(connection, path, "read"),
      );
      if (actual.dev !== stat.dev || actual.ino !== stat.ino)
        fail("FILE_CHANGED", "文件在打开期间发生变化", 409);
      return { target, handle, stat };
    } catch (error) {
      await handle.close();
      throw error;
    }
  }
  disconnect(connection: string) {
    this.connections.delete(connection);
  }
  connectionsFor(applicationId: string) {
    return [...this.connections]
      .filter(([, owner]) => owner === applicationId)
      .map(([connection]) => connection);
  }
  close() {
    this.closed = true;
    const connections = [...this.connections.keys()];
    this.connections.clear();
    return connections;
  }
}
