import { invoke } from "@tauri-apps/api/core";

export const readJsonWorkspaceFile = async <T = unknown>(
  workspacePath: string,
  relativePath: string,
): Promise<T | null> => {
  try {
    const file = await invoke<{ content: string }>("read_workspace_file", {
      input: { workspacePath, relativePath },
    });
    return JSON.parse(file.content) as T;
  } catch {
    return null;
  }
};

export const writeJsonWorkspaceFile = async (workspacePath: string, relativePath: string, value: unknown) => {
  await invoke("write_workspace_file", {
    input: {
      workspacePath,
      relativePath,
      content: JSON.stringify(value, null, 2),
    },
  });
};

export const writeJsonWorkspaceFilesAtomic = async (
  workspacePath: string,
  files: Array<{ relativePath: string; value: unknown }>,
  deletePaths: string[] = [],
) => {
  await invoke("write_workspace_files_atomic", {
    input: {
      workspacePath,
      files: files.map(({ relativePath, value }) => ({
        relativePath,
        content: `${JSON.stringify(value, null, 2)}\n`,
      })),
      deletePaths,
    },
  });
};
