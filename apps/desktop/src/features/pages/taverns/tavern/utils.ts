import { uniqBy } from "lodash-es";
import type { WorkspaceFileEntry } from "@/features/pages/workspace/files-api";

export const compactScene = (scene: string) => {
  const trimmed = scene.trim();
  return trimmed.length > 88 ? `${trimmed.slice(0, 88)}...` : trimmed;
};

export const uniqueFilesByPath = (files: WorkspaceFileEntry[]) => uniqBy(files, "path");
