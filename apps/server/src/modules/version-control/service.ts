import * as fs from "node:fs/promises";
import { join, basename } from "node:path";
import { devNull } from "node:os";
import { command } from "../../infrastructure/process/command.js";
import {
  root,
  safePath,
  relativePath,
  exists,
} from "../../infrastructure/filesystem/paths.js";
import {
  invalid,
  nonempty,
  ServiceError,
  type JsonObject,
} from "../../shared/validation.js";
import { atomicText } from "../../infrastructure/filesystem/json.js";
import { Serial } from "../../shared/serial.js";

export class VersionControl {
  private serial = new Serial();
  constructor(private dataName: string) {}
  private async git(
    base: string,
    args: string[],
    allow: number[] = [],
    input?: string,
  ) {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
    );
    return command(
      "git",
      [
        "--literal-pathspecs",
        "-c",
        "core.hooksPath=" + devNull,
        "-c",
        "core.fsmonitor=false",
        ...args,
      ],
      { cwd: base, env, input, allow },
    );
  }
  private async enabled(base: string) {
    if (!(await exists(join(base, ".git")))) return false;
    try {
      return (
        (await fs.realpath(
          (
            await this.git(base, ["rev-parse", "--show-toplevel"])
          ).stdout.trim(),
        )) === base
      );
    } catch {
      return false;
    }
  }
  private async repository(i: JsonObject) {
    const base = await root(i.workspacePath);
    if (!(await this.enabled(base)))
      throw new ServiceError(
        409,
        "GIT_NOT_INITIALIZED",
        "工作区尚未初始化 Git",
      );
    return base;
  }
  private async ignore(base: string) {
    const path = await safePath(base, ".gitignore");
    let value = (await exists(path)) ? await fs.readFile(path, "utf8") : "";
    const lines = new Set(value.split("\n").map((s) => s.trim()));
    const missing = [
      ".DS_Store",
      "workspace.db",
      "workspace.db-*",
      `${this.dataName}/`,
    ].filter((x) => !lines.has(x));
    if (missing.length)
      await atomicText(
        path,
        value +
          (value && !value.endsWith("\n") ? "\n" : "") +
          "\n# Mewvis local data\n" +
          missing.join("\n") +
          "\n",
      );
  }
  private async head(base: string) {
    const r = await this.git(base, ["rev-parse", "--verify", "HEAD"], [128]);
    return r.code === 0 ? r.stdout.trim() : null;
  }
  async status(i: JsonObject): Promise<any> {
    const base = await root(i.workspacePath);
    const counts: any = {
      added: 0,
      modified: 0,
      deleted: 0,
      renamed: 0,
      typechange: 0,
      conflicted: 0,
      untracked: 0,
    };
    if (!(await this.enabled(base)))
      return {
        isEnabled: false,
        provider: null,
        currentRef: null,
        head: null,
        branches: [],
        hasVersions: false,
        hasChanges: false,
        changedFileCount: 0,
        counts,
        files: [],
      };
    await this.ignore(base);
    const head = await this.head(base);
    const ref =
      (
        await this.git(base, ["symbolic-ref", "--short", "HEAD"], [1, 128])
      ).stdout.trim() || null;
    const chunks = (
      await this.git(base, [
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
      ])
    ).stdout.split("\0");
    const files: any[] = [];
    for (let n = 0; n < chunks.length; n++) {
      const row = chunks[n];
      if (!row) continue;
      const xy = row.slice(0, 2),
        path = row.slice(3);
      const renamed = xy.includes("R") || xy.includes("C"),
        previousPath = renamed ? chunks[++n] : null;
      const status =
        xy.includes("U") || ["AA", "DD"].includes(xy)
          ? "conflicted"
          : renamed
            ? "renamed"
            : xy.includes("T")
              ? "typechange"
              : xy.includes("D")
                ? "deleted"
                : xy[0] === "A"
                  ? "added"
                  : xy === "??"
                    ? "untracked"
                    : "modified";
      counts[status]++;
      files.push({
        path,
        previousPath,
        status,
        isStaged: xy[0] !== " " && xy[0] !== "?",
        isWorktree: xy[1] !== " ",
      });
    }
    const branches = (
      await this.git(base, [
        "for-each-ref",
        "--format=%(refname:short)%09%(objectname)",
        "refs/heads/",
      ])
    ).stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, id] = line.split("\t");
        return {
          name,
          shortHead: id?.slice(0, 8) ?? null,
          isCurrent: name === ref,
        };
      });
    return {
      isEnabled: true,
      provider: "git",
      currentRef: ref ?? head?.slice(0, 8) ?? null,
      head,
      branches,
      hasVersions: !!head,
      hasChanges: files.length > 0,
      changedFileCount: files.length,
      counts,
      files,
    };
  }
  async initialize(i: JsonObject) {
    const base = await root(i.workspacePath);
    if (!(await this.enabled(base))) await this.git(base, ["init"]);
    return this.status(i);
  }
  private version(value: unknown) {
    const id = nonempty(value, "versionId");
    if (!/^[0-9a-f]{4,64}$/i.test(id)) invalid("versionId 必须是提交 ID");
    return id;
  }
  private async resolveVersion(base: string, value: unknown) {
    return (
      await this.git(base, [
        "rev-parse",
        "--verify",
        `${this.version(value)}^{commit}`,
      ])
    ).stdout.trim();
  }
  private async branch(base: string, value: unknown) {
    const name = nonempty(value, "branchName");
    if (name.startsWith("-") || name === "HEAD") invalid("分支名无效");
    await this.git(base, ["check-ref-format", `refs/heads/${name}`]);
    return name;
  }
  private parseVersions(value: string) {
    return value
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [id, authorName, timestamp, ...summary] = line.split("\0");
        return {
          id,
          shortId: id.slice(0, 8),
          authorName,
          timestamp: Number(timestamp) * 1000,
          summary: summary.join("\0"),
        };
      });
  }
  async history(i: JsonObject) {
    const base = await this.repository(i);
    if (!(await this.head(base))) return [];
    const ref = i.branchName
      ? `refs/heads/${await this.branch(base, i.branchName)}`
      : "HEAD";
    return this.parseVersions(
      (
        await this.git(base, [
          "log",
          "-30",
          "--date-order",
          "--format=%H%x00%an%x00%ct%x00%s",
          ref,
          "--",
        ])
      ).stdout,
    );
  }
  private async content(
    base: string,
    ref: string | null,
    path: string,
    optional = false,
  ) {
    if (!ref) return "";
    const result = await this.git(
      base,
      ["show", `${ref}:${path}`],
      optional ? [128] : [],
    );
    return result.code === 0 ? result.stdout : "";
  }
  async read(i: JsonObject) {
    const base = await this.repository(i),
      id = await this.resolveVersion(base, i.versionId),
      path = relativePath(i.relativePath),
      content = await this.content(base, id, path);
    return { path, content, size: Buffer.byteLength(content) };
  }
  private async parent(base: string, id: string) {
    const refs = (
      await this.git(base, ["rev-list", "--parents", "-n", "1", id])
    ).stdout
      .trim()
      .split(" ");
    return refs[1] ?? null;
  }
  private async emptyTree(base: string) {
    return (
      await this.git(base, ["hash-object", "-t", "tree", "--stdin"], [], "")
    ).stdout.trim();
  }
  async versionFiles(i: JsonObject) {
    const base = await this.repository(i),
      id = await this.resolveVersion(base, i.versionId);
    const rows = (
      await this.git(base, [
        "diff-tree",
        "--root",
        "--no-commit-id",
        "-r",
        "-M",
        "--name-status",
        "-z",
        id,
      ])
    ).stdout.split("\0");
    const files: any[] = [];
    for (let n = 0; n < rows.length && rows[n];) {
      const statusCode = rows[n++],
        old = rows[n++],
        renamed = statusCode.startsWith("R"),
        path = renamed ? rows[n++] : old;
      const status = renamed
        ? "renamed"
        : (({ A: "added", D: "deleted", T: "typechange" } as any)[statusCode] ??
          "modified");
      const ref = status === "deleted" ? await this.parent(base, id) : id;
      const content = await this.content(
        base,
        ref,
        status === "deleted" ? old : path,
        true,
      );
      files.push({
        path,
        previousPath: renamed ? old : null,
        status,
        name: basename(path),
        size: Buffer.byteLength(content),
      });
    }
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }
  async diff(i: JsonObject, version = false) {
    const base = await this.repository(i),
      path = relativePath(i.relativePath);
    await safePath(base, path);
    if (version) {
      const id = await this.resolveVersion(base, i.versionId),
        parent = await this.parent(base, id),
        changes = await this.versionFiles(i),
        file = changes.find((f) => f.path === path || f.previousPath === path);
      const beforePath = file?.previousPath ?? path,
        afterPath = file?.path ?? path;
      return {
        path,
        patch: (
          await this.git(base, [
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            parent ?? (await this.emptyTree(base)),
            id,
            "--",
            beforePath,
            afterPath,
          ])
        ).stdout,
        beforeContent: await this.content(base, parent, beforePath, true),
        afterContent: await this.content(base, id, afterPath, true),
      };
    }
    const head = await this.head(base),
      file = await safePath(base, path),
      beforeContent = await this.content(base, head, path, true),
      afterContent = (await exists(file))
        ? await fs.readFile(file, "utf8")
        : "";
    const tracked =
      (await this.git(base, ["ls-files", "--error-unmatch", "--", path], [1]))
        .code === 0;
    const patch = tracked
      ? (
          await this.git(base, [
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            head ?? (await this.emptyTree(base)),
            "--",
            path,
          ])
        ).stdout
      : (
          await this.git(
            base,
            ["diff", "--no-index", "--no-ext-diff", "--", devNull, file],
            [1],
          )
        ).stdout;
    return { path, patch, beforeContent, afterContent };
  }
  async commit(i: JsonObject) {
    const base = await this.repository(i);
    await this.ignore(base);
    const message = nonempty(i.message, "message"),
      head = await this.head(base);
    if (i.relativePaths != null && !Array.isArray(i.relativePaths))
      invalid("relativePaths 必须是数组");
    const paths = ((i.relativePaths as unknown[]) ?? []).map(relativePath);
    for (const path of paths) await safePath(base, path);
    const state = await this.status(i);
    for (const file of state.files)
      if (
        paths.includes(file.path) &&
        file.previousPath &&
        !paths.includes(file.previousPath)
      )
        paths.push(file.previousPath);
    await this.git(base, ["read-tree", ...(head ? [head] : ["--empty"])]);
    await this.git(base, [
      "add",
      "-A",
      "--",
      ...(paths.length ? paths : ["."]),
    ]);
    const tree = (await this.git(base, ["write-tree"])).stdout.trim();
    if (
      head &&
      tree ===
        (await this.git(base, ["rev-parse", `${head}^{tree}`])).stdout.trim()
    )
      throw new ServiceError(409, "NO_CHANGES", "没有可提交的文件变更");
    const name =
      (await this.git(base, ["config", "user.name"], [1])).stdout.trim() ||
      "Mewvis";
    const email =
      (await this.git(base, ["config", "user.email"], [1])).stdout.trim() ||
      "isle-claw@local";
    const id = (
      await this.git(base, [
        "-c",
        `user.name=${name}`,
        "-c",
        `user.email=${email}`,
        "commit-tree",
        tree,
        ...(head ? ["-p", head] : []),
        "-m",
        message,
      ])
    ).stdout.trim();
    await this.git(base, ["update-ref", "HEAD", id, ...(head ? [head] : [])]);
    return {
      version: this.parseVersions(
        (
          await this.git(base, [
            "log",
            "-1",
            "--format=%H%x00%an%x00%ct%x00%s",
            id,
          ])
        ).stdout,
      )[0],
      status: await this.status(i),
    };
  }
  async discard(i: JsonObject) {
    const base = await this.repository(i),
      path = relativePath(i.relativePath);
    const state = await this.status(i),
      file = state.files.find(
        (f: any) => f.path === path || f.previousPath === path,
      );
    if (!file) invalid("该文件没有可撤销的修改");
    const head = await this.head(base);
    if (head) await this.git(base, ["read-tree", head]);
    else await this.git(base, ["read-tree", "--empty"]);
    const target = file.previousPath ?? file.path;
    const inHead =
      head &&
      (await this.git(base, ["cat-file", "-e", `${head}:${target}`], [128]))
        .code === 0;
    if (file.previousPath)
      await fs.rm(await safePath(base, file.path), { force: true });
    if (inHead) await this.git(base, ["checkout", head!, "--", target]);
    else await fs.rm(await safePath(base, file.path), { force: true });
    return this.status(i);
  }
  async restore(i: JsonObject) {
    const base = await this.repository(i),
      id = await this.resolveVersion(base, i.versionId);
    await this.git(base, ["read-tree", "--reset", "-u", id]);
    return this.status(i);
  }
  async changeBranch(i: JsonObject, create = false) {
    const base = await this.repository(i),
      name = await this.branch(base, i.branchName);
    const state = await this.status(i);
    if (create) {
      if (!state.head) invalid("请先提交一次，再创建分支");
      await this.git(base, ["branch", name, state.head]);
      await this.git(base, ["symbolic-ref", "HEAD", `refs/heads/${name}`]);
    } else if (state.currentRef !== name) {
      if (state.hasChanges)
        throw new ServiceError(
          409,
          "WORKTREE_DIRTY",
          "切换分支前请先提交或清理当前变更",
        );
      await this.git(base, ["checkout", name]);
    }
    return this.status(i);
  }
  commands() {
    const c = {
      get_workspace_version_control_status: (i: JsonObject) => this.status(i),
      initialize_workspace_version_control: (i: JsonObject) =>
        this.initialize(i),
      get_workspace_version_file_diff: (i: JsonObject) => this.diff(i),
      get_workspace_version_commit_file_diff: (i: JsonObject) =>
        this.diff(i, true),
      create_workspace_version: (i: JsonObject) => this.commit(i),
      list_workspace_versions: (i: JsonObject) => this.history(i),
      list_workspace_version_files: (i: JsonObject) => this.versionFiles(i),
      read_workspace_version_file: (i: JsonObject) => this.read(i),
      discard_workspace_version_file_changes: (i: JsonObject) =>
        this.discard(i),
      restore_workspace_version: (i: JsonObject) => this.restore(i),
      create_workspace_version_branch: (i: JsonObject) =>
        this.changeBranch(i, true),
      switch_workspace_version_branch: (i: JsonObject) => this.changeBranch(i),
    };
    return Object.fromEntries(
      Object.entries(c).map(([name, fn]) => [
        name,
        (i: JsonObject) => this.serial.run(() => fn(i)),
      ]),
    );
  }
}
