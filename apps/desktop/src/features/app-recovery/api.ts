import { invoke } from "@tauri-apps/api/core";
import type {
  ConfigDatabaseStatus,
  RebuildWorkspaceDatabaseOutput,
} from "./types";

export function getConfigDatabaseStatus() {
  return invoke<ConfigDatabaseStatus>("get_config_database_status");
}

export function rebuildConfigDatabase() {
  return invoke<ConfigDatabaseStatus>("rebuild_config_database");
}

export function rebuildWorkspaceDatabase(workspacePath: string) {
  return invoke<RebuildWorkspaceDatabaseOutput>(
    "rebuild_workspace_database",
    {
      input: {
        workspacePath,
      },
    },
  );
}
