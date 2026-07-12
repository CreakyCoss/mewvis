import {
  assertStoryContractCapabilities,
  decodeStructuredStoryDocument,
  encodeStructuredStoryDocument,
  materializeStoryDocument,
  parseStoryProjectContract,
  resolveStoryContractPath,
  storyContractContextViewForScope,
  storyContractDocument,
  storyContractDocumentFields,
  storyContractKindForPath,
} from "../../declarative-contract.js";
import type { CompiledStoryContract, StoryCompiledProject, StoryContractCompiler } from "../../compiler.js";
import {
  STORY_CHANGE_SET_MAX_BYTES,
  STORY_CHANGE_SET_MAX_OPERATIONS,
  applyStoryChangeSet,
  assembleStoryProject,
  storyChangeSetSchema,
} from "./change-set.js";
import { buildChapterContext, buildProjectSummary } from "./context.js";
import { createEmptyStoryProject, storyProjectFiles, type StoryProjectFileEntry } from "./project.js";
import { storyManifestFileSchema, type StoryProject } from "./schema.js";
import { validateStoryProject, type StoryValidationProfile } from "./validation.js";

export const STRUCTURED_NOVEL_STORY_CONTRACT_FORMAT = "novel-claw.structured-document-contract" as const;
export const STRUCTURED_NOVEL_STORY_CONTRACT_COMPILER_VERSION = 1 as const;

const canonicalChangedPath = (path: string) =>
  path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");

const storyValidationProfile = (value: string): StoryValidationProfile => {
  if (value === "draft" || value === "openBook" || value === "chapterWrite") return value;
  throw new Error(`工作区协议不支持校验 profile：${value}`);
};

export const STRUCTURED_NOVEL_STORY_CONTRACT_COMPILER: StoryContractCompiler = Object.freeze({
  format: STRUCTURED_NOVEL_STORY_CONTRACT_FORMAT,
  compilerVersion: STRUCTURED_NOVEL_STORY_CONTRACT_COMPILER_VERSION,
  compile(source: unknown): CompiledStoryContract {
    const definition = parseStoryProjectContract(source);
    const identity = Object.freeze({
      format: definition.$format,
      contractId: definition.contractId,
      contractVersion: definition.contractVersion,
    });
    const capabilities = new Set(definition.capabilities);
    let compiled: CompiledStoryContract;
    compiled = {
      compiler: Object.freeze({
        format: STRUCTURED_NOVEL_STORY_CONTRACT_FORMAT,
        version: STRUCTURED_NOVEL_STORY_CONTRACT_COMPILER_VERSION,
      }),
      identity,
      capabilities,
      changeSet: Object.freeze({
        maxOperations: STORY_CHANGE_SET_MAX_OPERATIONS,
        maxBytes: STORY_CHANGE_SET_MAX_BYTES,
        operations: Object.freeze([
          "upsert",
          "delete",
          "patch",
          "upsert-items",
          "remove-items",
          "add-values",
          "remove-values",
          "append-text",
          "replace-text",
        ]),
        atomicCommit: true,
        revisionRequired: true,
      }),
      describe: () => definition,
      assertCapabilities: (required) => assertStoryContractCapabilities(definition, required),
      document: (kind) => storyContractDocument(definition, kind),
      documentFields: (kind) => storyContractDocumentFields(definition, kind),
      contextView: (scope) => storyContractContextViewForScope(definition, scope),
      resolveDocument: (kind, parameters) => resolveStoryContractPath(definition, kind, parameters),
      kindForPath: (path) => storyContractKindForPath(definition, path),
      materializeDocument: (input, expectedKind, timestamp) =>
        materializeStoryDocument(definition, input, expectedKind, timestamp),
      encodeDocument: (input, path) => encodeStructuredStoryDocument(definition, input, path),
      decodeDocument: (input, path) => decodeStructuredStoryDocument(definition, input, path),
      projectManifestPath: () => resolveStoryContractPath(definition, "story-manifest"),
      createProject: ({ storyId, title, timestamp }) =>
        createEmptyStoryProject({ id: storyId, title, timestamp, contract: compiled }),
      parseManifest: (input) => {
        const value = storyManifestFileSchema.parse(input);
        return {
          value,
          storyId: value.storyId,
          revision: value.revision,
          files: value.files,
        };
      },
      assembleProject: (entries) => assembleStoryProject(entries as StoryProjectFileEntry[]) as StoryCompiledProject,
      projectFiles: (project) => storyProjectFiles(project as StoryProject, compiled),
      projectManifest: (project) => (project as StoryProject).manifest,
      projectInfo: (project) => ({
        storyId: (project as StoryProject).manifest.storyId,
        revision: (project as StoryProject).manifest.revision,
      }),
      validateProject: (project, profile) => validateStoryProject(project, compiled, storyValidationProfile(profile)),
      applyChanges: (project, input) => {
        const changeSet = storyChangeSetSchema.parse(input);
        const next = applyStoryChangeSet(project as StoryProject, changeSet, compiled);
        return {
          project: next,
          nextRevision: next.manifest.revision,
          validation: validateStoryProject(next, compiled, changeSet.validationProfile),
          batch: changeSet.batch ?? null,
          operationTypes: [...new Set(changeSet.operations.map((operation) => operation.type))],
          changedPaths: [...new Set(changeSet.operations.map((operation) => canonicalChangedPath(operation.path)))],
        };
      },
      readContext: (project, input) => {
        const view = compiled.contextView(input.scope);
        return input.scope === "chapter"
          ? buildChapterContext(project as StoryProject, compiled, view, input.targetId?.trim() || "")
          : buildProjectSummary(project as StoryProject, compiled, view);
      },
    };
    return Object.freeze(compiled);
  },
});
