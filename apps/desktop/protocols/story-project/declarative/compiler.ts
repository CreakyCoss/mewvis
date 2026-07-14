import type { StoryProjectCompilerRegistry } from "../index.js";
import { STORY_PROJECT_IDENTIFIERS } from "../identifiers.js";
import { applyChangeSet, STORY_CHANGE_SET_MAX_BYTES, STORY_CHANGE_SET_MAX_OPERATIONS } from "./changes.js";
import {
  parseStoryProfile,
  resolveStoryProfilePath,
  storyProfileContextViewForScope,
  storyProfileDocument,
  storyProfileDocumentFields,
  storyProfileKindForPath,
  type StoryProfile,
} from "./profile.js";
import { parseStoryDocument, serializeStoryDocument } from "./documents.js";
import { parseStoryProjectLayout } from "./layout.js";
import { readStoryProjectContext } from "./context.js";
import type { StoryProjectApi } from "../index.js";
import type { StoryProfileDescription } from "../types.js";
import { assembleProject, initialDocumentInput, manifestFiles, projectInfo, rebuildManifest } from "./project.js";
import { validateProject } from "./validation.js";

type StoryProjectCompiler = Parameters<StoryProjectCompilerRegistry["register"]>[0];
type StoryProjectCompilerSource = Parameters<StoryProjectCompiler["compile"]>[0];

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const objectValue = (value: unknown, owner: string): JsonObject => {
  if (!isObject(value)) throw new Error(`${owner} 必须是 JSON 对象。`);
  return value;
};

const canonicalPath = (value: string) =>
  value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");

const compiledProfile = (profileInput: unknown, layoutInput: unknown): StoryProfile => {
  const source = parseStoryProfile(profileInput);
  const layout = parseStoryProjectLayout(layoutInput);
  if (layout.profile.id !== source.profileId || layout.profile.version !== source.profileVersion) {
    throw new Error(
      `Layout 选择的 Profile 与快照不一致：${layout.profile.id}@${layout.profile.version} / ${source.profileId}@${source.profileVersion}`,
    );
  }
  const actualKinds = Object.keys(layout.documents).sort();
  const knownKinds = Object.keys(source.documents).sort();
  const missingKinds = knownKinds.filter(
    (kind) => source.documents[kind]!.layoutPresence === "required" && !actualKinds.includes(kind),
  );
  const unknownKinds = actualKinds.filter((kind) => !source.documents[kind]);
  if (missingKinds.length > 0 || unknownKinds.length > 0) {
    throw new Error(
      `Layout 文档映射与 Profile 不一致；缺少必需文档：${missingKinds.join("、") || "无"}；未知文档：${unknownKinds.join("、") || "无"}。`,
    );
  }
  const enabledKinds = new Set(actualKinds);
  for (const [kind, document] of Object.entries(source.documents)) {
    if (!enabledKinds.has(kind)) continue;
    for (const companionKind of document.companionKinds ?? []) {
      if (!source.documents[companionKind]) throw new Error(`${kind} 引用了未知 companionKind：${companionKind}`);
      if (!enabledKinds.has(companionKind)) {
        throw new Error(`Layout 启用了 ${kind}，但未启用其配套文档 ${companionKind}。`);
      }
    }
  }

  const rootPath = canonicalPath(layout.rootPath);
  const paths = new Map<string, string>();
  for (const [kind, document] of Object.entries(layout.documents)) {
    const pathPattern = canonicalPath(document.pathPattern);
    if (
      !pathPattern.startsWith(`${rootPath}/`) ||
      pathPattern.split("/").some((segment) => !segment || segment === "." || segment === "..")
    ) {
      throw new Error(`Layout 的 ${kind} 路径必须位于 ${rootPath}/ 下：${document.pathPattern}`);
    }
    const owner = paths.get(pathPattern);
    if (owner) throw new Error(`Layout 文档路径重复：${owner} 与 ${kind} 都使用 ${pathPattern}。`);
    paths.set(pathPattern, kind);
  }

  const contextViews = Object.fromEntries(
    Object.entries(source.contextViews).map(([name, view]) => {
      if (view.targetKind && !enabledKinds.has(view.targetKind)) {
        throw new Error(`Layout 未启用 contextViews.${name}.targetKind：${view.targetKind}`);
      }
      const documentKinds = view.documentKinds.filter((kind) => enabledKinds.has(kind));
      if (documentKinds.length === 0) throw new Error(`Layout 使 contextViews.${name} 不再包含任何文档。`);
      return [name, { ...view, documentKinds }];
    }),
  );
  const documentRoles = Object.fromEntries(
    Object.entries(source.documentRoles).filter(([, kind]) => enabledKinds.has(kind)),
  );

  return {
    ...source,
    rootPath,
    documentRoles,
    contextViews,
    documents: Object.fromEntries(
      actualKinds.map((kind) => [
        kind,
        { ...source.documents[kind]!, pathPattern: layout.documents[kind]!.pathPattern },
      ]),
    ),
  };
};

