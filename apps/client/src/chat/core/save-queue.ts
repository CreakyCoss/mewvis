import type { OperationResult } from "@mewvis/chat-contracts";
import { errorText } from "./contracts";

/** A rejected write never poisons the queue; dirty revisions are retained until acknowledged. */
export function createSaveQueue<T>(
  write: (value: T) => Promise<void>,
  changed: (dirty: boolean, error: string) => void,
) {
  let lastError = "";
  let revision = 0;
  let savedRevision = 0;
  let latest: T;
  let queue = Promise.resolve();
  let nodeTimer: ReturnType<typeof setTimeout> | undefined;
  let streamTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelTimers = () => {
    clearTimeout(nodeTimer);
    clearTimeout(streamTimer);
    nodeTimer = streamTimer = undefined;
  };
  const flush = async (): Promise<OperationResult> => {
    cancelTimers();
    const result = queue.then(async () => {
      if (revision === savedRevision) return { ok: true } as const;
      const writingRevision = revision;
      const value = latest;
      try {
        await write(value);
        lastError = "";
        savedRevision = writingRevision;
        changed(revision !== savedRevision, "");
        return { ok: true } as const;
      } catch (error) {
        const message = errorText(error);
        lastError = message;
        changed(true, message);
        return { ok: false, error: message } as const;
      }
    });
    queue = result.then(() => undefined);
    return result;
  };
  return {
    mark(value: T) {
      latest = value;
      revision++;
      changed(true, lastError);
    },
    schedule(kind: "node" | "stream", delay: number) {
      if (kind === "node") {
        clearTimeout(nodeTimer);
        nodeTimer = setTimeout(() => {
          void flush();
        }, delay);
      } else if (!streamTimer) {
        streamTimer = setTimeout(() => {
          void flush();
        }, delay);
      }
    },
    flush,
    isDirty: () => revision !== savedRevision,
    cancelTimers,
  };
}
