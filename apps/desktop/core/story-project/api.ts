import type * as Model from "./types.js";

/** 技能、工具和故事前端共同依赖的稳定故事项目能力。 */
export interface StoryProjectApi {
  readonly compiler: Readonly<{ format: string; version: number }>;
  readonly identity: Model.StoryProfileIdentity;
  readonly changeSet: Model.StoryChangeSetDescription;

  describe(): Model.StoryProfileDescription;
  document(kind: string): Model.CompiledStoryDocumentDescription;
  documentFields(kind: string): Readonly<Record<string, Model.CompiledStoryFieldDescription>>;
  contextView(scope: Model.CompiledStoryContextViewDescription["scope"]): Model.CompiledStoryContextViewDescription;
  resolveDocument(kind: string, parameters?: Readonly<Record<string, string>>): string;
  kindForPath(path: string): string;
  materializeDocument(input: unknown, path: string, timestamp?: number): Record<string, unknown>;
  encodeDocument(input: unknown, path: string): Model.SerializedStoryDocument;
  decodeDocument(input: unknown, path: string): Record<string, unknown>;

  projectManifestPath(): string;
  createProject(input: { storyId: string; title: string; timestamp?: number }): Model.StoryCompiledProject;
  parseManifest(input: unknown): Model.CompiledStoryManifest;
  assembleProject(entries: readonly Model.CompiledStoryProjectFileEntry[]): Model.StoryCompiledProject;
  projectFiles(project: Model.StoryCompiledProject): Model.CompiledStoryProjectFileEntry[];
  projectManifest(project: Model.StoryCompiledProject): unknown;
  projectInfo(project: Model.StoryCompiledProject): { storyId: string; revision: number };
  validateProject(project: Model.StoryCompiledProject, profile: string): Model.StoryValidationResult;
  applyChanges(project: Model.StoryCompiledProject, changeSet: unknown): Model.AppliedStoryChanges;
  readContext(
    project: Model.StoryCompiledProject,
    input: { scope: "project" | "chapter"; targetId?: string },
  ): Model.StoryContextBundle;
}

type StoryProjectCompilerSource = Readonly<{ profile: unknown; layout: unknown }>;

interface StoryProjectCompiler {
  readonly format: string;
  readonly compilerVersion: number;
  compile(source: StoryProjectCompilerSource): StoryProjectApi;
}

/** 调用方用于按格式取得 StoryProjectApi，不暴露具体 Compiler 或注册表实现。 */
export interface StoryProjectCompilerRegistry {
  register(compiler: StoryProjectCompiler): this;
  resolve(format: string): StoryProjectCompiler;
  compile(format: string, source: StoryProjectCompilerSource): StoryProjectApi;
}
