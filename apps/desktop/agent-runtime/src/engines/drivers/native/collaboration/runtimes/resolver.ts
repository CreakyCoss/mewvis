import {
  collaborationRuntimeManifest,
  listCollaborationRuntimes,
} from "./registry.js";
import type {
  CollaborationRuntimeId,
} from "../../../../protocol/index.js";
import type {
  CollaborationRuntime,
} from "./types.js";

export type CollaborationRuntimeResolverOptions = {
  runtimes?: readonly CollaborationRuntime[];
  defaultRuntimeId?: CollaborationRuntimeId | null;
};

export const createCollaborationRuntimeResolver = ({
  defaultRuntimeId = collaborationRuntimeManifest.defaultRuntimeId,
  runtimes = [],
}: CollaborationRuntimeResolverOptions = {}) => {
  const runtimeById = createRuntimeRegistry([
    ...listCollaborationRuntimes(),
    ...runtimes,
  ]);

  return {
    resolve(runtimeId?: CollaborationRuntimeId | null): CollaborationRuntime {
      const id = resolveRuntimeId(runtimeId, defaultRuntimeId);
      const runtime = runtimeById.get(id);
      if (!runtime) {
        throw new Error(`协作 workflow 指定了未注册的 runtime：${id}`);
      }
      return runtime;
    },
  };
};

const createRuntimeRegistry = (
  runtimes: readonly CollaborationRuntime[],
) => {
  const runtimeById = new Map<string, CollaborationRuntime>();
  for (const runtime of runtimes) {
    runtimeById.set(runtime.id, runtime);
  }
  return runtimeById;
};

const resolveRuntimeId = (
  runtimeId: CollaborationRuntimeId | null | undefined,
  defaultRuntimeId: CollaborationRuntimeId | null | undefined,
) => {
  const normalized = typeof runtimeId === "string" ? runtimeId.trim() : "";
  return normalized || defaultRuntimeId || collaborationRuntimeManifest.defaultRuntimeId;
};
