// Builtin repositories used process-local transaction queues before execution moved
// into workers. Keep their ordering in the trusted host across worker processes.
const workspaceOperations = new Map<string, Promise<void>>();
export async function serializeWorkspaceOperation<T>(
  workspace: string,
  signal: AbortSignal | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  signal?.throwIfAborted();
  const previous = workspaceOperations.get(workspace) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => gate);
  workspaceOperations.set(workspace, queued);
  void queued.then(() => {
    if (workspaceOperations.get(workspace) === queued) workspaceOperations.delete(workspace);
  });
  let onAbort: (() => void) | undefined;
  try {
    await Promise.race([
      previous,
      new Promise<never>((_, reject) => {
        if (!signal) return;
        onAbort = () => reject(signal.reason ?? new Error("操作已取消。"));
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      }),
    ]);
    signal?.throwIfAborted();
    return await operation();
  } finally {
    if (onAbort) signal?.removeEventListener("abort", onAbort);
    release();
  }
}
