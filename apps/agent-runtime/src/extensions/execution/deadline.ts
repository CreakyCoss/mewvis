/** Only checkpoint waiting is excluded; resuming preserves the remaining execution budget. */
export function createActiveDeadline(milliseconds: number) {
  const controller = new AbortController();
  let remaining = milliseconds,
    started = performance.now(),
    paused = false,
    disposed = false;
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    started = performance.now();
    timer = setTimeout(
      () => controller.abort(new Error("插件执行超时")),
      Math.max(0, remaining),
    );
  };
  schedule();
  return {
    signal: controller.signal,
    pause() {
      if (paused || disposed) return;
      paused = true;
      remaining -= performance.now() - started;
      clearTimeout(timer);
    },
    resume() {
      if (!paused || disposed) return;
      paused = false;
      schedule();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
