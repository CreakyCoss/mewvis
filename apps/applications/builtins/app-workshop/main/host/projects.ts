import { mkdir, readdir, realpath, rm } from "node:fs/promises";
import { join, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ApplicationWorkspace,
  ApplicationWorkspaces,
} from "@mewvis/app-sdk/data";
import {
  APPLICATION_ID,
  APP_ENTRY,
  MAIN_ENTRY,
  SOURCE_DIRECTORY,
  STYLE_ENTRY,
  validateFileName,
  type BuildArtifact,
  type BuildResult,
  type FileMap,
  type ProjectDetail,
  type ProjectSummary,
  type SavedVersion,
  type BuiltinDefinition,
  type BuiltinInstallation,
} from "../contracts.js";
import { compile, sourceHash } from "./compiler.js";
import { applySource, readSource, validateFiles } from "./source.js";
import {
  isId,
  errorCode,
  directory,
  readJson,
  atomicJson,
  withDirectoryLock,
} from "./files.js";

interface ProjectMetadata {
  format: 2;
  id: string;
  name: string;
  description: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  sourceHash: string;
  draftBuildId: string | null;
  savedVersionId: string | null;
  versions: SavedVersion[];
  builtin?: { id: string; version: number };
}
interface ProjectRecord extends ProjectMetadata {
  files: FileMap;
}
interface SourceTransaction {
  format: 1;
  baseRevision: number;
  before: FileMap;
  after: FileMap;
  metadata: ProjectMetadata;
}
interface ArtifactRecord extends BuildArtifact {
  files: FileMap;
  sourceLayout: 2;
}
const text = (value: unknown, max: number, label: string) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new Error(`${label}须为 1–${max} 个字符。`);
  return value.trim();
};
const projectFiles = (): FileMap => ({
  "package.json":
    JSON.stringify(
      {
        name: "workshop-mini-app",
        version: "0.1.0",
        private: true,
        type: "module",
        dependencies: {
          react: "19.1.0",
          "react-dom": "19.1.0",
          "@mewvis/app-sdk": "0.1.0",
        },
        devDependencies: { typescript: "5.8.3" },
      },
      null,
      2,
    ) + "\n",
  "tsconfig.json":
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "Bundler",
          jsx: "react-jsx",
          strict: true,
          skipLibCheck: true,
          esModuleInterop: true,
          resolveJsonModule: true,
          noEmit: true,
        },
        include: ["src"],
      },
      null,
      2,
    ) + "\n",
  ".gitignore": "node_modules/\ndist/\n",
});
export const starterFiles = (name: string): FileMap => ({
  ...projectFiles(),
  [APP_ENTRY]: `export default function App() {\n  return <main className="app"><h1>{${JSON.stringify(name)}}</h1><p>从一个想法开始，告诉 AI 你想做什么。</p></main>;\n}\n`,
  [MAIN_ENTRY]: `import { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./styles.css";\ncreateRoot(document.getElementById("root")!).render(<App />);\n`,
  [STYLE_ENTRY]: `body { margin: 0; font-family: system-ui, sans-serif; background: var(--background); color: var(--foreground); }\n.app { max-width: 720px; margin: 0 auto; padding: 64px 32px; }\nh1 { font-size: 28px; }\np { color: var(--muted-foreground); line-height: 1.7; }\n`,
});
const metadata = ({
  files: _files,
  ...record
}: ProjectRecord): ProjectMetadata => record;

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
        join(path, ".mewvis", "workspace.json"),
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
  function validate(record: ProjectMetadata, id: string): ProjectMetadata {
    if (
      !record ||
      record.format !== 2 ||
      record.id !== id ||
      !Number.isSafeInteger(record.revision) ||
      record.revision < 0 ||
      !Number.isFinite(record.createdAt) ||
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
    if (
      typeof record.sourceHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(record.sourceHash) ||
      Object.hasOwn(record, "files")
    )
      throw new Error("工坊源码元数据无效。");
    return record;
  }
  const readMetadata = async (root: string, id: string) =>
    validate(
      await readJson<ProjectMetadata>(
        join(root, "project.json"),
        4 * 1024 * 1024,
      ),
      id,
    );
  const writeRecord = (root: string, record: ProjectRecord) =>
    atomicJson(join(root, "project.json"), metadata(record));
  async function recover(root: string, id: string) {
    let pending: SourceTransaction;
    try {
      pending = await readJson<SourceTransaction>(
        join(root, "source-transaction.json"),
        16 * 1024 * 1024,
      );
    } catch (error) {
      if (errorCode(error) === "ENOENT") return;
      throw error;
    }
    const next = validate(pending.metadata, id);
    validateFiles(pending.before);
    validateFiles(pending.after);
    const previous = await readMetadata(root, id);
    if (
      pending.format !== 1 ||
      !Number.isSafeInteger(pending.baseRevision) ||
      next.revision !== pending.baseRevision + 1 ||
      ![pending.baseRevision, next.revision].includes(previous.revision) ||
      next.sourceHash !== sourceHash(pending.after)
    )
      throw new Error("源码事务无效，已保留原项目数据。");
    await applySource(root, pending.before, pending.after);
    await atomicJson(join(root, "project.json"), next);
    await rm(join(root, "source-transaction.json"));
  }
  async function commitSource(
    root: string,
    before: FileMap,
    next: ProjectRecord,
  ) {
    validateFiles(next.files);
    if (sourceHash(next.files) !== next.sourceHash)
      throw new Error("源码事务校验失败。");
    await atomicJson(join(root, "source-transaction.json"), {
      format: 1,
      baseRevision: next.revision - 1,
      before,
      after: next.files,
      metadata: metadata(next),
    } satisfies SourceTransaction);
    await recover(root, next.id);
  }
  async function read(root: string, id: string): Promise<ProjectRecord> {
    await recover(root, id);
    const stored = await readMetadata(root, id);
    const files = await readSource(root);
    const hash = sourceHash(files);
    const record: ProjectRecord = { ...stored, files };
    if (hash !== stored.sourceHash) {
      record.sourceHash = hash;
      record.revision++;
      record.updatedAt = Date.now();
      record.draftBuildId = null;
      await writeRecord(root, record);
    }
    return record;
  }
  const summary = (record: ProjectRecord): ProjectSummary => ({
    id: record.id,
    name: record.name,
    description: record.description,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    savedVersionId: record.savedVersionId,
  });
  async function savedFiles(
    root: string,
    record: ProjectRecord,
  ): Promise<FileMap> {
    return record.savedVersionId
      ? (await artifact(root, record, record.savedVersionId)).files
      : {};
  }
  async function detail(
    root: string,
    record: ProjectRecord,
  ): Promise<ProjectDetail> {
    const saved = await savedFiles(root, record);
    return {
      ...summary(record),
      sourceRoot: SOURCE_DIRECTORY,
      entry: MAIN_ENTRY,
      files: Object.keys(record.files).sort(),
      versions: record.versions,
      hasDraftBuild: !!record.draftBuildId,
      changedFiles: [
        ...new Set([...Object.keys(record.files), ...Object.keys(saved)]),
      ]
        .filter((path) => record.files[path] !== saved[path])
        .sort(),
    };
  }
  async function locked<T>(
    id: string,
    action: (root: string, record: ProjectRecord) => Promise<T>,
  ): Promise<T> {
    const root = await resolve(id);
    return withDirectoryLock(root, async () =>
      action(root, await read(root, id)),
    );
  }
  async function artifact(root: string, record: ProjectRecord, id: string) {
    if (!isId(id)) throw new Error("版本 ID 无效。");
    await directory(join(root, "builds"));
    const value = await readJson<ArtifactRecord>(
      join(root, "builds", `${id}.json`),
      16 * 1024 * 1024,
    );
    if (
      value.sourceLayout !== 2 ||
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
    sourceLayout: _layout,
    ...value
  }: ArtifactRecord): BuildArtifact => value;
  function revision(record: ProjectRecord, expected: unknown) {
    if (expected !== record.revision)
      throw new Error("源码已被其他操作更新，请重新读取后再保存。");
  }
  return {
    async createBuiltin(
      template: BuiltinDefinition,
      installation: BuiltinInstallation,
    ) {
      if (
        !isId(installation.directoryId) ||
        !isId(installation.versionId) ||
        installation.version !== template.version
      )
        throw new Error("内置小应用安装记录无效。");
      validateFiles(template.files);
      const result = compile(template.files);
      if (result.diagnostics.length)
        throw new Error(
          result.diagnostics
            .map((d) => `${d.file}:${d.line} ${d.message}`)
            .join("\n"),
        );
      const enrolled = await workspaces.list();
      const base = enrolled.find((w) => w.isDefault);
      if (!base) throw new Error("默认工作区不可用。");
      const parent = join(await realpath(base.path), "projects");
      await mkdir(parent, { recursive: true });
      await directory(parent);
      const path = join(parent, installation.directoryId);
      // The path is reserved in the installation journal before creating the
      // workspace. A retry resumes it even if the process died before saving ID.
      const workspace =
        enrolled.find((w) => !w.isDefault && w.path === path) ??
        (await workspaces.create({
          name: template.name,
          path,
          exclusive: true,
        }));
      if (!workspace) throw new Error("创建项目已取消。");
      const root = join(workspace.path, ".workshop");
      await mkdir(root, { recursive: true });
      await directory(root);
      return withDirectoryLock(root, async () => {
        let stored: ProjectMetadata | undefined;
        try {
          stored = await readMetadata(root, workspace.id);
        } catch (error) {
          if (errorCode(error) !== "ENOENT") throw error;
        }
        if (stored) {
          if (
            stored.builtin?.id !== template.id ||
            stored.builtin.version !== template.version
          )
            throw new Error("安装目录已有其他项目，已保留原有内容。");
          // A committed project is user-owned, including subsequent edits.
          return detail(root, await read(root, workspace.id));
        }
        await mkdir(join(root, "builds"), { recursive: true });
        await directory(join(root, "builds"));
        const now = Date.now();
        const hash = sourceHash(template.files);
        const artifact: ArtifactRecord = {
          id: workspace.id,
          projectId: workspace.id,
          sourceHash: hash,
          sourceRevision: 0,
          createdAt: now,
          files: template.files,
          sourceLayout: 2,
          script: result.script,
          style: result.style,
        };
        // Partial writes can be resumed; external edits are never overwritten.
        await applySource(root, {}, template.files);
        await atomicJson(
          join(root, "builds", `${workspace.id}.json`),
          artifact,
        );
        await atomicJson(
          join(root, "builds", `${installation.versionId}.json`),
          {
            ...artifact,
            id: installation.versionId,
          },
        );
        const record: ProjectRecord = {
          format: 2,
          id: workspace.id,
          name: template.name,
          description: template.description,
          revision: 0,
          createdAt: now,
          updatedAt: now,
          sourceHash: hash,
          draftBuildId: workspace.id,
          savedVersionId: installation.versionId,
          versions: [
            { id: installation.versionId, createdAt: now, sourceRevision: 0 },
          ],
          builtin: { id: template.id, version: template.version },
          files: template.files,
        };
        await writeRecord(root, record);
        return detail(root, record);
      });
    },
    async list() {
      const items: ProjectSummary[] = [];
      for (const workspace of await workspaces.list()) {
        if (workspace.isDefault) continue;
        try {
          items.push(
            await locked(workspace.id, async (_root, record) =>
              summary(record),
            ),
          );
        } catch (error) {
          items.push({
            id: workspace.id,
            name: workspace.name,
            description: "",
            revision: 0,
            createdAt: 0,
            updatedAt: 0,
            savedVersionId: null,
            error: `项目不可用：${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
      return items.sort((a, b) => {
        if (a.error || b.error) return Number(!!a.error) - Number(!!b.error);
        return a.createdAt - b.createdAt;
      });
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
        const files = starterFiles(name);
        const record: ProjectRecord = {
          format: 2,
          id: workspace.id,
          name,
          description: descriptionInput.trim(),
          revision: 0,
          createdAt: now,
          updatedAt: now,
          files,
          sourceHash: sourceHash(files),
          draftBuildId: null,
          savedVersionId: null,
          versions: [],
        };
        await applySource(root, {}, files);
        await writeRecord(root, record);
        return detail(root, record);
      } catch (error) {
        await workspaces.remove({ id: workspace.id, deleteContent: true });
        throw error;
      }
    },
    async inspect(id: string) {
      return locked(id, async (root, record) => detail(root, record));
    },
    async readFile(id: string, name: unknown) {
      const path = validateFileName(name);
      return locked(id, async (root, record) => {
        if (!Object.hasOwn(record.files, path))
          throw new Error("源码文件不存在。");
        const saved = await savedFiles(root, record);
        return {
          path,
          content: record.files[path],
          revision: record.revision,
          savedContent: saved[path] ?? null,
        };
      });
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
          sourceHash: sourceHash(files),
          revision: record.revision + 1,
          updatedAt: Date.now(),
          draftBuildId: null,
        };
        await commitSource(root, record.files, next);
        return detail(root, next);
      });
    },
    async deleteFile(id: string, name: unknown, expected: unknown) {
      const path = validateFileName(name);
      if ([MAIN_ENTRY, "package.json", "tsconfig.json"].includes(path))
        throw new Error("入口和项目配置文件不能删除。");
      return locked(id, async (root, record) => {
        revision(record, expected);
        if (!Object.hasOwn(record.files, path))
          throw new Error("源码文件不存在。");
        const files = { ...record.files };
        delete files[path];
        const next = {
          ...record,
          files,
          sourceHash: sourceHash(files),
          revision: record.revision + 1,
          updatedAt: Date.now(),
          draftBuildId: null,
        };
        await commitSource(root, record.files, next);
        return detail(root, next);
      });
    },
    async build(id: string): Promise<BuildResult> {
      return locked(id, async (root, record) => {
        const result = compile(record.files);
        if (result.diagnostics.length)
          return {
            ok: false,
            project: await detail(root, record),
            diagnostics: result.diagnostics,
          };
        const built: ArtifactRecord = {
          id: record.id,
          projectId: id,
          createdAt: Date.now(),
          sourceHash: sourceHash(record.files),
          sourceRevision: record.revision,
          files: record.files,
          sourceLayout: 2,
          script: result.script,
          style: result.style,
        };
        await directory(join(root, "builds"));
        await atomicJson(join(root, "builds", `${built.id}.json`), built);
        const next = { ...record, draftBuildId: built.id };
        await writeRecord(root, next);
        return {
          ok: true,
          project: await detail(root, next),
          artifact: publicArtifact(built),
          diagnostics: [],
        };
      });
    },
    async readArtifact(id: string, mode: "draft" | "saved") {
      return locked(id, async (root, record) => {
        const target =
          mode === "saved" ? record.savedVersionId : record.draftBuildId;
        if (!target) return null;
        const value = await artifact(root, record, target);
        if (mode === "draft" && value.sourceHash !== record.sourceHash)
          return null;
        return publicArtifact(value);
      });
    },
    async saveVersion(id: string, createNew = false) {
      return locked(id, async (root, record) => {
        if (!record.draftBuildId)
          throw new Error("请先构建当前内容，再保存版本。");
        const built = await artifact(root, record, record.draftBuildId);
        if (built.sourceHash !== record.sourceHash)
          throw new Error("构建已过期，请重新构建当前源码。");
        const isNewVersion = createNew || !record.savedVersionId;
        if (isNewVersion && record.versions.length >= 100)
          throw new Error("最多保存 100 个版本。");
        const saved: ArtifactRecord = {
          ...built,
          id: isNewVersion ? randomUUID() : record.savedVersionId!,
          createdAt: Date.now(),
          sourceRevision: record.revision,
        };
        await atomicJson(join(root, "builds", `${saved.id}.json`), saved);
        const versions = isNewVersion
          ? [
              {
                id: saved.id,
                createdAt: saved.createdAt,
                sourceRevision: saved.sourceRevision,
              },
              ...record.versions,
            ]
          : record.versions.map((version) =>
              version.id === saved.id
                ? { ...version, sourceRevision: saved.sourceRevision }
                : version,
            );
        const next = {
          ...record,
          versions,
          savedVersionId: saved.id,
          updatedAt: saved.createdAt,
        };
        await writeRecord(root, next);
        return detail(root, next);
      });
    },
    async restore(id: string, versionId: string, expected: unknown) {
      return locked(id, async (root, record) => {
        revision(record, expected);
        if (!record.versions.some((v) => v.id === versionId))
          throw new Error("保存的版本不存在。");
        const built = await artifact(root, record, versionId);
        const files = built.files;
        const next = {
          ...record,
          files,
          sourceHash: sourceHash(files),
          revision: record.revision + 1,
          draftBuildId: null,
          savedVersionId: built.id,
          updatedAt: Date.now(),
        };
        await commitSource(root, record.files, next);
        const draft: ArtifactRecord = {
          ...built,
          id: record.id,
          sourceRevision: next.revision,
          createdAt: next.updatedAt,
        };
        await atomicJson(join(root, "builds", `${draft.id}.json`), draft);
        const ready = { ...next, draftBuildId: draft.id };
        await writeRecord(root, ready);
        return detail(root, ready);
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
          const marker = await readJson<{ id: string; applications: string[] }>(
            join(projectPath, ".mewvis", "workspace.json"),
            64 * 1024,
          );
          if (
            !isId(marker.id) ||
            !marker.applications?.includes(APPLICATION_ID)
          )
            continue;
          let name = entry;
          try {
            name = (
              await readJson<ProjectMetadata>(
                join(projectPath, ".workshop", "project.json"),
                4 * 1024 * 1024,
              )
            ).name;
          } catch {
            /* An enrolled workspace can contain an interrupted install. */
          }
          records.set(marker.id, {
            id: marker.id,
            name,
            path: projectPath,
            isDefault: false,
          });
        } catch {
          /* Preview ignores directories without an application membership marker. */
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
      await mkdir(join(input.path, ".mewvis"));
      await atomicJson(join(input.path, ".mewvis", "workspace.json"), {
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
