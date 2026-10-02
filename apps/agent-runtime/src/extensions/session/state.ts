import { isJsonValue } from "@earendil-works/chord";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import type { JsonObject } from "@mewvis/extension-host";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { serializeWorkspaceOperation } from "../../security/execution/runtime/workspace-queue.js";

export type ExtensionState = Record<string, JsonObject>;

export function validateExtensionState(value: unknown): ExtensionState {
  if (!isJsonValue(value) || value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("插件状态不是 JSON 对象");
  for (const [id, state] of Object.entries(value)) {
    if (
      !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(id) ||
      state === null ||
      typeof state !== "object" ||
      Array.isArray(state)
    )
      throw new Error("插件状态命名空间无效");
  }
  if (Buffer.byteLength(JSON.stringify(value)) > 1024 * 1024) throw new Error("单个插件的会话状态超过 1 MiB");
  return value as ExtensionState;
}

export interface ExtensionStateStore {
  directory?: string;
  transact<T>(
    extensionId: string,
    signal: AbortSignal | undefined,
    action: (state: ExtensionState) => Promise<{ value: T; state: ExtensionState }>,
  ): Promise<T>;
}

/** Host-owned state. Each worker operation receives a fresh snapshot under the writer lock. */
export async function createExtensionStateStore(sessionRootDir?: string | null): Promise<ExtensionStateStore> {
  if (!sessionRootDir) {
    const states = new Map<string, ExtensionState>();
    const key = `extension-memory:${randomUUID()}`;
    return {
      transact: (extensionId, signal, action) =>
        serializeWorkspaceOperation(`${key}:${extensionId}`, signal, async () => {
          const result = await action(structuredClone(states.get(extensionId) ?? {}));
          signal?.throwIfAborted();
          states.set(extensionId, structuredClone(validateExtensionState(result.state)));
          return result.value;
        }),
    };
  }
  if (!isAbsolute(sessionRootDir)) throw new Error("插件 sessionRootDir 必须为绝对路径");
  await mkdir(sessionRootDir, { recursive: true, mode: 0o700 });
  const directory = join(await realpath(sessionRootDir), "extensions");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // Reject a substituted state directory instead of granting a worker access to its target.
  if ((await realpath(directory)) !== directory) throw new Error("插件状态目录不能为符号链接");
  return {
    directory,
    transact: (extensionId, signal, action) => {
      if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(extensionId)) throw new Error("无效的插件状态 namespace");
      const path = join(directory, `${extensionId}.json`);
      return serializeWorkspaceOperation(path, signal, () =>
        withFileLock(path, async () => {
          signal?.throwIfAborted();
          let state: ExtensionState = {};
          try {
            const document = JSON.parse(await readFile(path, "utf8"));
            if (document.version !== 1) throw new Error("不支持的插件状态版本");
            state = validateExtensionState(document.extensions);
            if (Object.keys(state).some((id) => id !== extensionId))
              throw new Error("插件状态文件包含其他插件的命名空间");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
          const before = JSON.stringify(state);
          const result = await action(structuredClone(state));
          signal?.throwIfAborted();
          const next = validateExtensionState(result.state);
          if (JSON.stringify(next) !== before)
            await writeFileAtomic(path, JSON.stringify({ version: 1, extensions: next }), {
              mode: 0o600,
              dirMode: 0o700,
            });
          return result.value;
        }),
      );
    },
  };
}
