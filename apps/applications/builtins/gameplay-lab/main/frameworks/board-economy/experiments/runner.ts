import { copy } from "../../../shared/utils";
import type { BoardExperiment } from "./model";
import { appendBoardSample, nextBoardSample } from "./simulation";
/** Publish only persisted checkpoints. A cancellation during a write keeps that whole sample. */
export async function runBoardExperimentBatch(
  initial: BoardExperiment,
  options: {
    persist(e: BoardExperiment): Promise<void>;
    changed(e: BoardExperiment): void;
    cancelled(): boolean;
    yieldTask?(): Promise<void>;
  },
): Promise<BoardExperiment> {
  if (initial.status !== "running") throw new Error("实验尚未进入运行状态。");
  let current = copy(initial);
  while (current.status === "running") {
    await (options.yieldTask?.() ??
      new Promise((resolve) => setTimeout(resolve, 0)));
    if (options.cancelled()) {
      const stopped = {
        ...current,
        status: "cancelled" as const,
        updatedAt: new Date().toISOString(),
      };
      await options.persist(stopped);
      options.changed(stopped);
      return stopped;
    }
    const sample = nextBoardSample(current);
    if (!sample) throw new Error("实验样本数量与状态不一致。");
    const next = appendBoardSample(current, sample);
    await options.persist(next);
    current = next;
    options.changed(current);
  }
  return current;
}
