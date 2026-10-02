import { call, locationForPath } from "./bridge";
const file = async <T>(
  workspacePath: string,
  path: string,
  action: string,
  content?: string,
): Promise<T> => {
  const location = await locationForPath(workspacePath);
  return call<T>("mewvis_story_file", {
    workspaceId: location.workspace.id,
    path: [location.relativePath, path].filter(Boolean).join("/"),
    action,
    ...(content === undefined ? {} : { content }),
  });
};
export const readWorkspaceFileOptional = (workspace: string, path: string) =>
  file<{ content: string; path: string } | null>(workspace, path, "read");
export const writeWorkspaceFile = (
  workspace: string,
  path: string,
  content: string,
) => file<void>(workspace, path, "write", content);
export const deleteWorkspaceFile = (workspace: string, path: string) =>
  file<void>(workspace, path, "delete");
export const workspaceFile = (workspace: string, path: string) => ({
  async readJson<T = unknown>(): Promise<T | null> {
    const value = await readWorkspaceFileOptional(workspace, path);
    return value ? JSON.parse(value.content) : null;
  },
  writeJson: (value: unknown) =>
    writeWorkspaceFile(workspace, path, JSON.stringify(value, null, 2) + "\n"),
});
