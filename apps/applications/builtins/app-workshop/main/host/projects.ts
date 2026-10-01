import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { join, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ApplicationWorkspace,
  ApplicationWorkspaces,
} from "@isle/app-sdk/data";
import {
  APPLICATION_ID,
  FILE_LIMIT,
  PROJECT_LIMIT,
  SOURCE_LIMIT,
  validateFileName,
  type BuildArtifact,
  type BuildResult,
  type FileMap,
  type ProjectDetail,
  type ProjectSummary,
  type SavedVersion,
} from "../contracts.js";
import { compile, sourceHash } from "./compiler.js";

interface ProjectRecord {
  format: 1;
  id: string;
  name: string;
  description: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  files: FileMap;
  draftBuildId: string | null;
  savedVersionId: string | null;
  versions: SavedVersion[];
}
interface ArtifactRecord extends BuildArtifact {
  files: FileMap;
}
const isId = (id: unknown): id is string =>
  typeof id === "string" &&
  /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);
const text = (value: unknown, max: number, label: string) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new Error(`${label}须为 1–${max} 个字符。`);
  return value.trim();
};
const errorCode = (error: unknown) =>
  error && typeof error === "object" && "code" in error
    ? error.code
    : undefined;
function validateFiles(files: FileMap) {
  if (
    !files ||
    typeof files !== "object" ||
    Array.isArray(files) ||
    Object.keys(files).length > FILE_LIMIT
  )
    throw new Error(`项目最多保存 ${FILE_LIMIT} 个源码文件。`);
  let size = 0;
  for (const [name, source] of Object.entries(files)) {
    validateFileName(name);
    if (typeof source !== "string" || Buffer.byteLength(source) > SOURCE_LIMIT)
      throw new Error("单个源码文件最多 128 KiB。");
    size += Buffer.byteLength(source);
  }
  if (size > PROJECT_LIMIT) throw new Error("项目源码总量最多 512 KiB。");
}
async function directory(path: string) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("工坊目录不能是符号链接。");
}
async function readJson<T>(path: string, limit: number): Promise<T> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > limit)
      throw new Error("项目文件无效或超过大小限制。");
    return JSON.parse(await file.readFile("utf8")) as T;
  } finally {
    await file.close();
  }
}
async function atomicJson(path: string, value: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify(value));
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
export const starterFiles = (name: string): FileMap => ({
  "App.tsx": `export default function App() {\n  return <main className="app"><h1>{${JSON.stringify(name)}}</h1><p>从一个想法开始，告诉 AI 你想做什么。</p></main>;\n}\n`,
  "main.tsx": `import { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./styles.css";\ncreateRoot(document.getElementById("root")!).render(<App />);\n`,
  "styles.css": `body { margin: 0; font-family: system-ui, sans-serif; background: var(--background); color: var(--foreground); }\n.app { max-width: 720px; margin: 0 auto; padding: 64px 32px; }\nh1 { font-size: 28px; }\np { color: var(--muted-foreground); line-height: 1.7; }\n`,
});

