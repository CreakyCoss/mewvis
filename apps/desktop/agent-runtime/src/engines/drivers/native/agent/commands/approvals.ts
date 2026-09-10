import { randomUUID } from "node:crypto";
import { AgentRuntimeEventType as E, type AnswerApprovalParams } from "../../../../protocol/wire.js";
import type { AgentApprovalRequest, EmitAgentEvent } from "../runtimes/types.js";

export const APPROVAL_TIMEOUT_MS = 60_000;

type Pending = {
  id: string;
  finish(approved: boolean): void;
  start(): void;
};

/** Separate from ask_user: ordinary question answers can never authorize execution. */
export function createApprovalManager(emit: EmitAgentEvent) {
  const queues = new Map<string, Pending[]>();
  const next = (taskId: string) => queues.get(taskId)?.[0]?.start();
  return {
    request(input: AgentApprovalRequest): Promise<boolean> {
      const request = Object.freeze({ ...input });
      request.signal?.throwIfAborted();
      return new Promise((resolve) => {
        const expiresAt = Date.now() + APPROVAL_TIMEOUT_MS;
        let started = false;
        let settled = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const pending: Pending = {
          id: randomUUID(),
          start() {
            if (started || settled) return;
            if (request.signal?.aborted || Date.now() >= expiresAt) {
              pending.finish(false);
              return;
            }
            started = true;
            emit({
              type: E.ApprovalRequested,
              taskId: request.taskId,
              approvalId: pending.id,
              executionId: request.executionId,
              summary: request.summary,
              details: request.details,
              reason: request.reason,
              expiresAt,
            });
          },
          finish(approved) {
            if (settled) return;
            approved = approved && !request.signal?.aborted && Date.now() < expiresAt;
            settled = true;
            clearTimeout(timeout);
            request.signal?.removeEventListener("abort", abort);
            const queue = queues.get(request.taskId) ?? [];
            const index = queue.indexOf(pending);
            if (index >= 0) queue.splice(index, 1);
            if (!queue.length) queues.delete(request.taskId);
            if (started)
              emit({
                type: E.ApprovalResolved,
                taskId: request.taskId,
                approvalId: pending.id,
                approved,
              });
            resolve(approved);
            if (index === 0) next(request.taskId);
          },
        };
        const abort = () => pending.finish(false);
        // Includes queue time: no invocation waits indefinitely behind another approval.
        timeout = setTimeout(() => pending.finish(false), APPROVAL_TIMEOUT_MS);
        const queue = queues.get(request.taskId) ?? [];
        queue.push(pending);
        queues.set(request.taskId, queue);
        request.signal?.addEventListener("abort", abort, { once: true });
        if (request.signal?.aborted) abort();
        else next(request.taskId);
      });
    },
    answer(input: AnswerApprovalParams) {
      const pending = queues.get(input.taskId)?.[0];
      // A stale notification must not emit a task error or unlock another operation.
      if (!pending || pending.id !== input.approvalId) return false;
      pending.finish(input.approved);
      return true;
    },
  };
}
