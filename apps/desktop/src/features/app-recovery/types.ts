export type DatabaseRestoreReport = {
  restoredTables: string[];
  skippedTables: string[];
  restoredRows: number;
  warnings: string[];
};

export type ConfigDatabaseStatus = {
  configDbPath: string;
  setupError: string | null;
  canRebuild: boolean;
  lastRebuild: DatabaseRestoreReport | null;
};

export type RebuildWorkspaceDatabaseOutput = {
  workspaceDbPath: string;
  rebuild: DatabaseRestoreReport;
};
