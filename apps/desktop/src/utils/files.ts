import { invoke, isTauri } from "@tauri-apps/api/core";

type FileEntry = {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number | null;
  updatedAt: number | null;
};

type StoredFile = {
  path: string;
  content: string;
  updatedAt: number | null;
};

type RevisionCondition = {
  relativePath: string;
  expectedRevision: number | null;
};

type FileWrite = {
  relativePath: string;
  content: string;
};

type FileWriteResult = {
  writtenPaths: string[];
  deletedPaths: string[];
};

export type WorkspaceFileFormat<T> = Readonly<{
  parse: (content: string) => T;
  serialize: (value: T) => string;
}>;

const defineFileFormat = <T>(format: WorkspaceFileFormat<T>) => format;

const textFileFormat = defineFileFormat<string>({
  parse: (content) => content,
  serialize: (content) => content,
});

const serializeJson = (value: unknown) => {
  const content = JSON.stringify(value, null, 2);
  if (content === undefined) {
    throw new TypeError("文件内容无法序列化为 JSON");
  }
  return `${content}\n`;
};

const jsonFileFormat = <T = unknown>() =>
  defineFileFormat<T>({
    parse: (content) => JSON.parse(content) as T,
    serialize: serializeJson,
  });

const jsonLinesFileFormat = <T = unknown>() =>
  defineFileFormat<readonly T[]>({
    parse: (content) =>
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as T),
    serialize: (values) => {
      if (values.length === 0) {
        return "";
      }

      return `${values
        .map((value) => {
          const line = JSON.stringify(value);
          if (line === undefined) {
            throw new TypeError("文件内容无法序列化为 JSON Lines");
          }
          return line;
        })
        .join("\n")}\n`;
    },
  });

const createDesktopOnlyFileError = () => new Error("工作区文件保存仅支持桌面环境");

const readStoredWorkspaceFile = async (workspacePath: string, relativePath: string) => {
  if (!isTauri()) {
    return null;
  }

  return invoke<StoredFile | null>("read_workspace_file_optional", {
    input: { workspacePath, relativePath },
  });
};

const writeStoredWorkspaceFile = async (workspacePath: string, relativePath: string, content: string) => {
  if (!isTauri()) {
    throw createDesktopOnlyFileError();
  }

  return invoke<StoredFile>("write_workspace_file", {
    input: { workspacePath, relativePath, content },
  });
};

const removeStoredWorkspaceFile = async (workspacePath: string, relativePath: string) => {
  if (!isTauri()) {
    throw createDesktopOnlyFileError();
  }

  return invoke<void>("delete_workspace_file", {
    input: { workspacePath, relativePath },
  });
};

const listStoredWorkspaceFiles = async (workspacePath: string) => {
  if (!isTauri()) {
    return [];
  }

  return invoke<FileEntry[]>("list_workspace_files", {
    input: { workspacePath },
  });
};

const writeStoredWorkspaceFilesAtomic = async (
  workspacePath: string,
  files: FileWrite[],
  deletePaths: string[],
  revisionCondition?: RevisionCondition,
) => {
  if (!isTauri()) {
    throw createDesktopOnlyFileError();
  }

  return invoke<FileWriteResult>("write_workspace_files_atomic", {
    input: { workspacePath, files, deletePaths, revisionCondition },
  });
};

const serializeFile = <T>(relativePath: string, value: T, format: WorkspaceFileFormat<T>): FileWrite => ({
  relativePath,
  content: format.serialize(value),
});

export const workspaceFile = (workspacePath: string, relativePath: string) => {
  const read = async <T>(format: WorkspaceFileFormat<T>) => {
    const file = await readStoredWorkspaceFile(workspacePath, relativePath);
    return file ? format.parse(file.content) : null;
  };

  const write = <T>(value: T, format: WorkspaceFileFormat<T>) =>
    writeStoredWorkspaceFile(workspacePath, relativePath, format.serialize(value));

  return {
    read,
    readText: () => read(textFileFormat),
    readJson: async <T = unknown>() => {
      try {
        return await read(jsonFileFormat<T>());
      } catch {
        return null;
      }
    },
    readJsonLines: <T = unknown>() => read(jsonLinesFileFormat<T>()),
    write,
    writeText: (content: string) => write(content, textFileFormat),
    writeJson: (value: unknown) => write(value, jsonFileFormat()),
    writeJsonLines: <T = unknown>(values: readonly T[]) => write(values, jsonLinesFileFormat<T>()),
    remove: () => removeStoredWorkspaceFile(workspacePath, relativePath),
  };
};

export const workspaceFileSystem = (workspacePath: string) => {
  const writeAtomic = (files: FileWrite[], deletePaths: string[] = [], revisionCondition?: RevisionCondition) =>
    writeStoredWorkspaceFilesAtomic(workspacePath, files, deletePaths, revisionCondition);

  const writeWithFormatAtomic = <T>(
    files: Array<{ relativePath: string; value: T }>,
    format: WorkspaceFileFormat<T>,
    deletePaths: string[] = [],
    revisionCondition?: RevisionCondition,
  ) =>
    writeAtomic(
      files.map(({ relativePath, value }) => serializeFile(relativePath, value, format)),
      deletePaths,
      revisionCondition,
    );

  return {
    file: (relativePath: string) => workspaceFile(workspacePath, relativePath),
    list: () => listStoredWorkspaceFiles(workspacePath),
    writeAtomic,
    writeWithFormatAtomic,
    writeJsonAtomic: (
      files: Array<{ relativePath: string; value: unknown }>,
      deletePaths: string[] = [],
      revisionCondition?: RevisionCondition,
    ) => writeWithFormatAtomic(files, jsonFileFormat(), deletePaths, revisionCondition),
  };
};
