export {
  appendReferencesToPrompt,
  formatReferencesForPrompt,
  getActiveReferenceToken,
  quoteReferencePath,
  resolveFileReferenceMatches,
  summarizeReferenceMatches,
  type ActiveReferenceToken,
  type FileReferenceMatch,
  type PromptReference,
  type ReferenceFileEntry,
} from "./file-references";
export {
  loadContextResources,
  type ContextFileDescriptor,
  type ContextFileLoader,
  type LoadedContextResources,
  type LoadContextResourcesInput,
  type PromptContextFile,
  type PromptFileReference,
} from "./resources";