export function createProjectService(workspaces: ApplicationWorkspaces) {
  async function resolve(id: unknown) {
    if (!isId(id)) throw new Error("项目 ID 无效。");
    let path: string;
    try {
      path = (await workspaces.get(id)).path;
    } catch (error) {
      if (errorCode(error) !== "CAPABILITY_UNAVAILABLE") throw error;
      // Pi application workers authenticate the current workspace through the
      // existing membership marker, exactly as other builtin applications do.
      path = await realpath(process.cwd());
      const marker = await readJson<{ id: string; applications: string[] }>(
        join(path, ".isle", "workspace.json"),
        64 * 1024,
      );
      if (
        marker.id !== id ||
        !Array.isArray(marker.applications) ||
        !marker.applications.includes(APPLICATION_ID)
      )
        throw new Error("当前应用未登记在该工作区。");
    }
    const root = await realpath(path);
    const internal = join(root, ".workshop");
    await directory(internal);
    if (!(await realpath(internal)).startsWith(root + sep))
      throw new Error("工坊目录不能越界。");
    return internal;
  }
  function validate(record: ProjectRecord, id: string) {
    if (
      record.format !== 1 ||
      record.id !== id ||
      !Number.isSafeInteger(record.revision) ||
      record.revision < 0 ||
      !Number.isFinite(record.updatedAt) ||
      !Array.isArray(record.versions) ||
      record.versions.some((v) => !isId(v.id)) ||
      (record.savedVersionId !== null &&
        !record.versions.some((v) => v.id === record.savedVersionId)) ||
      (record.draftBuildId !== null && !isId(record.draftBuildId))
    )
      throw new Error("工坊项目格式无效。");
    text(record.name, 80, "应用名称");
    if (
      typeof record.description !== "string" ||
      record.description.length > 500
    )
      throw new Error("项目说明无效。");
    validateFiles(record.files);
    return record;
  }
  const read = async (root: string, id: string) =>
    validate(
      await readJson<ProjectRecord>(
        join(root, "project.json"),
        2 * 1024 * 1024,
      ),
      id,
    );
  const summary = (record: ProjectRecord): ProjectSummary => ({
    id: record.id,
    name: record.name,
    description: record.description,
    revision: record.revision,
    updatedAt: record.updatedAt,
    savedVersionId: record.savedVersionId,
  });
  const detail = (record: ProjectRecord): ProjectDetail => ({
    ...summary(record),
    files: Object.keys(record.files).sort(),
    versions: record.versions,
    hasDraftBuild: !!record.draftBuildId,
  });
  async function locked<T>(
    id: string,
    action: (root: string, record: ProjectRecord) => Promise<T>,
  ): Promise<T> {
    const root = await resolve(id);
    const lock = join(root, ".write-lock");
    const busy = () => new Error("项目正在保存或构建，请稍后重试。");
    try {
      await mkdir(lock);
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      await directory(lock);
      const lockInfo = await lstat(lock);
      // Only one contender may reclaim a crashed process's lock. Never clear a
      // live owner's lock, including when its operation takes longer than usual.
      const reclaim = join(lock, ".reclaim");
      try {
        await mkdir(reclaim);
      } catch {
        throw busy();
      }
      let moved = false;
      try {
        let abandoned = false;
        try {
          const owner = await readJson<{ pid: number }>(
            join(lock, "owner.json"),
            1024,
          );
          if (!Number.isSafeInteger(owner.pid) || owner.pid < 1) throw busy();
          try {
            process.kill(owner.pid, 0);
          } catch (value) {
            if (errorCode(value) === "ESRCH") abandoned = true;
            else throw busy();
          }
        } catch (value) {
          if (errorCode(value) !== "ENOENT") throw value;
          abandoned = Date.now() - lockInfo.mtimeMs > 60_000;
        }
        if (!abandoned) throw busy();
        const stale = join(root, `.abandoned-lock-${randomUUID()}`);
        await rename(lock, stale);
        moved = true;
        await rm(stale, { recursive: true, force: true });
      } finally {
        if (!moved) await rm(reclaim, { recursive: true, force: true });
      }
      try {
        await mkdir(lock);
      } catch {
        throw busy();
      }
    }
    try {
      await atomicJson(join(lock, "owner.json"), { pid: process.pid });
      return await action(root, await read(root, id));
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
  async function artifact(root: string, record: ProjectRecord, id: string) {
    if (!isId(id)) throw new Error("版本 ID 无效。");
    await directory(join(root, "builds"));
    const value = await readJson<ArtifactRecord>(
      join(root, "builds", `${id}.json`),
      6 * 1024 * 1024,
    );
    if (
      value.id !== id ||
      value.projectId !== record.id ||
      typeof value.script !== "string" ||
      typeof value.style !== "string" ||
      Buffer.byteLength(value.script) + Buffer.byteLength(value.style) >
        3 * 1024 * 1024
    )
      throw new Error("构建产物无效。");
    validateFiles(value.files);
    if (value.sourceHash !== sourceHash(value.files))
      throw new Error("构建源码校验失败。");
    return value;
  }
  const publicArtifact = ({
    files: _files,
    ...value
  }: ArtifactRecord): BuildArtifact => value;
  function revision(record: ProjectRecord, expected: unknown) {
    if (expected !== record.revision)
      throw new Error("源码已被其他操作更新，请重新读取后再保存。");
  }
  return {
    async list() {
      const items: ProjectSummary[] = [];
      for (const workspace of await workspaces.list()) {
        if (workspace.isDefault) continue;
        try {
          items.push(
            summary(await read(await resolve(workspace.id), workspace.id)),
          );
        } catch (error) {
          items.push({
            id: workspace.id,
            name: workspace.name,
            description: "",
            revision: 0,
            updatedAt: 0,
            savedVersionId: null,
            error: `项目不可用：${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
      return items.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async create(nameInput: unknown, descriptionInput: unknown = "") {
      const name = text(nameInput, 80, "应用名称");
      if (typeof descriptionInput !== "string" || descriptionInput.length > 500)
        throw new Error("应用说明最多 500 个字符。");
      const base = (await workspaces.list()).find((w) => w.isDefault);
      if (!base) throw new Error("默认工作区不可用。");
      const parent = join(await realpath(base.path), "projects");
      await mkdir(parent, { recursive: true });
      await directory(parent);
      const workspace = await workspaces.create({
        name,
        path: join(parent, randomUUID()),
        exclusive: true,
      });
      if (!workspace) throw new Error("创建项目已取消。");
      try {
        const root = join(workspace.path, ".workshop");
        await mkdir(root);
        await mkdir(join(root, "builds"));
        const now = Date.now();
        const record: ProjectRecord = {
          format: 1,
          id: workspace.id,
          name,
          description: descriptionInput.trim(),
          revision: 0,
          createdAt: now,
          updatedAt: now,
          files: starterFiles(name),
          draftBuildId: null,
          savedVersionId: null,
          versions: [],
        };
        await atomicJson(join(root, "project.json"), record);
        return detail(record);
      } catch (error) {
        await workspaces.remove({ id: workspace.id, deleteContent: true });
        throw error;
      }
    },
    async inspect(id: string) {
      return detail(await read(await resolve(id), id));
    },
    async readFile(id: string, name: unknown) {
      const path = validateFileName(name);
      const record = await read(await resolve(id), id);
      if (!Object.hasOwn(record.files, path))
        throw new Error("源码文件不存在。");
      return { path, content: record.files[path], revision: record.revision };
    },
    async writeFile(
      id: string,
      name: unknown,
      content: unknown,
      expected: unknown,
    ) {
      const path = validateFileName(name);
      if (typeof content !== "string") throw new Error("源码须为文本。");
      return locked(id, async (root, record) => {
        revision(record, expected);
        const files = { ...record.files, [path]: content };
        validateFiles(files);
        const next = {
          ...record,
          files,
          revision: record.revision + 1,
          updatedAt: Date.now(),
          draftBuildId: null,
        };
        await atomicJson(join(root, "project.json"), next);
        return detail(next);
      });
    },
    async deleteFile(id: string, name: unknown, expected: unknown) {
      const path = validateFileName(name);
      if (path === "main.tsx") throw new Error("入口 main.tsx 不能删除。");
      return locked(id, async (root, record) => {
        revision(record, expected);
        if (!Object.hasOwn(record.files, path))
          throw new Error("源码文件不存在。");
        const files = { ...record.files };
        delete files[path];
        const next = {
          ...record,
          files,
          revision: record.revision + 1,
          updatedAt: Date.now(),
          draftBuildId: null,
        };
        await atomicJson(join(root, "project.json"), next);
        return detail(next);
      });
    },
    async build(id: string): Promise<BuildResult> {
      return locked(id, async (root, record) => {
        const result = compile(record.files);
        if (result.diagnostics.length)
          return {
            ok: false,
            project: detail(record),
            diagnostics: result.diagnostics,
          };
        const built: ArtifactRecord = {
          id: randomUUID(),
          projectId: id,
          createdAt: Date.now(),
          sourceHash: sourceHash(record.files),
          sourceRevision: record.revision,
          files: record.files,
          script: result.script,
          style: result.style,
        };
        await directory(join(root, "builds"));
        await atomicJson(join(root, "builds", `${built.id}.json`), built);
        const next = { ...record, draftBuildId: built.id };
        await atomicJson(join(root, "project.json"), next);
        return {
          ok: true,
          project: detail(next),
          artifact: publicArtifact(built),
          diagnostics: [],
        };
      });
    },
    async readArtifact(id: string, mode: "draft" | "saved") {
      const root = await resolve(id);
      const record = await read(root, id);
      const target =
        mode === "saved" ? record.savedVersionId : record.draftBuildId;
      if (!target) return null;
      const value = await artifact(root, record, target);
      if (mode === "draft" && value.sourceHash !== sourceHash(record.files))
        return null;
      return publicArtifact(value);
    },
    async saveVersion(id: string) {
      return locked(id, async (root, record) => {
        if (!record.draftBuildId)
          throw new Error("请先构建当前草稿，再保存版本。");
        const built = await artifact(root, record, record.draftBuildId);
        if (built.sourceHash !== sourceHash(record.files))
          throw new Error("构建已过期，请重新构建当前源码。");
        const versions = record.versions.some((v) => v.id === built.id)
          ? record.versions
          : [
              {
                id: built.id,
                createdAt: Date.now(),
                sourceRevision: record.revision,
              },
              ...record.versions,
            ];
        if (versions.length > 100) throw new Error("最多保存 100 个版本。");
        const next = {
          ...record,
          versions,
          savedVersionId: built.id,
          updatedAt: Date.now(),
        };
        await atomicJson(join(root, "project.json"), next);
        return detail(next);
      });
    },
    async restore(id: string, versionId: string, expected: unknown) {
      return locked(id, async (root, record) => {
        revision(record, expected);
        if (!record.versions.some((v) => v.id === versionId))
          throw new Error("保存的版本不存在。");
        const built = await artifact(root, record, versionId);
        const next = {
          ...record,
          files: built.files,
          revision: record.revision + 1,
          draftBuildId: built.id,
          savedVersionId: built.id,
          updatedAt: Date.now(),
        };
        await atomicJson(join(root, "project.json"), next);
        return detail(next);
      });
    },
    async remove(id: string) {
      await locked(id, async () => {
        await workspaces.remove({ id, deleteContent: true });
      });
    },
  };
}

// Explicit local-preview adapter; it writes only the directory created by the
// preview script, and is not used by the installed application or Pi workers.
export function previewWorkspaces(path: string): ApplicationWorkspaces {
  const records = new Map<string, ApplicationWorkspace>();
  async function list() {
    await mkdir(path, { recursive: true });
    const marker = join(path, ".default.json");
    let base: ApplicationWorkspace;
    try {
      base = await readJson<ApplicationWorkspace>(marker, 4096);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
      base = { id: randomUUID(), name: "预览工作区", path, isDefault: true };
      await atomicJson(marker, base);
    }
    records.clear();
    records.set(base.id, base);
    try {
      for (const entry of await readdir(join(path, "projects"))) {
        const projectPath = join(path, "projects", entry);
        try {
          const record = await readJson<ProjectRecord>(
            join(projectPath, ".workshop", "project.json"),
            2 * 1024 * 1024,
          );
          records.set(record.id, {
            id: record.id,
            name: record.name,
            path: projectPath,
            isDefault: false,
          });
        } catch {
          /* Preview ignores directories without a complete project. */
        }
      }
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
    return [...records.values()];
  }
  return {
    list,
    async get(id) {
      if (!records.has(id)) await list();
      const item = records.get(id);
      if (!item) throw new Error("项目未登记。");
      return item;
    },
    async create(input) {
      if (!input.path || !input.path.startsWith(path + sep))
        throw new Error("预览目录无效。");
      await mkdir(input.path);
      const item = {
        id: randomUUID(),
        name: input.name,
        path: input.path,
        isDefault: false,
      };
      await mkdir(join(input.path, ".isle"));
      await atomicJson(join(input.path, ".isle", "workspace.json"), {
        version: 1,
        id: item.id,
        applications: [APPLICATION_ID],
      });
      records.set(item.id, item);
      return item;
    },
    async remove({ id, deleteContent }) {
      const item = records.get(id);
      if (!item || item.isDefault) throw new Error("项目未登记。");
      records.delete(id);
      if (deleteContent) await rm(item.path, { recursive: true, force: true });
    },
    async selectDirectory() {
      return null;
    },
  };
}
