import {
  createNativeCollaborationRuntime,
  nativeCollaborationRuntimeId,
  CollaborationStepRunError,
} from "./native/index.js";

import { createLangGraphCollaborationRuntime, langGraphCollaborationRuntimeId } from "./langgraph/index.js";
import type { CollaborationRuntime, CollaborationRuntimeId } from "./types.js";

export {
  createNativeCollaborationRuntime,
  nativeCollaborationRuntimeId,
  CollaborationStepRunError,
} from "./native/index.js";

export { createLangGraphCollaborationRuntime, langGraphCollaborationRuntimeId } from "./langgraph/index.js";

export const collaborationRuntimeManifest = Object.freeze({
  defaultRuntimeId: langGraphCollaborationRuntimeId,
  runtimeIds: Object.freeze([nativeCollaborationRuntimeId, langGraphCollaborationRuntimeId]),
});

export const createBuiltinCollaborationRuntimes = () =>
  [createNativeCollaborationRuntime(), createLangGraphCollaborationRuntime()] as const;

const builtinCollaborationRuntimes = Object.freeze(
  createBuiltinCollaborationRuntimes(),
) satisfies readonly CollaborationRuntime[];

const createCollaborationRuntimeRegistry = (
  runtimes: readonly CollaborationRuntime[],
): Readonly<Record<string, CollaborationRuntime>> =>
  Object.freeze(Object.fromEntries(runtimes.map((runtime) => [runtime.id, runtime])));

const collaborationRuntimeRegistry = createCollaborationRuntimeRegistry(builtinCollaborationRuntimes);

export const getCollaborationRuntime = (id: CollaborationRuntimeId) => collaborationRuntimeRegistry[id] ?? null;

export const listCollaborationRuntimes = () => [...builtinCollaborationRuntimes];
