import type { StoryToolRepository } from "./repository.js";
import { normalizeStoryChangeSet } from "./request.js";
import type { StoryToolApi } from "../protocol.js";

const identityFieldsByKind = async (repository: StoryToolRepository) => {
  const structure = await repository.project.describe();
  return Object.fromEntries(
    Object.entries(structure.documents).map(([kind, document]) => [
      kind,
      document.identityFields,
    ]),
  );
};

/** Story Tool 仅适配稳定工具协议；结构解析、校验、上下文与事务全部由 Story Project 处理。 */
export const createStoryToolService = (
  repository: StoryToolRepository,
): StoryToolApi => ({
  async describeStructure(input) {
    return {
      available: true,
      structure: await repository.project.describe(input),
    };
  },
  initialize: (input) => repository.project.initialize(input),
  readContext: (input) => repository.project.readContext(input),
  validateChanges: async (input) =>
    repository.project.validateChanges(
      normalizeStoryChangeSet(
        input.changeSet,
        await identityFieldsByKind(repository),
      ),
    ),
  commitChanges: async (input) =>
    repository.project.commitChanges(
      normalizeStoryChangeSet(
        input.changeSet,
        await identityFieldsByKind(repository),
      ),
    ),
});
