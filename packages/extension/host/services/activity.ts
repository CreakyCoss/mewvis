import { mkdir, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import type { ExtensionActivitySnapshot } from "./contracts.js";

export type ActivityRecord = ExtensionActivitySnapshot & { taskId: string };
/** Host-owned transport snapshot. Plugin code never receives this path or another plugin's identity. */
export function createActivityStore(sessionRoot: string, extensionId: string) {
  if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(extensionId))
    throw new Error("无效插件身份");
  const directory = join(sessionRoot, "extensions", "activity");
  const file = join(directory, `${extensionId}.json`);
  async function checked() {
    await mkdir(directory, { recursive: true });
    const canonicalDirectory = join(
      await realpath(sessionRoot),
      "extensions",
      "activity",
    );
    if ((await realpath(directory)) !== canonicalDirectory)
      throw new Error("插件活动目录不可为符号链接");
    return join(canonicalDirectory, `${extensionId}.json`);
  }
  return {
    async read(): Promise<ActivityRecord | null> {
      try {
        const canonicalFile = await checked();
        if ((await realpath(file)) !== canonicalFile)
          throw new Error("插件活动文件不可为符号链接");
        return JSON.parse(await readFile(file, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async write(value: ActivityRecord) {
      await checked();
      await writeFileAtomic(file, JSON.stringify(value), {
        mode: 0o600,
        dirMode: 0o700,
      });
    },
  };
}
