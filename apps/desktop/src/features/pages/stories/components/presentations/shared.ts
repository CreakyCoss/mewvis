import type { NavigateFunction } from "react-router";
import type { StoryAsset, StoryState } from "@/features/story";
import type { Workspace } from "@/features/pages/workspace/types";

export type StoryPresentationChannel = "tavern" | "chat";

export type StoryPresentationOpenInput = {
  workspace: Workspace;
  activeStory: StoryAsset;
  storyState: StoryState;
  persistStoryState: (nextState: StoryState) => Promise<void>;
  navigate: NavigateFunction;
  nodeId?: string | null;
  setOpeningStoryId: (storyId: string) => void;
};

export type StoryPresentationAdapter<Channel extends StoryPresentationChannel> = {
  channel: Channel;
  open: (input: StoryPresentationOpenInput) => void | Promise<void>;
};

export const resolveStoryNodeId = (
  story: StoryAsset,
  nodeId?: string | null,
) => nodeId ||
  story.graph.activeNodeId ||
  story.graph.entryNodeId ||
  story.graph.nodes[0]?.id ||
  "";
