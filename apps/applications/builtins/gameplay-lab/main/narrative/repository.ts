import {
  getApplicationDataClient,
  type ApplicationDataClient,
} from "@mewvis/app-sdk/data";
import {
  getApplicationFileClient,
  type ApplicationFileClient,
} from "@mewvis/app-sdk/files";
import { parseProjectDocument } from "../projects/document";
import { type Project } from "../projects/model";
import { projectFile } from "../projects/paths";
import { copy } from "../shared/utils";
import { type NarrativeModel } from "./model";
import { parseStoryRecord, type StoryRecord } from "./records";
type Files = Pick<
  ApplicationFileClient,
  "mkdir" | "list" | "stat" | "readText" | "writeText"
>;
export function createNarrativeHistory(
  data: ApplicationDataClient,
  files: Files,
) {
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
          errors: string[] = [];
        await files.mkdir(`${p.path}/runs`);
        for (const entry of await files.list(`${p.path}/runs`)) {
          if (entry.type !== "file" || !entry.name.endsWith(".json")) continue;
          try {
            const before = await files.stat(entry.filePath),
              text = await files.readText(entry.filePath, {
                maxBytes: 4 * 1024 * 1024,
              }),
              after = await files.stat(entry.filePath);
            if (
              before.modifiedAt !== after.modifiedAt ||
              before.size !== after.size
            )
              throw new Error("记录正在修改，请重新加载。");
            const r = parseStoryRecord(JSON.parse(text), p.id);
            if (entry.name !== `${r.id}.json`)
              throw new Error("记录名称与文件不符。");
            cache.set(entry.filePath, { text, modifiedAt: after.modifiedAt });
            records.push(r);
          } catch (e) {
            cache.delete(entry.filePath);
            errors.push(`${entry.name}：${(e as Error).message}`);
          }
        }
        return {
          records: records.sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          ),
          errors,
        };
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
