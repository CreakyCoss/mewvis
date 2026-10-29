import {
  getApplicationDataClient,
  type ApplicationDataClient,
} from "@mewvis/app-sdk/data";
import {
  getApplicationFileClient,
  type ApplicationFileClient,
  type ApplicationFileInfo,
} from "@mewvis/app-sdk/files";
import { parseProjectDocument } from "../../projects/document";
import {
  incompatibleFiles,
  readSnapshot,
  type IncompatibleData,
} from "../../projects/incompatible";
import { type Project } from "../../projects/model";
import { projectFile } from "../../projects/paths";
import { copy } from "../../shared/utils";
import {
  parseRecord,
  trialDocument,
  type Experiment,
  type Trial,
} from "./records";
type Files = Pick<
  ApplicationFileClient,
  "mkdir" | "list" | "stat" | "readText" | "writeText" | "remove"
>;
export function createHistoryRepository(
  data: ApplicationDataClient,
  files: Files,
) {
  const incompatible = incompatibleFiles(files);
  const cache = new Map<string, { text: string; modifiedAt: number }>();
  let writes: Promise<unknown> = Promise.resolve();
  const serialize = <T>(work: () => Promise<T>) => {
    const result = writes.catch(() => {}).then(work);
    writes = result;
    return result;
  };
  const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
  async function verify(project: Project) {
    const workspace = await data.workspaces.get(project.workspaceId);
    if (
      workspace.path.replaceAll("\\", "/").replace(/\/$/, "") !==
      project.path.replace(/\/$/, "")
    )
      throw new Error("项目路径已变化，请重新打开项目。");
    const actual = parseProjectDocument(
      JSON.parse(
        await files.readText(projectFile(project.path), {
          maxBytes: 4 * 1024 * 1024,
        }),
      ),
      project,
    );
    if (actual.id !== project.id)
      throw new Error("项目标识已变化，请重新打开项目。");
  }
  return {
    flush: () => writes,
    list(project: Project) {
      return serialize(async () => {
        await verify(project);
        const trials: Trial[] = [],
          experiments: Experiment[] = [],
          errors: string[] = [],
          unsupported: IncompatibleData[] = [];
        for (const folder of ["runs", "experiments"]) {
          const directory = `${project.path}/${folder}`;
          let entries: ApplicationFileInfo[];
          try {
            entries = await files.list(directory);
          } catch (error) {
            if ((error as { code?: string }).code === "FILE_NOT_FOUND")
              continue;
            throw error;
          }
          for (const entry of entries) {
            if (entry.type !== "file" || !entry.name.endsWith(".json"))
              continue;
            let snapshot;
            try {
              snapshot = await readSnapshot(
                files,
                entry.filePath,
                16 * 1024 * 1024,
              );
              const record = parseRecord(JSON.parse(snapshot.text), project.id);
              const isTrial = "run" in record;
              if (
                entry.name !== `${record.id}.json` ||
                (folder === "runs") !== isTrial
              )
                throw new Error("记录文件名或目录不匹配。");
              cache.set(entry.filePath, {
                text: snapshot.text,
                modifiedAt: snapshot.modifiedAt,
              });
              if ("run" in record) trials.push(record);
              else experiments.push(record);
            } catch (cause) {
              cache.delete(entry.filePath);
              if (snapshot)
                unsupported.push(
                  incompatible.report(
                    entry.filePath,
                    snapshot,
                    cause instanceof Error ? cause.message : String(cause),
                  ),
                );
              errors.push(
                `${folder}/${entry.name}：${cause instanceof Error ? cause.message : String(cause)}`,
              );
            }
          }
        }
        const sort = <T extends { createdAt: string }>(items: T[]) =>
          items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return {
          trials: sort(trials),
          experiments: sort(experiments),
          errors,
          incompatible: unsupported,
        };
      });
    },
    removeIncompatible(project: Project, id: string) {
      return serialize(async () => {
        await verify(project);
        const path = await incompatible.remove(id, project.path);
        cache.delete(path);
      });
    },
    save(project: Project, record: Trial | Experiment) {
      const snapshot = copy(record),
        location = copy(project);
      return serialize(async () => {
        await verify(location);
        if (
          snapshot.projectId !== location.id ||
          !/^[a-zA-Z0-9_-]{1,100}$/.test(snapshot.id)
        )
          throw new Error("运行记录与项目不匹配。");
        const folder = "run" in snapshot ? "runs" : "experiments";
        const path = `${location.path}/${folder}/${snapshot.id}.json`;
        const document = "run" in snapshot ? trialDocument(snapshot) : snapshot;
        const text = json(document),
          previous = cache.get(path);
        if (new TextEncoder().encode(text).byteLength > 16 * 1024 * 1024)
          throw new Error(
            "运行记录超过 16 MiB，已保存的记录保留。请减少规则或样本规模。",
          );
        if (previous?.text === text) return;
        await files.mkdir(`${location.path}/${folder}`);
        // An unknown or externally edited file is never silently replaced.
        if (
          previous &&
          (await files.readText(path, { maxBytes: 16 * 1024 * 1024 })) !==
            previous.text
        )
          throw new Error("运行记录已在外部修改，请重新加载记录后再继续。");
        const info = await files.writeText(
          path,
          text,
          previous
            ? { overwrite: true, expectedModifiedAt: previous.modifiedAt }
            : undefined,
        );
        cache.set(path, { text, modifiedAt: info.modifiedAt });
      });
    },
  };
}
let repository: ReturnType<typeof createHistoryRepository> | undefined;
export const historyRepository = () =>
  (repository ??= createHistoryRepository(
    getApplicationDataClient(),
    getApplicationFileClient(),
  ));
