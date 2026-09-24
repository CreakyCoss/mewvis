import { mkdir, readFile, realpath } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import type {
  ExtensionActivity,
  ExtensionActivitySnapshot,
} from "./contracts.js";
import { HostServiceError } from "./error.js";

export type ActivityRecord = Omit<
  ExtensionActivitySnapshot,
  "executionId" | "state"
> & {
  taskId: string;
  revision?: number;
  state: ExtensionActivity["state"] | "pausing" | "paused";
};
export type ActivityExecution = {
  extensionId: string;
  activityId: string;
  state: ActivityRecord["state"];
  pausable: boolean;
  revision: number;
};
export function activityExecution(
  extensionId: string,
  record: ActivityRecord,
): ActivityExecution {
  return {
    extensionId,
    activityId: record.id,
    state: record.state,
    pausable: Boolean(record.pausable),
    revision: record.revision!,
  };
}
export const isActiveActivity = (state: ExtensionActivitySnapshot["state"]) =>
  state === "running" || state === "pausing" || state === "paused";
/** Host-owned transport snapshot. Mutations share a lock across server and runtime processes. */
export function createActivityStore(sessionRoot: string, extensionId: string) {
  if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(extensionId))
    throw new Error("无效插件身份");
  const directory = join(sessionRoot, "extensions", "activity");
  const file = join(directory, `${extensionId}.json`);
  async function checked(create = false) {
    if (create) await mkdir(directory, { recursive: true });
    const canonicalDirectory = join(
      await realpath(sessionRoot),
      "extensions",
      "activity",
    );
    if ((await realpath(directory)) !== canonicalDirectory)
      throw new Error("插件活动目录不可为符号链接");
    return join(canonicalDirectory, `${extensionId}.json`);
  }
  async function read(): Promise<ActivityRecord | null> {
    try {
      const canonicalFile = await checked();
      if ((await realpath(file)) !== canonicalFile)
        throw new Error("插件活动文件不可为符号链接");
      return JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  async function update(
    change: (record: ActivityRecord | null) => ActivityRecord | null,
  ) {
    const canonicalFile = await checked(true);
    return withFileLock(canonicalFile, async () => {
      const previous = await read();
      const next = change(previous);
      if (next && next !== previous) {
        next.revision = (previous?.revision ?? 0) + 1;
        await writeFileAtomic(canonicalFile, JSON.stringify(next), {
          mode: 0o600,
          dirMode: 0o700,
        });
      }
      return next;
    });
  }
  return {
    read,
    update,
    write: async (record: ActivityRecord) => {
      await update(() => record);
    },
  };
}

/** A cooperative checkpoint never aborts the current task or replays completed work. */
export function createActivityExecution(
  store: ReturnType<typeof createActivityStore>,
  taskId: string,
  signal: AbortSignal,
  waiting: (active: boolean) => void,
  changed: (record: ActivityRecord) => void = () => {},
) {
  let activityId: string | undefined;
  return {
    async publish(value: ExtensionActivity) {
      signal.throwIfAborted();
      const record = await store.update((previous) => {
        const state =
          previous?.id === value.id &&
          previous.taskId === taskId &&
          value.state === "running" &&
          value.pausable &&
          (previous.state === "pausing" || previous.state === "paused")
            ? previous.state
            : value.state;
        return { ...value, state, taskId, updatedAt: Date.now() };
      });
      activityId = value.id;
      changed(record!);
      return null;
    },
    async checkpoint(id: string) {
      let suspended = false;
      try {
        for (;;) {
          signal.throwIfAborted();
          const record = await store.update((current) => {
            if (
              !current ||
              current.id !== id ||
              id !== activityId ||
              current.taskId !== taskId ||
              !current.pausable ||
              !isActiveActivity(current.state)
            )
              throw new HostServiceError(
                409,
                "HOST_UNAVAILABLE",
                "活动已结束或不支持暂停",
              );
            return current.state === "pausing"
              ? { ...current, state: "paused", updatedAt: Date.now() }
              : current;
          });
          if (!suspended || record!.state !== "paused") changed(record!);
          if (record!.state !== "paused") return null;
          if (!suspended) {
            suspended = true;
            waiting(true);
          }
          await delay(100, undefined, { signal });
        }
      } finally {
        if (suspended) waiting(false);
      }
    },
    async finish(state: "completed" | "failed" | "cancelled") {
      if (!activityId) return;
      const record = await store.update((current) => {
        if (
          !current ||
          current.id !== activityId ||
          current.taskId !== taskId ||
          !isActiveActivity(current.state)
        )
          return current;
        return {
          ...current,
          state,
          updatedAt: Date.now(),
          steps: current.steps.map((step) =>
            step.state === "running" ? { ...step, state } : step,
          ),
        };
      });
      if (record?.taskId === taskId) changed(record);
    },
  };
}
