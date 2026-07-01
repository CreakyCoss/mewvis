import { toast } from "sonner";
import {
  requireRuntimeModelInput,
  type RuntimeModelOption,
} from "@/features/pages/settings/llm/store";
import type { Workspace } from "@/features/pages/workspace/types";
import {
  acceptStoryManuscriptDraft,
  rejectStoryManuscriptDraft,
  runStoryWriterAgent,
  submitStoryManuscriptDraft,
  updateStoryManuscriptDraft,
  type StoryAsset,
  type StoryManuscriptDraftUpdateInput,
  type StoryManuscriptSubmissionInput,
} from "@/features/story";
import { getPendingDraftCount } from "./story-form-utils";

type UseStoryManuscriptsInput = {
  activeStory: StoryAsset | null;
  persistStory: (story: StoryAsset) => void;
  runtimeAgentRequiresModel: boolean;
  selectedRuntimeModel: RuntimeModelOption | null;
  settingsError: string;
  workspace: Workspace | null;
};

export const useStoryManuscripts = ({
  activeStory,
  persistStory,
  runtimeAgentRequiresModel,
  selectedRuntimeModel,
  settingsError,
  workspace,
}: UseStoryManuscriptsInput) => {
  const acceptManuscript = (draftId: string, patch?: StoryManuscriptDraftUpdateInput) => {
    if (!activeStory) {
      return;
    }

    try {
      const inbox = patch
        ? updateStoryManuscriptDraft(activeStory.manuscriptInbox, draftId, patch)
        : activeStory.manuscriptInbox;
      persistStory({
        ...activeStory,
        manuscriptInbox: acceptStoryManuscriptDraft(inbox, draftId).inbox,
      });
      toast.success("已收稿。");
    } catch (error) {
      console.error("Failed to accept manuscript", error);
      toast.error("收稿失败。");
    }
  };

  const saveManuscriptDraft = (
    draftId: string,
    patch: StoryManuscriptDraftUpdateInput,
  ) => {
    if (!activeStory) {
      return;
    }

    try {
      persistStory({
        ...activeStory,
        manuscriptInbox: updateStoryManuscriptDraft(activeStory.manuscriptInbox, draftId, patch),
      });
      toast.success("稿件已保存。");
    } catch (error) {
      console.error("Failed to save manuscript draft", error);
      toast.error(error instanceof Error ? error.message : "保存稿件失败。");
    }
  };

  const createManuscriptDraft = (
    input: Omit<StoryManuscriptSubmissionInput, "storyId" | "source">,
  ) => {
    if (!activeStory) {
      return;
    }

    try {
      const { inbox } = submitStoryManuscriptDraft(activeStory.manuscriptInbox, {
        ...input,
        storyId: activeStory.id,
        source: "manual",
      });
      persistStory({
        ...activeStory,
        manuscriptInbox: inbox,
      });
      toast.success("稿件已加入收稿箱。");
    } catch (error) {
      console.error("Failed to create manuscript draft", error);
      toast.error(error instanceof Error ? error.message : "创建稿件失败。");
    }
  };

  const polishManuscriptDraft = async ({
    nodeId,
    title,
    summary,
    content,
  }: {
    nodeId: string;
    title: string;
    summary?: string;
    content: string;
  }) => {
    if (!workspace || !activeStory) {
      throw new Error("当前没有可用故事。");
    }
    if (settingsError) {
      throw new Error(settingsError);
    }
    if (runtimeAgentRequiresModel && !selectedRuntimeModel) {
      throw new Error("请先在设置中选择模型。");
    }

    return runStoryWriterAgent({
      workspacePath: workspace.path,
      runtimeModel: selectedRuntimeModel ? requireRuntimeModelInput(selectedRuntimeModel) : null,
      story: activeStory,
      nodeId,
      mode: "polish",
      title,
      summary,
      content,
    });
  };

  const rejectManuscript = (draftId: string) => {
    if (!activeStory) {
      return;
    }

    try {
      persistStory({
        ...activeStory,
        manuscriptInbox: rejectStoryManuscriptDraft(activeStory.manuscriptInbox, draftId),
      });
      toast.success("已退回稿件。");
    } catch (error) {
      console.error("Failed to reject manuscript", error);
      toast.error("退回失败。");
    }
  };

  return {
    acceptManuscript,
    createManuscriptDraft,
    pendingDraftCount: activeStory ? getPendingDraftCount(activeStory) : 0,
    polishManuscriptDraft,
    rejectManuscript,
    saveManuscriptDraft,
  };
};
