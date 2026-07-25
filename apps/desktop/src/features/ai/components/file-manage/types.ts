import type { WorkspaceVersionFileStatus } from "@/api/workspace-files";

export type FileManageTool = "files" | "version" | "history";

export type VersionFileStatusByPath = Map<string, WorkspaceVersionFileStatus>;
