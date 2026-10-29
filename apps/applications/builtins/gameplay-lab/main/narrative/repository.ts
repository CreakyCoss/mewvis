import {
  getApplicationDataClient,
  type ApplicationDataClient,
} from "@mewvis/app-sdk/data";
import {
  getApplicationFileClient,
  type ApplicationFileClient,
  type ApplicationFileInfo,
} from "@mewvis/app-sdk/files";
import { parseProjectDocument } from "../projects/document";
import {
  incompatibleFiles,
  readSnapshot,
  type IncompatibleData,
} from "../projects/incompatible";
import { type Project } from "../projects/model";
import { projectFile } from "../projects/paths";
import { copy } from "../shared/utils";
import { type NarrativeModel } from "./model";
import { parseStoryRecord, type StoryRecord } from "./records";
type Files = Pick<
  ApplicationFileClient,
  "mkdir" | "list" | "stat" | "readText" | "writeText" | "remove"
>;
export function createNarrativeHistory(
  data: ApplicationDataClient,
  files: Files,
) {
  const incompatible = incompatibleFiles(files);
  const cache = new Map<string, { text: string; modifiedAt: number }>();
  let pending: Promise<unknown> = Promise.resolve();
  const serialize = <T>(fn: () => Promise<T>) => {
    const next = pending.catch(() => {}).then(fn);
    pending = next;
    return next;
  };
  async function verify(p: Project<NarrativeModel>) {
    const w = await data.workspaces.get(p.workspaceId);
    if (
      w.path.replaceAll("\\", "/").replace(/\/$/, "") !==
      p.path.replace(/\/$/, "")
    )
      throw new Error("项目目录已变化，请重新打开。");
    const actual = parseProjectDocument(
      JSON.parse(
        await files.readText(projectFile(p.path), {
          maxBytes: 4 * 1024 * 1024,
        }),
      ),
      p,
    );
    if (actual.id !== p.id || actual.model.format !== "gameplay-narrative-v1")
      throw new Error("项目身份或类型已变化，请重新打开。");
  }
  return {
    flush: () => pending,
    list(p: Project<NarrativeModel>) {
      return serialize(async () => {
        await verify(p);
        const records: StoryRecord[] = [],
          errors: string[] = [],
          unsupported: IncompatibleData[] = [];
        let entries: ApplicationFileInfo[];
        try {
          entries = await files.list(`${p.path}/runs`);
        } catch (error) {
          if ((error as { code?: string }).code !== "FILE_NOT_FOUND")
            throw error;
          entries = [];
        }
        for (const entry of entries) {
          if (entry.type !== "file" || !entry.name.endsWith(".json")) continue;
          let snapshot;
          try {
            snapshot = await readSnapshot(
              files,
              entry.filePath,
              4 * 1024 * 1024,
            );
            const { text, modifiedAt } = snapshot;
            const r = parseStoryRecord(JSON.parse(text), p.id);
            if (entry.name !== `${r.id}.json`)
              throw new Error("记录名称与文件不符。");
            cache.set(entry.filePath, { text, modifiedAt });
            records.push(r);
          } catch (e) {
            cache.delete(entry.filePath);
            if (snapshot)
              unsupported.push(
                incompatible.report(
                  entry.filePath,
                  snapshot,
                  e instanceof Error ? e.message : String(e),
                ),
              );
            errors.push(`${entry.name}：${(e as Error).message}`);
          }
        }
        return {
          records: records.sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          ),
          errors,
          incompatible: unsupported,
        };
      });
    },
    removeIncompatible(project: Project<NarrativeModel>, id: string) {
      return serialize(async () => {
        await verify(project);
        const path = await incompatible.remove(id, project.path);
        cache.delete(path);
      });
    },
    save(project: Project<NarrativeModel>, record: StoryRecord) {
      const p = copy(project),
        r = parseStoryRecord(record, p.id);
      return serialize(async () => {
        await verify(p);
        const path = `${p.path}/runs/${r.id}.json`,
          text = JSON.stringify(r, null, 2) + "\n",
          previous = cache.get(path);
        if (new TextEncoder().encode(text).byteLength > 4 * 1024 * 1024)
          throw new Error("剧情记录超过 4 MiB。");
        if (previous?.text === text) return;
        if (
          previous &&
          (await files.readText(path, { maxBytes: 4 * 1024 * 1024 })) !==
            previous.text
        )
          throw new Error("剧情记录已被外部修改，请重新加载记录后继续。");
        await files.mkdir(`${p.path}/runs`);
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
let repository: ReturnType<typeof createNarrativeHistory> | undefined;
export const narrativeHistory = () =>
  (repository ??= createNarrativeHistory(
    getApplicationDataClient(),
    getApplicationFileClient(),
  ));
