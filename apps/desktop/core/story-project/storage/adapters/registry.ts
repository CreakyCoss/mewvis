import { fileStoryProjectStorageAdapter } from "./file/index.js";
import { memoryStoryProjectStorageAdapter } from "./memory/index.js";
import type { StoryProjectRecordBackend } from "./record.js";
import type { StoryProjectStorageOptions } from "../types.js";

export type StoryProjectStorageAdapter<TOptions extends StoryProjectStorageOptions> = Readonly<{
  id: TOptions["kind"];
  create(options: TOptions): StoryProjectRecordBackend;
}>;

const storyProjectStorageAdapters = {
  file: fileStoryProjectStorageAdapter,
  memory: memoryStoryProjectStorageAdapter,
} as const;

export const createStoryProjectRecordBackend = (options: StoryProjectStorageOptions): StoryProjectRecordBackend => {
  switch (options.kind) {
    case "file":
      return storyProjectStorageAdapters.file.create(options);
    case "memory":
      return storyProjectStorageAdapters.memory.create(options);
  }
};
