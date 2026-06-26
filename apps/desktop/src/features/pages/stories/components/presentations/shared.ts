import type { NavigateFunction } from "react-router";
import type {
  StoryAsset,
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
  story: StoryAsset,
  nodeId?: string | null,
) => nodeId ||
  story.graph.activeNodeId ||
  story.graph.entryNodeId ||
  story.graph.nodes[0]?.id ||
  "";
