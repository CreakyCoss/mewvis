import { join } from "node:path";

// Stateless file helpers shared by application and host services.
/** SQLite sidecars are part of the managed database, even before they exist. */
export function sqliteFilePaths(databasePath: string): string[] {
  return ["", "-wal", "-shm", "-journal"].map(
    (suffix) => databasePath + suffix,
  );
}
function workspaceProtectedPaths(workspacePaths: readonly string[]) {
  return workspacePaths.flatMap((directory) =>
    sqliteFilePaths(join(directory, "workspace.db")),
  );
}
export function applicationProtectedPaths(
  dataPath: string,
  workspacePaths: readonly string[] = [],
): string[] {
  return [
    join(dataPath, "package"),
    join(dataPath, "settings.yaml"),
    ...sqliteFilePaths(join(dataPath, "storage.sqlite")),
    ...workspaceProtectedPaths(workspacePaths),
  ];
}
export function hostProtectedPaths(
  dataPath: string,
  applicationDataPaths: readonly string[],
  workspacePaths: readonly string[],
): string[] {
  return [
    ...new Set([
      ...sqliteFilePaths(join(dataPath, "config.db")),
      ...applicationDataPaths.flatMap((directory) =>
        applicationProtectedPaths(directory, [join(directory, "workspace")]),
      ),
      ...workspaceProtectedPaths(workspacePaths),
    ]),
  ];
}
