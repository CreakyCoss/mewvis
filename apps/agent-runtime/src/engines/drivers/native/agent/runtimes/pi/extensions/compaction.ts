import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type {
  ExtensionBindings,
  ExtensionCompactionRequest,
  ExtensionCompactionResult,
  ExtensionMiddlewareOutcome,
} from "@isle/extension-host";

export const isPiCompactionSkipped = (message: string) =>
  message === "Nothing to compact (session too small)" || message === "Already compacted";

export function registerPiCompactionHooks(
  pi: ExtensionAPI,
  bindings: ExtensionBindings,
  taskId: string,
  intercept: (
    data: ExtensionCompactionRequest,
    signal: AbortSignal,
  ) => Promise<ExtensionMiddlewareOutcome<"session_compact">>,
) {
  const controls = bindings.catalog.middleware.some((item) => item.type === "session_compact");
  const observes = bindings.catalog.subscriptions.some((item) => item.events.includes("session_compact_finished"));
  if (!controls && !observes) return;
  let attempt: { id: string; blocked?: string; failure?: string } | undefined;
  const finish = async (result: Omit<ExtensionCompactionResult, "operationId">) => {
    const operationId = attempt?.id ?? randomUUID();
    attempt = undefined;
    if (observes) await bindings.notify({ type: "session_compact_finished", taskId, operationId, ...result });
  };
  pi.on("session_before_compact", async (event) => {
    attempt = { id: randomUUID() };
    if (!controls) return;
    try {
      const reply = await intercept(
        {
          operationId: attempt.id,
          reason: event.reason,
          willRetry: event.willRetry,
          instructions: event.customInstructions ?? null,
          tokensBefore: event.preparation.tokensBefore,
        },
        event.signal,
      );
      if (reply.action === "block") {
        attempt.blocked = reply.reason;
        return { cancel: true };
      }
    } catch (error) {
      // Pi swallows extension errors. Explicitly cancel before its native summarizer runs;
      // the shared health guard propagates the original middleware error at the operation boundary.
      attempt.failure = error instanceof Error ? error.message : String(error);
      return { cancel: true };
    }
  });
  pi.on("session_compact", (event) =>
    finish({ reason: event.reason, status: "completed", summary: event.compactionEntry.summary, message: null }),
  );
  pi.on("session_compact_failed", (event) =>
    finish({
      reason: event.reason,
      status:
        attempt?.failure !== undefined
          ? "failed"
          : attempt?.blocked
            ? "blocked"
            : event.aborted
              ? "cancelled"
              : isPiCompactionSkipped((event.errorMessage ?? "").replace(/^Compaction failed: /, ""))
                ? "skipped"
                : "failed",
      summary: null,
      message: attempt?.failure ?? attempt?.blocked ?? event.errorMessage ?? null,
    }),
  );
}
