import {
  createNativeCollaborationExecutor,
  nativeCollaborationExecutorId,
  CollaborationStepRunError,
} from "./native.js";

import {
  createLangGraphCollaborationExecutor,
  langGraphCollaborationExecutorId,
} from "./langgraph.js";

export {
  createNativeCollaborationExecutor,
  nativeCollaborationExecutorId,
  CollaborationStepRunError,
} from "./native.js";

export {
  createLangGraphCollaborationExecutor,
  langGraphCollaborationExecutorId,
} from "./langgraph.js";

export const collaborationExecutorManifest = Object.freeze({
  defaultExecutorId: langGraphCollaborationExecutorId,
  executorIds: Object.freeze([
    nativeCollaborationExecutorId,
    langGraphCollaborationExecutorId,
  ]),
});

export const createBuiltinCollaborationExecutors = () => [
  createNativeCollaborationExecutor(),
  createLangGraphCollaborationExecutor(),
] as const;
