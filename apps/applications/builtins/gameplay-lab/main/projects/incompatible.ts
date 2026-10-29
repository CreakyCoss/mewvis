import type { ApplicationFileClient } from "@mewvis/app-sdk/files";
import { uid } from "../shared/utils";

export interface IncompatibleData {
  id: string;
  name: string;
  path: string;
  reason: string;
  consequence: string;
}
export class IncompatibleDataError extends Error {
  constructor(public readonly item: IncompatibleData) {
    super(`${item.reason} 数据已保留，请返回项目库查看并确认处理。`);
  }
}
export interface FileSnapshot {
  text: string;
  modifiedAt: number;
  size: number;
}
type Files = Pick<ApplicationFileClient, "stat" | "readText" | "remove">;
export async function readSnapshot(
  files: Files,
  path: string,
  maxBytes: number,
): Promise<FileSnapshot> {
  const before = await files.stat(path);
  const text = await files.readText(path, { maxBytes });
  const after = await files.stat(path);
  if (before.modifiedAt !== after.modifiedAt || before.size !== after.size)
    throw new Error("文件正在修改，请重新加载。");
  return { text, modifiedAt: after.modifiedAt, size: after.size };
}
export async function verifySnapshot(
  files: Files,
  path: string,
  expected: FileSnapshot,
) {
  const actual = await readSnapshot(files, path, 16 * 1024 * 1024);
  if (
    actual.text !== expected.text ||
    actual.modifiedAt !== expected.modifiedAt ||
    actual.size !== expected.size
  )
    throw new Error("数据已在外部修改，请重新加载后再次确认删除。");
}
/** A failed read only records a candidate. Deletion is a separate, explicit operation. */
export function incompatibleFiles(files: Files) {
  const candidates = new Map<
    string,
    { item: IncompatibleData; snapshot: FileSnapshot }
  >();
  return {
    report(path: string, snapshot: FileSnapshot, reason: string) {
      const item: IncompatibleData = {
        id: uid("incompatible"),
        name: path.split("/").at(-1) ?? path,
        path,
        reason,
        consequence: "将永久删除这一个记录文件。项目规则和其他记录会保留。",
      };
      candidates.set(item.id, { item, snapshot });
      return item;
    },
    async remove(id: string, projectPath: string) {
      const candidate = candidates.get(id);
      if (!candidate || !candidate.item.path.startsWith(`${projectPath}/`))
        throw new Error("待删除记录已变化，请重新加载后再次确认。");
      await verifySnapshot(files, candidate.item.path, candidate.snapshot);
      await files.remove(candidate.item.path);
      candidates.delete(id);
      return candidate.item.path;
    },
  };
}
