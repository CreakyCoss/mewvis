import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useRuntimeAgentSettings } from "@/features/ai/hooks/use-runtime-agent-settings";
import { requireRuntimeModelInput } from "@/features/pages/settings/llm/store";
import type { StoryJson } from "../../story/model/types";
import type { StoryWorkspace } from "../../storage";
import {
  acceptStoryManuscriptDraft,
  listStoryManuscripts,
  rejectStoryManuscriptDraft,
  submitStoryManuscriptToWorkspace,
  updateStoryManuscriptDraft,
} from "../service";
import type { StoryManuscript, StoryManuscriptSubmissionInput, StoryManuscriptUpdateInput } from "../model/types";
import { runStoryWriterAgent } from "../story-writer-agent";

type UseStoryManuscriptsInput = {
  story: StoryJson;
  workspace: StoryWorkspace | null;
};

export const useStoryManuscripts = ({ story, workspace }: UseStoryManuscriptsInput) => {
  const { runtimeAgentRequiresModel, selectedRuntimeModel, settingsError } = useRuntimeAgentSettings();
  const [manuscripts, setManuscripts] = useState<StoryManuscript[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspace) {
      setManuscripts([]);
      return;
    }

    setIsLoading(true);
    try {
      setManuscripts(await listStoryManuscripts(workspace, story.id));
    } catch (error) {
      console.error("Failed to load story manuscripts", error);
      toast.error(error instanceof Error ? error.message : "无法加载稿件。");
      setManuscripts([]);
    } finally {
      setIsLoading(false);
    }
  }, [story.id, workspace]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createManuscriptDraft = async (input: Omit<StoryManuscriptSubmissionInput, "storyId" | "source">) => {
    if (!workspace) {
      toast.error("当前没有可用故事工作区。");
      return;
    }

    try {
      await submitStoryManuscriptToWorkspace(story, workspace, {
        ...input,
        storyId: story.id,
        source: "manual",
      });
      toast.success("稿件已加入未收稿。");
      await refresh();
    } catch (error) {
      console.error("Failed to create manuscript draft", error);
      toast.error(error instanceof Error ? error.message : "创建稿件失败。");
    }
  };

  const saveManuscriptDraft = async (draftId: string, patch: StoryManuscriptUpdateInput) => {
    if (!workspace) {
      toast.error("当前没有可用故事工作区。");
      return;
    }

    try {
      await updateStoryManuscriptDraft({
        draftId,
        input: patch,
        storyId: story.id,
        workspace,
      });
      toast.success("稿件已保存。");
      await refresh();
    } catch (error) {
      console.error("Failed to save manuscript draft", error);
      toast.error(error instanceof Error ? error.message : "保存稿件失败。");
    }
  };

  const acceptManuscript = async (draftId: string, patch?: StoryManuscriptUpdateInput) => {
    if (!workspace) {
      toast.error("当前没有可用故事工作区。");
      return;
    }

    try {
      await acceptStoryManuscriptDraft({
        draftId,
        patch,
        storyId: story.id,
        workspace,
      });
      toast.success("已收稿。");
      await refresh();
    } catch (error) {
      console.error("Failed to accept manuscript", error);
      toast.error(error instanceof Error ? error.message : "收稿失败。");
    }
  };

  const rejectManuscript = async (draftId: string) => {
    if (!workspace) {
      toast.error("当前没有可用故事工作区。");
      return;
    }

    try {
      await rejectStoryManuscriptDraft({
        draftId,
        storyId: story.id,
        workspace,
      });
      toast.success("已退回稿件。");
      await refresh();
    } catch (error) {
      console.error("Failed to reject manuscript", error);
      toast.error(error instanceof Error ? error.message : "退回失败。");
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
      throw new Error("当前没有可用故事工作区。");
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

  return {
    acceptManuscript,
    createManuscriptDraft,
    isLoading,
    manuscripts,
    polishManuscriptDraft,
    refresh,
    rejectManuscript,
    saveManuscriptDraft,
  };
};
