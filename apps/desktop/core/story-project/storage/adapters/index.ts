import type { StoryProjectStorageOptions } from "../types.js";
import { createFileStoryProjectBackendProvider } from "./file/index.js";
import { createMemoryStoryProjectBackendProvider } from "./memory/index.js";
import type { StoryProjectBackendProvider } from "./record.js";

const unsupportedStorageOptions = (_options: never): never => {
  throw new Error("不支持的 Story Storage 类型。");
};

/** Story Storage 的唯一模式分发入口。 */
export const createStoryProjectBackendProvider = (options: StoryProjectStorageOptions): StoryProjectBackendProvider => {
  switch (options.kind) {
    case "file":
      return createFileStoryProjectBackendProvider(options);
    case "memory":
      return createMemoryStoryProjectBackendProvider();
    default:
      return unsupportedStorageOptions(options);
  }
};
