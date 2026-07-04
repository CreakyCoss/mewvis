import { useState } from "react";
import { useNavigate } from "react-router";
import { openRegisteredStoryPresentation, type StoryPresentationChannel } from "./presentations/registry";
import type { StoryState } from "@/features/story/model/story-state";
import type { StoryJson } from "@/features/story/model/story-types";
import type { Workspace } from "@/features/pages/workspace/types";
import type { StoryWorkspace } from "@/features/story/persistence/story-storage";

type StoryPresentationActionsInput = {
  workspace: Workspace | null;
  activeStoryWorkspace: StoryWorkspace | null;
  activeStory: StoryJson | null;
  storyState: StoryState;
  persistStoryState: (nextState: StoryState) => Promise<void>;
};

export const useStoryPresentationActions = ({
  workspace,
  activeStoryWorkspace,
  activeStory,
  storyState,
  persistStoryState,
}: StoryPresentationActionsInput) => {
  const navigate = useNavigate();
  const [openingStoryId, setOpeningStoryId] = useState("");

  const openStoryPresentation = (channel: StoryPresentationChannel, nodeId?: string | null) => {
    if (!activeStory) {
      return;
    }

    return openRegisteredStoryPresentation(channel, {
      workspace,
      storyWorkspace: activeStoryWorkspace,
      activeStory,
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
