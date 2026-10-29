import {
  getApplicationDataClient,
  type ApplicationDataClient,
} from "@mewvis/app-sdk/data";
import {
  getApplicationFileClient,
  type ApplicationFileClient,
} from "@mewvis/app-sdk/files";
import { parseProjectDocument } from "../../projects/document";
import { type Project } from "../../projects/model";
import { projectFile } from "../../projects/paths";
import { copy } from "../../shared/utils";
import { defaultPlaytest, parsePlaytest, type PlaytestConfig } from "./config";
export const PLAYTEST_FILE = "configs/playtest.json";
type Files = Pick<
  ApplicationFileClient,
  "mkdir" | "stat" | "readText" | "writeText"
>;
export function createPlaytestRepository(
  data: ApplicationDataClient,
  files: Files,
) {
  const cache = new Map<
    string,
    { projectId: string; text: string | null; modifiedAt?: number }
  >();
  let writes: Promise<unknown> = Promise.resolve();
  const serialize = <T>(work: () => Promise<T>) => {
    const next = writes.catch(() => {}).then(work);
    writes = next;
    return next;
  };
  const path = (p: Project) => `${p.path}/${PLAYTEST_FILE}`;
  async function verify(p: Project) {
    const registered = await data.workspaces.get(p.workspaceId);
    if (
      registered.path.replaceAll("\\", "/").replace(/\/$/, "") !==
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
    if (actual.id !== p.id) throw new Error("项目标识已变化，请重新打开。");
  }
  return {
    flush: () => writes,
    load(project: Project) {
      const p = copy(project);
      return serialize(async () => {
        await verify(p);
        const file = path(p);
        cache.delete(file);
        let before;
        try {
          before = await files.stat(file);
        } catch (cause) {
          if ((cause as { code?: string }).code !== "FILE_NOT_FOUND")
            throw cause;
          cache.set(file, { projectId: p.id, text: null });
          return defaultPlaytest(p.id);
        }
        const text = await files.readText(file, { maxBytes: 1024 * 1024 }),
          after = await files.stat(file);
        if (
          before.modifiedAt !== after.modifiedAt ||
          before.size !== after.size
        )
          throw new Error("场景与策略文件正在修改，请重新加载。");
        const config = parsePlaytest(JSON.parse(text), p.id);
        cache.set(file, {
          projectId: p.id,
          text,
          modifiedAt: after.modifiedAt,
        });
        return config;
      });
    },
    save(project: Project, value: PlaytestConfig) {
      const p = copy(project),
        config = parsePlaytest(value, p.id);
      return serialize(async () => {
        await verify(p);
        const file = path(p),
          old = cache.get(file),
          text = JSON.stringify(config, null, 2) + "\n";
        if (!old || old.projectId !== p.id)
          throw new Error("请先重新加载场景与策略配置，再保存修改。");
        if (text === old.text) return;
        if (new TextEncoder().encode(text).byteLength > 1024 * 1024)
          throw new Error("场景与策略配置不能超过 1 MiB。");
        if (
          old.text !== null &&
          (await files.readText(file, { maxBytes: 1024 * 1024 })) !== old.text
        )
          throw new Error("场景与策略已在外部修改，请重新加载配置后再继续。");
        await files.mkdir(`${p.path}/configs`);
        const info = await files.writeText(
          file,
          text,
          old.text === null
            ? undefined
            : { overwrite: true, expectedModifiedAt: old.modifiedAt },
        );
        cache.set(file, { projectId: p.id, text, modifiedAt: info.modifiedAt });
      });
    },
  };
}
let repository: ReturnType<typeof createPlaytestRepository> | undefined;
export const playtestRepository = () =>
  (repository ??= createPlaytestRepository(
    getApplicationDataClient(),
    getApplicationFileClient(),
  ));
