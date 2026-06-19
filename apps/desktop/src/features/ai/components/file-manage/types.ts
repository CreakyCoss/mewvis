import type { WorkspaceVersionFileStatus } from "@/features/pages/workspace/files-api";

export type FileManageTool = "files" | "version" | "history";

export type VersionFileStatusByPath = Map<string, WorkspaceVersionFileStatus>;
