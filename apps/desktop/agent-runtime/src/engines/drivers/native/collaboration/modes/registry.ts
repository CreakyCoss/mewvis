import type { CollaborationModeDefinition } from "./contracts.js";
import type { CollaborationModeId, CollaborationModeSummary } from "../../../../protocol/index.js";
import { producerReviewRewriteLoopMode } from "./producer-review-rewrite-loop/index.js";
import { supervisorDispatchLoopMode } from "./supervisor-dispatch-loop/index.js";

export const builtinCollaborationModes = [
  supervisorDispatchLoopMode,
  producerReviewRewriteLoopMode,
] satisfies CollaborationModeDefinition[];

export const createCollaborationModeRegistry = (
  modes: readonly CollaborationModeDefinition[] = builtinCollaborationModes,
) => {
  const modeById = new Map<CollaborationModeId, CollaborationModeDefinition>();
  for (const mode of modes) {
    if (modeById.has(mode.id)) {
      throw new Error(`协作 mode 重复注册：${mode.id}`);
    }
    modeById.set(mode.id, mode);
  }

  return {
    get(id: CollaborationModeId) {
      return modeById.get(id);
    },
    require(id: CollaborationModeId) {
      const mode = modeById.get(id);
      if (!mode) {
        throw new Error(`协作 mode 未注册：${id}`);
      }
      return mode;
    },
    list(): CollaborationModeSummary[] {
      return [...modeById.values()]
        .map((mode) => ({
          id: mode.id,
          label: mode.label,
          version: mode.version,
        }))
        .sort((left, right) => left.id.localeCompare(right.id));
    },
  };
};

export type CollaborationModeRegistry = ReturnType<typeof createCollaborationModeRegistry>;
