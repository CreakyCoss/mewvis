import { invoke } from "@/transport";
import type { ConfigDatabaseStatus, RebuildWorkspaceDatabaseOutput } from "@/workbench/shell/recovery/types";

export function getConfigDatabaseStatus() {
  return invoke<ConfigDatabaseStatus>("get_config_database_status");
}

export function initializeConfigDatabase() {
  return invoke<ConfigDatabaseStatus>("initialize_config_database");
}

export function rebuildConfigDatabase() {
  return invoke<ConfigDatabaseStatus>("rebuild_config_database");
}

export function rebuildWorkspaceDatabase(workspacePath: string) {
  return invoke<RebuildWorkspaceDatabaseOutput>("rebuild_workspace_database", {
    input: {
      workspacePath,
    },
  });
}
