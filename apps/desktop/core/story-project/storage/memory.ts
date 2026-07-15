import { assertStoryProjectRevision, type StoryProjectRecord, type StoryProjectStore } from "./index.js";

/**
 * 创建一个初始为空的内存 Store。
 *
 * 用于测试、预览和新存储实现的参考；数据不会跨进程持久化。
 */
export const createMemoryStoryProjectStore = (): StoryProjectStore => {
  const projects = new Map<string, Map<string, StoryProjectRecord>>();

  return {
    async list(projectKey) {
      return [...(projects.get(projectKey)?.values() ?? [])]
        .map(({ key, contentType, updatedAt }) => ({ key, contentType, updatedAt }))
        .sort((left, right) => left.key.localeCompare(right.key));
    },

    async read(projectKey, key) {
      const record = projects.get(projectKey)?.get(key);
      if (!record) throw new Error(`故事记录不存在：${key}`);
      return structuredClone(record);
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
