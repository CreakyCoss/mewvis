import type { WorkspaceVersionFileStatus } from "@/features/workspace/chat/types";

export type FileManageTool = "files" | "version" | "history";

export type VersionFileStatusByPath = Map<string, WorkspaceVersionFileStatus>;
