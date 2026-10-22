import type {
  ApplicationWorkspace,
  ApplicationWorkspaces,
} from "@mewvis/app-sdk/data";
import type { ApplicationFileClient } from "@mewvis/app-sdk/files";
import {
  MAX_BYTES,
  isAssetPath,
  restore,
  template,
  type Design,
} from "./model";

export type Project = {
  workspace: ApplicationWorkspace;
  design: Design;
  modifiedAt: number;
};
export type ProjectEntry = {
  workspace: ApplicationWorkspace;
  title: string;
  modifiedAt: number;
  error?: string;
};
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
export const normalizeRoot = (path: string) =>
  path.replaceAll("\\", "/").replace(/\/+$/, "");
export const workspaceFile = (workspace: ApplicationWorkspace, path: string) =>
  `${normalizeRoot(workspace.path)}/${path}`;

export function createRepository(
  workspaces: ApplicationWorkspaces,
  files: ApplicationFileClient,
) {
  async function verify(project: Project) {
    const workspace = await workspaces.get(project.workspace.id);
    if (normalizeRoot(workspace.path) !== normalizeRoot(project.workspace.path))
      throw new Error("工作区目录已变化，请返回列表重新打开。");
    return workspace;
  }
  async function open(id: string): Promise<Project> {
    const workspace = await workspaces.get(id);
    const path = workspaceFile(workspace, "design.json");
    // readText detects changes during its read; bracket it to retain a matching write precondition.
    const before = await files.stat(path);
    const design = restore(
      JSON.parse(await files.readText(path, { maxBytes: MAX_BYTES })),
    );
    const after = await files.stat(path);
    if (before.modifiedAt !== after.modifiedAt || before.size !== after.size)
      throw new Error("设计文件在读取时发生变化，请重新打开。");
    return { workspace, design, modifiedAt: after.modifiedAt };
  }
  return {
    files,
    open,
    selectDirectory: () => workspaces.selectDirectory(),
    async list(): Promise<ProjectEntry[]> {
      const entries: ProjectEntry[] = [];
      for (const workspace of await workspaces.list()) {
        if (workspace.isDefault) continue;
        try {
          const project = await open(workspace.id);
          entries.push({
            workspace,
            title: project.design.title,
            modifiedAt: project.modifiedAt,
          });
        } catch (error) {
          entries.push({
            workspace,
            title: workspace.name,
            modifiedAt: 0,
            error: errorText(error),
          });
        }
      }
      return entries.sort((a, b) => b.modifiedAt - a.modifiedAt);
    },
    async create(name: string, parent: string): Promise<Project | null> {
      const title = name.trim();
      const leaf = title
        .replace(/[\x00-\x1f\x7f/\\:*?"<>|]+/g, "-")
        .replace(/^[. -]+|[. -]+$/g, "");
      if (!title || title.length > 80 || !leaf || !parent.trim())
        throw new Error("请填写设计名称并选择工作区父目录。");
      const workspace = await workspaces.create({
        name: title,
        path: `${normalizeRoot(parent)}/${leaf}`,
        exclusive: true,
      });
      if (!workspace) return null;
      try {
        await files.mkdir(workspaceFile(workspace, "assets"));
        await files.mkdir(workspaceFile(workspace, "exports"));
        const design = { ...template("intro"), title };
        const info = await files.writeText(
          workspaceFile(workspace, "design.json"),
          JSON.stringify(design),
        );
        return { workspace, design, modifiedAt: info.modifiedAt };
      } catch (error) {
        await workspaces
          .remove({ id: workspace.id, deleteContent: true })
          .catch(() => {});
        throw error;
      }
    },
    async attach(path: string): Promise<Project | null> {
      const name = normalizeRoot(path).split("/").at(-1) || "设计画布";
      const workspace = await workspaces.create({ name, path });
      return workspace ? open(workspace.id) : null;
    },
    // Only detach: files remain in place and can be opened again.
    remove: (id: string) => workspaces.remove({ id }),
    async save(project: Project, design: Design) {
      const snapshot = restore(design);
      const workspace = await verify(project);
      const info = await files.writeText(
        workspaceFile(workspace, "design.json"),
        JSON.stringify(snapshot),
        {
          overwrite: true,
          expectedModifiedAt: project.modifiedAt,
        },
      );
      project.modifiedAt = info.modifiedAt;
      project.design = snapshot;
    },
    async importAsset(project: Project, bytes: Uint8Array, mime: string) {
      const extension = (
        {
          "image/png": "png",
          "image/jpeg": "jpeg",
          "image/webp": "webp",
        } as Record<string, string>
      )[mime];
      if (!extension || !bytes.length || bytes.length > 10 * 1024 * 1024)
        throw new Error("请选择 10 MiB 以内的 PNG、JPEG 或 WebP 图片。");
      const workspace = await verify(project);
      const src = `assets/${crypto.randomUUID()}.${extension}`;
      await files.mkdir(workspaceFile(workspace, "assets"));
      await files.writeBinary(workspaceFile(workspace, src), bytes);
      return src;
    },
    async readAsset(project: Project, src: string) {
      if (!isAssetPath(src)) throw new Error("素材路径无效。");
      const workspace = await verify(project);
      return files.readBinary(workspaceFile(workspace, src), {
        maxBytes: 10 * 1024 * 1024,
      });
    },
    async exportFile(
      project: Project,
      bytes: Uint8Array,
      kind: "png" | "html",
    ) {
      const workspace = await verify(project);
      await files.mkdir(workspaceFile(workspace, "exports"));
      const path = workspaceFile(
        workspace,
        `exports/design-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${kind}`,
      );
      await files.writeBinary(path, bytes);
      return path;
    },
  };
}
export type DesignRepository = ReturnType<typeof createRepository>;
