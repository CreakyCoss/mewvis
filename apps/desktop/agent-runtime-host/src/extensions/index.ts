import type {
  CollaborationExtension,
} from "../../../agent-runtime/src/index.js";
import {
  createTavernCollaborationExtension,
} from "./tavern/index.js";

export const createDesktopAgentRuntimeExtensions = (): CollaborationExtension[] => [
  createTavernCollaborationExtension(),
];
