import type { WorkspaceFileEntry } from "@/features/workspace/chat/types";

export const compactScene = (scene: string) => {
  const trimmed = scene.trim();
  return trimmed.length > 88 ? `${trimmed.slice(0, 88)}...` : trimmed;
};

export const uniqueFilesByPath = (files: WorkspaceFileEntry[]) => {
  const seen = new Set<string>();
  return files.filter((file) => {
    if (seen.has(file.path)) {
      return false;
    }
    seen.add(file.path);
    return true;
  });
};