const createApi = (profile: StoryProfile): StoryProjectApi => {
  let api: StoryProjectApi;
  api = {
    compiler: {
      format: STORY_PROJECT_IDENTIFIERS.declarativeCompiler.format,
      version: STORY_PROJECT_IDENTIFIERS.declarativeCompiler.version,
    },
    identity: { format: profile.$format, profileId: profile.profileId, profileVersion: profile.profileVersion },
    changeSet: {
      maxOperations: STORY_CHANGE_SET_MAX_OPERATIONS,
      maxBytes: STORY_CHANGE_SET_MAX_BYTES,
      operations: [
        "upsert",
        "delete",
        "patch",
        "upsert-items",
        "remove-items",
        "add-values",
        "remove-values",
        "append-text",
        "replace-text",
      ],
      atomicCommit: true,
      revisionRequired: true,
    },
    describe: () => profile as StoryProfileDescription,
    document: (kind) => storyProfileDocument(profile, kind),
    documentFields: (kind) => storyProfileDocumentFields(profile, kind),
    contextView: (scope) => storyProfileContextViewForScope(profile, scope),
    resolveDocument: (kind, parameters) => resolveStoryProfilePath(profile, kind, parameters),
    kindForPath: (path) => storyProfileKindForPath(profile, path),
    materializeDocument: (input, path, timestamp) =>
      parseStoryDocument(profile, input, path, timestamp, { coerce: true }),
    encodeDocument: (input, path) => serializeStoryDocument(profile, input, path),
    decodeDocument: (input, path) => parseStoryDocument(profile, input, path),
    projectManifestPath: () => resolveStoryProfilePath(profile, profile.manifestKind),
    createProject: ({ storyId, title, timestamp = Date.now() }) => {
      const normalizedStoryId = storyId.trim();
      if (!normalizedStoryId || !/^[A-Za-z0-9_-]+$/.test(normalizedStoryId))
        throw new Error("storyId 必须是安全稳定 ID。");
      const normalizedTitle = title.trim() || "未命名故事";
      const manifestPath = resolveStoryProfilePath(profile, profile.manifestKind);
      const documents = Object.entries(profile.documents)
        .filter(([kind, definition]) => kind !== profile.manifestKind && definition.cardinality === "one")
        .map(([kind]) => {
          const path = resolveStoryProfilePath(profile, kind);
          return {
            path,
            value: parseStoryDocument(
              profile,
              initialDocumentInput(profile, kind, normalizedStoryId, normalizedTitle, timestamp),
              path,
              timestamp,
            ),
          };
        });
      const manifest = parseStoryDocument(
        profile,
        initialDocumentInput(profile, profile.manifestKind, normalizedStoryId, normalizedTitle, timestamp),
        manifestPath,
        timestamp,
      );
      const project = rebuildManifest({ manifest, documents }, profile, 0, timestamp);
      const validation = validateProject(project, profile, "draft");
      if (!validation.valid)
        throw new Error(validation.issues.map((item) => `${item.path}：${item.message}`).join("\n"));
      return project;
    },
    parseManifest: (input) => {
      const value = objectValue(input, "故事 Manifest");
      const info = projectInfo({ manifest: value, documents: [] });
      return { value, ...info, files: manifestFiles(value) };
    },
    assembleProject: (entries) => assembleProject(entries, profile, api.projectManifestPath()),
    projectFiles: (project) => [...project.documents],
    projectManifest: (project) => project.manifest,
    projectInfo,
    validateProject: (project, validationProfile) => validateProject(project, profile, validationProfile),
    applyChanges: (project, changeSet) => applyChangeSet(project, changeSet, api, profile),
    readContext: (project, input) => readStoryProjectContext(project, profile, api, input),
  };
  return Object.freeze(api);
};

export const DECLARATIVE_STORY_PROJECT_COMPILER: StoryProjectCompiler = Object.freeze({
  format: STORY_PROJECT_IDENTIFIERS.declarativeCompiler.format,
  compilerVersion: STORY_PROJECT_IDENTIFIERS.declarativeCompiler.version,
  compile(source: StoryProjectCompilerSource) {
    return createApi(compiledProfile(source.profile, source.layout));
  },
});
