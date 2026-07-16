import { assertStoryProjectRevision, type StoryProjectRecord, type StoryProjectRecordBackend } from "../record.js";
import { parseStoryDocumentIdentityKey, storyDocumentIdentityKey } from "../../../definitions/model/identity.js";

export const createMemoryStoryProjectRecordBackend = (): StoryProjectRecordBackend => {
  const projects = new Map<string, Map<string, StoryProjectRecord>>();
  const documentPrefix = "document:";

  return {
    definitionKey: "definition:story-project",
    documentKey: (identity) => `${documentPrefix}${storyDocumentIdentityKey(identity)}`,
    documentIdentity: (key) =>
      key.startsWith(documentPrefix) ? parseStoryDocumentIdentityKey(key.slice(documentPrefix.length)) : null,
    replaceableKeys: () => [],
    async list(projectKey) {
      return [...(projects.get(projectKey)?.values() ?? [])]
        .map(({ key, contentFormat, updatedAt }) => ({ key, contentFormat, updatedAt }))
        .sort((left, right) => left.key.localeCompare(right.key));
    },

    async read(projectKey, key) {
      const record = projects.get(projectKey)?.get(key);
      if (!record) throw new Error(`故事记录不存在：${key}`);
      return structuredClone(record);
    },

    async readOptional(projectKey, key) {
      const record = projects.get(projectKey)?.get(key);
      return record ? structuredClone(record) : null;
    },

    async commit(projectKey, transaction) {
      const records = projects.get(projectKey) ?? new Map<string, StoryProjectRecord>();
      assertStoryProjectRevision(transaction.revision, records.get(transaction.revision.key) ?? null);
      for (const key of transaction.deletes) records.delete(key);
      const updatedAt = Date.now();
      for (const write of transaction.writes) {
        records.set(write.key, { ...structuredClone(write), updatedAt });
      }
      projects.set(projectKey, records);
    },
  };
};
