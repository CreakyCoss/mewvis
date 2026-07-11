import type { StoryJson } from "../model/types";

export type StoryConfigTab = "overview" | "structure" | "characters" | "scenes" | "world" | "graph";

export type StoryModuleSave = (story: StoryJson) => void;
