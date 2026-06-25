import type { NavigateFunction } from "react-router";
import type {
  StoryAsset,
  StoryPresentationSeed,
  StoryState,
} from "@/features/story";
import type { Workspace } from "@/features/pages/workspace/types";

export type StoryPresentationChannel = "tavern" | "chat";

export type StoryPresentationIcon = "tavern" | "chat";

export type StoryPresentationDefinition = {
  channel: StoryPresentationChannel;
  label: string;
  loadingLabel?: string;
  icon: StoryPresentationIcon;
};

export type StoryPresentationOpenInput = {
  workspace: Workspace;
  activeStory: StoryAsset;
  seed: StoryPresentationSeed;
  storyState: StoryState;
  persistStoryState: (nextState: StoryState) => Promise<void>;
  navigate: NavigateFunction;
  nodeId?: string | null;
  setOpeningStoryId: (storyId: string) => void;
};

export type StoryPresentationAdapter<Channel extends StoryPresentationChannel> = {
  definition: StoryPresentationDefinition & {
    channel: Channel;
  };
  open: (input: StoryPresentationOpenInput) => void | Promise<void>;
};

export const resolveStoryNodeId = (
  seed: StoryPresentationSeed,
  nodeId?: string | null,
) => nodeId ||
  seed.targetNodeId ||
  seed.graph.activeNodeId ||
  seed.graph.entryNodeId ||
  seed.graph.nodes[0]?.id ||
  "";
