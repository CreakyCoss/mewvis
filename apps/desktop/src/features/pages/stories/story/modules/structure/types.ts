import type { StoryProject } from "../../../story-contract";

export type StoryProjectSave = (project: StoryProject) => Promise<StoryProject | null> | StoryProject | null;
