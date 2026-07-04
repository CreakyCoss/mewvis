import type { StoryJson } from "@/features/story/model/story-types";

export type StoryConfigTab = "overview" | "characters" | "scenes" | "world" | "graph" | "manuscripts";

export type StoryModuleSave = (story: StoryJson) => void;
