import {
  collaborationRuntimeManifest,
  listCollaborationRuntimes,
} from "./registry.js";
import type {
  CollaborationRuntime,
  CollaborationRuntimeId,
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
    resolve(): CollaborationRuntime {
      const id = resolveRuntimeId(defaultRuntimeId);
      const runtime = runtimeById.get(id);
      if (!runtime) {
        throw new Error(`native runtime profile 指定了未注册的协作 runtime：${id}`);
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
  defaultRuntimeId: CollaborationRuntimeId | null | undefined,
) => defaultRuntimeId?.trim() || collaborationRuntimeManifest.defaultRuntimeId;
