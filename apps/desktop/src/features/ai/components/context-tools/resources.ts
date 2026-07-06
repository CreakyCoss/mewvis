export type ContextFileDescriptor = {
  path: string;
  content?: string | null;
  updatedAt?: number | null;
};

export type PromptFileReference = {
  path: string;
  content: string;
};

export type PromptContextFile = {
  path: string;
  content: string;
  updatedAt: number | null;
};

export type ContextFileLoader = (
  file: ContextFileDescriptor,
) =>
  | string
  | PromptFileReference
  | PromptContextFile
  | null
  | undefined
  | Promise<string | PromptFileReference | PromptContextFile | null | undefined>;

export type LoadContextResourcesInput = {
  activeFile?: ContextFileDescriptor | PromptContextFile | null;
  references?: Array<ContextFileDescriptor | PromptFileReference>;
  loadFile?: ContextFileLoader;
};

export type LoadedContextResources = {
  activeFile: PromptContextFile | null;
  references: PromptFileReference[];
};

type ResolvedPromptFile = {
  path: string;
  content: string;
  updatedAt: number | null;
};

const hasStringContent = (
  file: ContextFileDescriptor | PromptContextFile | PromptFileReference,
): file is ContextFileDescriptor & { content: string } => typeof file.content === "string";

const normalizeLoadedFile = (
  descriptor: ContextFileDescriptor | PromptFileReference,
  loaded: Awaited<ReturnType<ContextFileLoader>>,
): ResolvedPromptFile | null => {
  if (typeof loaded === "string") {
    return {
      path: descriptor.path,
      content: loaded,
      updatedAt: "updatedAt" in descriptor && typeof descriptor.updatedAt === "number" ? descriptor.updatedAt : null,
    };
  }
  if (!loaded || typeof loaded.content !== "string") {
    return null;
  }

  return {
    path: loaded.path || descriptor.path,
    content: loaded.content,
    updatedAt:
      "updatedAt" in loaded && typeof loaded.updatedAt === "number"
        ? loaded.updatedAt
        : "updatedAt" in descriptor && typeof descriptor.updatedAt === "number"
          ? descriptor.updatedAt
          : null,
  };
};

const resolveFile = async (
  descriptor: ContextFileDescriptor | PromptFileReference,
  loadFile?: ContextFileLoader,
): Promise<ResolvedPromptFile> => {
  if (hasStringContent(descriptor)) {
    return {
      path: descriptor.path,
      content: descriptor.content,
      updatedAt: "updatedAt" in descriptor && typeof descriptor.updatedAt === "number" ? descriptor.updatedAt : null,
    };
  }

  const loaded = loadFile ? normalizeLoadedFile(descriptor, await loadFile(descriptor)) : null;
  if (!loaded) {
    throw new Error(`无法加载上下文文件：${descriptor.path}`);
  }

  return loaded;
};

export const loadContextResources = async ({
  activeFile,
  references,
  loadFile,
}: LoadContextResourcesInput): Promise<LoadedContextResources> => {
  const [resolvedReferences, resolvedActiveFile] = await Promise.all([
    Promise.all(
      (references ?? []).map(async (file) => {
        const resolved = await resolveFile(file, loadFile);
        return {
          path: resolved.path,
          content: resolved.content,
        };
      }),
    ),
    activeFile
      ? resolveFile(activeFile, loadFile).then((resolved) => ({
          path: resolved.path,
          content: resolved.content,
          updatedAt: resolved.updatedAt,
        }))
      : Promise.resolve(null),
  ]);

  return {
    activeFile: resolvedActiveFile,
    references: resolvedReferences,
  };
};
