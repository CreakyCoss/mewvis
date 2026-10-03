import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ApplicationWorkspaces } from "@mewvis/app-sdk/data";
import type {
  BuiltinDefinition,
  BuiltinInitialization,
  BuiltinInstallation,
} from "../contracts.js";
import type { createProjectService } from "./projects.js";
import {
  atomicJson,
  directory,
  errorCode,
  isId,
  readJson,
  withDirectoryLock,
} from "./files.js";

interface Installations {
  format: 1;
  entries: Record<string, BuiltinInstallation>;
}

export function createBuiltinService(
  workspaces: ApplicationWorkspaces,
  projects: ReturnType<typeof createProjectService>,
  definitions: readonly BuiltinDefinition[],
) {
  const catalog = () =>
    definitions.map(({ files: _files, ...summary }) => summary);
  async function stored<T>(
    action: (
      state: Installations,
      save: () => Promise<void>,
      base: string,
    ) => Promise<T>,
  ) {
    const workspace = (await workspaces.list()).find((w) => w.isDefault);
    if (!workspace) throw new Error("默认工作区不可用。");
    const base = await realpath(workspace.path);
    const root = join(base, ".workshop");
    await mkdir(root, { recursive: true });
    await directory(root);
    return withDirectoryLock(root, async () => {
      const path = join(root, "builtins.json");
      let state: Installations;
      try {
        state = await readJson<Installations>(path, 1024 * 1024);
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error;
        state = { format: 1, entries: {} };
      }
      if (
        !state ||
        state.format !== 1 ||
        !state.entries ||
        typeof state.entries !== "object" ||
        Array.isArray(state.entries) ||
        Object.entries(state.entries).some(
          ([id, item]) =>
            !/^[a-z][a-z0-9-]{0,63}$/.test(id) ||
            !item ||
            !isId(item.directoryId) ||
            !isId(item.versionId) ||
            !Number.isSafeInteger(item.version) ||
            item.version < 1 ||
            (item.projectId !== null && !isId(item.projectId)) ||
            !["pending", "installed", "deleted"].includes(item.status),
        )
      )
        throw new Error("内置小应用安装记录无效，已保留现有项目。");
      return action(state, () => atomicJson(path, state), base);
    });
  }
  const reservation = (template: BuiltinDefinition): BuiltinInstallation => ({
    directoryId: randomUUID(),
    versionId: randomUUID(),
    version: template.version,
    projectId: null,
    status: "pending",
  });
  async function finish(
    template: BuiltinDefinition,
    entry: BuiltinInstallation,
    save: () => Promise<void>,
  ) {
    if (template.version !== entry.version)
      throw new Error("安装中断后模板已更新，请从「新建小应用」添加最新副本。");
    const project = await projects.createBuiltin(template, entry);
    entry.projectId = project.id;
    entry.status = "installed";
    await save();
    return project;
  }
  return {
    catalog,
    async initialize(): Promise<BuiltinInitialization> {
      const builtins = catalog();
      if (!definitions.length) return { builtins, errors: [] };
      return stored(async (state, save) => {
        const errors: string[] = [];
        for (const template of definitions) {
          try {
            if (!Object.hasOwn(state.entries, template.id)) {
              state.entries[template.id] = reservation(template);
              await save();
            }
            const entry = state.entries[template.id];
            // Both installed and deleted entries are retained across upgrades.
            if (entry.status === "pending") await finish(template, entry, save);
          } catch (error) {
            errors.push(
              `${template.name}：${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        return { builtins, errors };
      });
    },
    async create(id: unknown) {
      const template = definitions.find((entry) => entry.id === id);
      if (!template) throw new Error("内置小应用不存在。");
      return stored(async (state, save, base) => {
        const previous = Object.hasOwn(state.entries, template.id)
          ? state.entries[template.id]
          : undefined;
        if (
          previous?.status === "pending" &&
          previous.version !== template.version
        ) {
          const workspace = (await workspaces.list()).find(
            (w) => w.path === join(base, "projects", previous.directoryId),
          );
          if (workspace) {
            try {
              await projects.inspect(workspace.id);
            } catch {
              throw new Error("请先删除安装未完成的小应用，再添加最新模板。");
            }
          }
        }
        // Retry an unfinished install. Otherwise an explicit action creates a new
        // copy of the current template, preserving every existing user project.
        const entry =
          previous?.status === "pending" &&
          previous.version === template.version
            ? previous
            : reservation(template);
        state.entries[template.id] = entry;
        await save();
        return finish(template, entry, save);
      });
    },
    async remove(id: string) {
      // Consult the journal even when a newer distribution has an empty catalog.
      return stored(async (state, save, base) => {
        const workspace = await workspaces.get(id);
        const entry = Object.values(state.entries).find(
          (entry) =>
            entry.projectId === id ||
            workspace.path === join(base, "projects", entry.directoryId),
        );
        const previous = entry?.status;
        if (entry) {
          entry.status = "deleted";
          await save();
        }
        try {
          try {
            await projects.remove(id);
          } catch (error) {
            // The workspace may have been enrolled before project.json was
            // committed. Explicit deletion still uses host ownership checks.
            if (
              entry &&
              previous === "pending" &&
              errorCode(error) === "ENOENT"
            )
              await workspaces.remove({ id, deleteContent: true });
            else throw error;
          }
        } catch (error) {
          if (entry && previous) {
            entry.status = previous;
            await save();
          }
          throw error;
        }
      });
    },
  };
}
