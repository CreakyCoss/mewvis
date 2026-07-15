import { invoke, isTauri } from "@tauri-apps/api/core";

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

export async function listWorkspaceFiles(workspacePath: string) {
  if (!isTauri()) {
    return [];
  }

  return invoke<WorkspaceFileEntry[]>("list_workspace_files", {
    input: { workspacePath },
  });
}

export async function readWorkspaceFile(workspacePath: string, relativePath: string) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持读取工作区文件");
  }

  return invoke<WorkspaceFile>("read_workspace_file", {
    input: { workspacePath, relativePath },
  });
}

export async function writeWorkspaceFile(workspacePath: string, relativePath: string, content: string) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持保存工作区文件");
  }

  return invoke<WorkspaceFile>("write_workspace_file", {
    input: { workspacePath, relativePath, content },
  });
}

export async function writeWorkspaceFilesAtomic(
  workspacePath: string,
  files: Array<{ relativePath: string; content: string }>,
  deletePaths: string[] = [],
  revisionCondition?: WorkspaceFileRevisionCondition,
) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持批量保存工作区文件");
  }

  return invoke<{ writtenPaths: string[]; deletedPaths: string[] }>("write_workspace_files_atomic", {
    input: { workspacePath, files, deletePaths, revisionCondition },
  });
}

export async function deleteWorkspaceFile(workspacePath: string, relativePath: string) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持删除工作区文件");
  }

  return invoke<void>("delete_workspace_file", {
    input: { workspacePath, relativePath },
  });
}

export async function getWorkspaceVersionControlStatus(workspacePath: string) {
  if (!isTauri()) {
    return {
      isEnabled: false,
      provider: null,
      currentRef: null,
      head: null,
      branches: [],
      hasVersions: false,
      hasChanges: false,
      changedFileCount: 0,
      counts: {
        added: 0,
        modified: 0,
        deleted: 0,
        renamed: 0,
        typechange: 0,
        conflicted: 0,
        untracked: 0,
      },
      files: [],
    } satisfies WorkspaceVersionControlStatus;
  }

  return invoke<WorkspaceVersionControlStatus>("get_workspace_version_control_status", {
    input: { workspacePath },
  });
}

export async function initializeWorkspaceVersionControl(workspacePath: string) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持初始化工作区版本库");
  }

  return invoke<WorkspaceVersionControlStatus>("initialize_workspace_version_control", {
    input: { workspacePath },
  });
}

export async function getWorkspaceVersionFileDiff(workspacePath: string, relativePath: string) {
  if (!isTauri()) {
    return {
      path: relativePath,
      patch: "",
      beforeContent: "",
      afterContent: "",
    } satisfies WorkspaceVersionFileDiff;
  }

  return invoke<WorkspaceVersionFileDiff>("get_workspace_version_file_diff", {
    input: { workspacePath, relativePath },
  });
}

export async function discardWorkspaceVersionFileChanges(workspacePath: string, relativePath: string) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持撤销文件修改");
  }

  return invoke<WorkspaceVersionControlStatus>("discard_workspace_version_file_changes", {
    input: { workspacePath, relativePath },
  });
}

export async function createWorkspaceVersion(workspacePath: string, message: string, relativePaths?: string[]) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持提交工作区变更");
  }

  return invoke<CreateWorkspaceVersionResult>("create_workspace_version", {
    input: { workspacePath, message, relativePaths },
  });
}

export async function createWorkspaceVersionBranch(workspacePath: string, branchName: string) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持创建工作区分支");
  }

  return invoke<WorkspaceVersionControlStatus>("create_workspace_version_branch", {
    input: { workspacePath, branchName },
  });
}

export async function switchWorkspaceVersionBranch(workspacePath: string, branchName: string) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持切换工作区分支");
  }

  return invoke<WorkspaceVersionControlStatus>("switch_workspace_version_branch", {
    input: { workspacePath, branchName },
  });
}

export async function listWorkspaceVersions(workspacePath: string, branchName?: string) {
  if (!isTauri()) {
    return [] satisfies WorkspaceVersion[];
  }

  return invoke<WorkspaceVersion[]>("list_workspace_versions", {
    input: { workspacePath, branchName },
  });
}

export async function listWorkspaceVersionFiles(workspacePath: string, versionId: string) {
  if (!isTauri()) {
    return [] satisfies WorkspaceVersionFileEntry[];
  }

  return invoke<WorkspaceVersionFileEntry[]>("list_workspace_version_files", {
    input: { workspacePath, versionId },
  });
}

export async function readWorkspaceVersionFile(workspacePath: string, versionId: string, relativePath: string) {
  if (!isTauri()) {
    return {
      path: relativePath,
      content: "",
      size: 0,
    } satisfies WorkspaceVersionFileContent;
  }

  return invoke<WorkspaceVersionFileContent>("read_workspace_version_file", {
    input: { workspacePath, versionId, relativePath },
  });
}

export async function getWorkspaceVersionCommitFileDiff(
  workspacePath: string,
  versionId: string,
  relativePath: string,
) {
  if (!isTauri()) {
    return {
      path: relativePath,
      patch: "",
      beforeContent: "",
      afterContent: "",
    } satisfies WorkspaceVersionFileDiff;
  }

  return invoke<WorkspaceVersionFileDiff>("get_workspace_version_commit_file_diff", {
    input: { workspacePath, versionId, relativePath },
  });
}

export async function restoreWorkspaceVersion(workspacePath: string, versionId: string) {
  if (!isTauri()) {
    throw new Error("Web 预览模式暂不支持回退工作区版本");
  }

  return invoke<WorkspaceVersionControlStatus>("restore_workspace_version", {
    input: { workspacePath, versionId },
  });
}
