import type { NavigateFunction } from "react-router";
import type { StoryState } from "@/features/story/model/story-state";
import type { StoryJson } from "@/features/story/model/story-types";
import type { StoryWorkspace } from "@/features/story/persistence/story-storage";
import type { Workspace } from "@/features/pages/workspace/types";
import type { TavernRoom } from "@/features/pages/tavern/types";

export type StoryPresentationChannel = "tavern" | "chat";

export type StoryPresentationIcon = "tavern" | "chat";

export type StoryPresentationDefinition = {
  channel: StoryPresentationChannel;
  label: string;
  loadingLabel?: string;
  icon: StoryPresentationIcon;
};

export type StoryPresentationOpenInput = {
  workspace: Workspace | null;
  storyWorkspace: StoryWorkspace | null;
  activeStory: StoryJson;
  storyState: StoryState;
  persistStoryState: (nextState: StoryState) => Promise<void>;
  navigate: NavigateFunction;
  nodeId?: string | null;
  tavernRoom?: TavernRoom;
  setOpeningStoryId: (storyId: string) => void;
};

export type StoryPresentationAdapter<Channel extends StoryPresentationChannel> = {
  definition: StoryPresentationDefinition & {
    channel: Channel;
  };
  open: (input: StoryPresentationOpenInput) => void | Promise<void>;
};

export const resolveStoryNodeId = (story: StoryJson, nodeId?: string | null) =>
  nodeId || story.graph.activeNodeId || story.graph.entryNodeId || story.graph.nodes[0]?.id || "";
