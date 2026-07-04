import { toast } from "sonner";
import { useRuntimeAgentSettings } from "@/features/ai/hooks/use-runtime-agent-settings";
import { requireRuntimeModelInput } from "@/features/pages/settings/llm/store";
import {
  acceptStoryManuscriptDraft,
  rejectStoryManuscriptDraft,
  submitStoryManuscriptDraft,
  updateStoryManuscriptDraft,
  type StoryManuscriptDraftUpdateInput,
  type StoryManuscriptSubmissionInput,
} from "./manuscript-inbox";
import type { StoryJson } from "../../model/types";
import type { StoryWorkspace } from "../../../storage";
import { runStoryWriterAgent } from "./story-writer-agent";

type UseStoryManuscriptsInput = {
  onSave: (story: StoryJson) => void;
  story: StoryJson;
  workspace: StoryWorkspace | null;
};

export const useStoryManuscripts = ({ onSave, story, workspace }: UseStoryManuscriptsInput) => {
  const { runtimeAgentRequiresModel, selectedRuntimeModel, settingsError } = useRuntimeAgentSettings();

  const acceptManuscript = (draftId: string, patch?: StoryManuscriptDraftUpdateInput) => {
    try {
      const inbox = patch ? updateStoryManuscriptDraft(story.manuscriptInbox, draftId, patch) : story.manuscriptInbox;
      onSave({
        ...story,
        manuscriptInbox: acceptStoryManuscriptDraft(inbox, draftId).inbox,
      });
      toast.success("已收稿。");
    } catch (error) {
      console.error("Failed to accept manuscript", error);
      toast.error("收稿失败。");
    }
  };

  const saveManuscriptDraft = (draftId: string, patch: StoryManuscriptDraftUpdateInput) => {
    try {
      onSave({
        ...story,
        manuscriptInbox: updateStoryManuscriptDraft(story.manuscriptInbox, draftId, patch),
      });
      toast.success("稿件已保存。");
    } catch (error) {
      console.error("Failed to save manuscript draft", error);
      toast.error(error instanceof Error ? error.message : "保存稿件失败。");
    }
  };

  const createManuscriptDraft = (input: Omit<StoryManuscriptSubmissionInput, "storyId" | "source">) => {
    try {
      const { inbox } = submitStoryManuscriptDraft(story.manuscriptInbox, {
        ...input,
        storyId: story.id,
        source: "manual",
      });
      onSave({
        ...story,
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
    if (!workspace) {
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
      story,
      nodeId,
      mode: "polish",
      title,
      summary,
      content,
    });
  };

  const rejectManuscript = (draftId: string) => {
    try {
      onSave({
        ...story,
        manuscriptInbox: rejectStoryManuscriptDraft(story.manuscriptInbox, draftId),
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
    polishManuscriptDraft,
    rejectManuscript,
    saveManuscriptDraft,
  };
};
