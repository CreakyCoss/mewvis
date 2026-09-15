import { Channel } from "@tauri-apps/api/core";
import { invoke, listen, backendKind } from "@/transport";

export type WorkspaceFileEntry = {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number | null;
  updatedAt: number | null;
};

export type WorkspaceFile = {
  path: string;
  content: string;
  updatedAt: number | null;
};

export type WorkspaceFileRevisionCondition = {
  relativePath: string;
  expectedRevision: number | null;
};

export type WorkspaceVersionFileStatusKind =
  "added" | "modified" | "deleted" | "renamed" | "typechange" | "conflicted" | "untracked";

export type WorkspaceVersionFileStatus = {
  path: string;
  previousPath: string | null;
  status: WorkspaceVersionFileStatusKind;
  isStaged: boolean;
  isWorktree: boolean;
};

export type WorkspaceVersionBranch = {
  name: string;
  shortHead: string | null;
  isCurrent: boolean;
};

export type WorkspaceVersionControlStatusCounts = {
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
  typechange: number;
  conflicted: number;
  untracked: number;
};

export type WorkspaceVersionControlStatus = {
  isEnabled: boolean;
  provider: string | null;
  currentRef: string | null;
  head: string | null;
  branches: WorkspaceVersionBranch[];
  hasVersions: boolean;
  hasChanges: boolean;
  changedFileCount: number;
  counts: WorkspaceVersionControlStatusCounts;
  files: WorkspaceVersionFileStatus[];
};

export type WorkspaceVersionFileDiff = {
  path: string;
  patch: string;
  beforeContent: string;
  afterContent: string;
};

export type WorkspaceVersion = {
  id: string;
  shortId: string;
  summary: string;
  authorName: string;
  timestamp: number;
};

export type WorkspaceVersionFileEntry = {
  path: string;
  previousPath: string | null;
  status: WorkspaceVersionFileStatusKind;
  name: string;
  size: number;
};

export type WorkspaceVersionFileContent = {
  path: string;
  content: string;
  size: number;
};

export type CreateWorkspaceVersionResult = {
  version: WorkspaceVersion;
  status: WorkspaceVersionControlStatus;
};

export type WorkspaceFileWrite = {
  relativePath: string;
  content: string;
};

export type WorkspaceFileWriteResult = {
  writtenPaths: string[];
  deletedPaths: string[];
};

export async function watchWorkspaceFiles(workspacePath: string, onChange: () => void): Promise<() => void> {
  if (backendKind() === "node") {
    let watchId: string | undefined;
    const unlisten = await listen<{ watchId: string }>("workspace_files_changed", ({ payload }) => {
      if (payload.watchId === watchId) onChange();
    });
    try {
      watchId = await invoke<string>("watch_workspace_files", { input: { workspacePath } });
      // Refresh after registration to cover changes before the watch id reached the browser.
      onChange();
    } catch (error) {
      unlisten();
      throw error;
    }
    return () => {
      unlisten();
      void invoke("unwatch_workspace_files", { input: { watchId } }).catch(() => {});
    };
  }
  const channel = new Channel<null>();
  channel.onmessage = onChange;
  const watchId = await invoke<string>("watch_workspace_files", {
    input: { workspacePath },
    onChange: channel,
  });

  return () => {
    void invoke("unwatch_workspace_files", {
      input: { watchId },
    }).catch(() => undefined);
  };
}

export async function listWorkspaceFiles(workspacePath: string) {
  return invoke<WorkspaceFileEntry[]>("list_workspace_files", {
    input: { workspacePath },
  });
}

export async function readWorkspaceFile(workspacePath: string, relativePath: string) {
  return invoke<WorkspaceFile>("read_workspace_file", {
    input: { workspacePath, relativePath },
  });
}

export async function readWorkspaceFileOptional(workspacePath: string, relativePath: string) {
  return invoke<WorkspaceFile | null>("read_workspace_file_optional", {
    input: { workspacePath, relativePath },
  });
}

export async function writeWorkspaceFile(workspacePath: string, relativePath: string, content: string) {
  return invoke<WorkspaceFile>("write_workspace_file", {
    input: { workspacePath, relativePath, content },
  });
}

export async function writeWorkspaceFilesAtomic(
  workspacePath: string,
  files: WorkspaceFileWrite[],
  deletePaths: string[] = [],
  revisionCondition?: WorkspaceFileRevisionCondition,
) {
  return invoke<WorkspaceFileWriteResult>("write_workspace_files_atomic", {
    input: { workspacePath, files, deletePaths, revisionCondition },
  });
}

export async function deleteWorkspaceFile(workspacePath: string, relativePath: string) {
  return invoke<void>("delete_workspace_file", {
    input: { workspacePath, relativePath },
  });
}

export async function getWorkspaceVersionControlStatus(workspacePath: string) {
  return invoke<WorkspaceVersionControlStatus>("get_workspace_version_control_status", {
    input: { workspacePath },
  });
}

export async function initializeWorkspaceVersionControl(workspacePath: string) {
  return invoke<WorkspaceVersionControlStatus>("initialize_workspace_version_control", {
    input: { workspacePath },
  });
}

export async function getWorkspaceVersionFileDiff(workspacePath: string, relativePath: string) {
  return invoke<WorkspaceVersionFileDiff>("get_workspace_version_file_diff", {
    input: { workspacePath, relativePath },
  });
}

export async function discardWorkspaceVersionFileChanges(workspacePath: string, relativePath: string) {
  return invoke<WorkspaceVersionControlStatus>("discard_workspace_version_file_changes", {
    input: { workspacePath, relativePath },
  });
}

export async function createWorkspaceVersion(workspacePath: string, message: string, relativePaths?: string[]) {
  return invoke<CreateWorkspaceVersionResult>("create_workspace_version", {
    input: { workspacePath, message, relativePaths },
  });
}

export async function createWorkspaceVersionBranch(workspacePath: string, branchName: string) {
  return invoke<WorkspaceVersionControlStatus>("create_workspace_version_branch", {
    input: { workspacePath, branchName },
  });
}

export async function switchWorkspaceVersionBranch(workspacePath: string, branchName: string) {
  return invoke<WorkspaceVersionControlStatus>("switch_workspace_version_branch", {
    input: { workspacePath, branchName },
  });
}

export async function listWorkspaceVersions(workspacePath: string, branchName?: string) {
  return invoke<WorkspaceVersion[]>("list_workspace_versions", {
    input: { workspacePath, branchName },
  });
}

export async function listWorkspaceVersionFiles(workspacePath: string, versionId: string) {
  return invoke<WorkspaceVersionFileEntry[]>("list_workspace_version_files", {
    input: { workspacePath, versionId },
  });
}

export async function readWorkspaceVersionFile(workspacePath: string, versionId: string, relativePath: string) {
  return invoke<WorkspaceVersionFileContent>("read_workspace_version_file", {
    input: { workspacePath, versionId, relativePath },
  });
}

export async function getWorkspaceVersionCommitFileDiff(
  workspacePath: string,
  versionId: string,
  relativePath: string,
) {
  return invoke<WorkspaceVersionFileDiff>("get_workspace_version_commit_file_diff", {
    input: { workspacePath, versionId, relativePath },
  });
}

export async function restoreWorkspaceVersion(workspacePath: string, versionId: string) {
  return invoke<WorkspaceVersionControlStatus>("restore_workspace_version", {
    input: { workspacePath, versionId },
  });
}
