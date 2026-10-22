/** Serialize writes and coalesce changes while a file commit is in flight. */
export function createSaveQueue<T>(save: (value: T) => Promise<void>) {
  let pending: T | undefined;
  let running: Promise<void> | undefined;
  const flush = (): Promise<void> => {
    if (running) return running;
    running = (async () => {
      while (pending !== undefined) {
        const value = pending;
        pending = undefined;
        try {
          await save(value);
        } catch (error) {
          if (pending === undefined) pending = value;
          throw error;
        }
      }
    })().finally(() => {
      running = undefined;
    });
    return running;
  };
  return {
    enqueue(value: T) {
      pending = value;
    },
    flush,
  };
}
