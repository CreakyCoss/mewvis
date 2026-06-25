import { useState } from "react";
import { useNavigate } from "react-router";
import {
  openRegisteredStoryPresentation,
  type StoryPresentationChannel,
} from "./presentations/registry";
import {
  type StoryAsset,
  getStoryPresentationSeed,
  type StoryState,
} from "@/features/story";
import type { Workspace } from "@/features/pages/workspace/types";

type StoryPresentationActionsInput = {
  workspace: Workspace | null;
  activeStory: StoryAsset | null;
  storyState: StoryState;
  persistStoryState: (nextState: StoryState) => Promise<void>;
};

export const useStoryPresentationActions = ({
  workspace,
  activeStory,
  storyState,
  persistStoryState,
}: StoryPresentationActionsInput) => {
  const navigate = useNavigate();
  const [openingStoryId, setOpeningStoryId] = useState("");

  const openStoryPresentation = (
    channel: StoryPresentationChannel,
    nodeId?: string | null,
  ) => {
    if (!workspace || !activeStory) {
      return;
    }

    return openRegisteredStoryPresentation(channel, {
      workspace,
      activeStory,
      seed: getStoryPresentationSeed(activeStory, { nodeId }),
      storyState,
      persistStoryState,
      navigate,
      nodeId,
      setOpeningStoryId,
    });
  };

  return {
    openingStoryId,
    openStoryPresentation,
  };
};
