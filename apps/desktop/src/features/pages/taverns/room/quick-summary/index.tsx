import type { Ref } from "react";
import { useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { toast } from "sonner";
import { requireRuntimeModelInput, type RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { TavernRoom } from "@/features/pages/taverns/tavern/types";
import { getTavernSceneInstanceDisplayTitle } from "@/features/pages/taverns/tavern/runtime/scene-selectors";
import {
  getTavernRuntimeStoryProjection,
  submitTavernStoryManuscript,
} from "@/features/pages/taverns/tavern/adapters/story";
import { useTavernRoomContext } from "@/features/pages/taverns/room/context";
import {
  generateQuickNovel,
  generateQuickSummary,
  getQuickSummarySourceMessages,
} from "./actions";
import {
  loadQuickSummaryCache,
  saveQuickSummaryCache,
  writeQuickNovelCacheEntry,
  writeQuickSummaryCacheEntry,
} from "./cache";
import { QuickSummaryDialog } from "./dialog";
import type {
  QuickNovelExportFormat,
  QuickSummaryCacheState,
  QuickSummaryTab,
} from "./types";
import {
  createQuickNovelExportContent,
  createQuickSummarySignature,
  formatQuickSummaryGeneratedAt,
  sanitizeFileName,
} from "./utils";

const TAVERN_RUNTIME_MODEL_UNAVAILABLE = "当前模型配置已不可用，请重新选择模型。";

export type QuickSummaryHandle = (options?: { force?: boolean }) => void;

type QuickSummaryProps = {
  bind: Ref<QuickSummaryHandle>;
};

const getRoomActiveSceneId = (room: TavernRoom) =>
  room.activeSceneInstanceId ?? room.activeSceneId ?? room.scenes?.[0]?.id ?? room.id;

const getRoomActiveStoryNodeId = (room: TavernRoom) => {
  const storyProjection = getTavernRuntimeStoryProjection(room);
  return storyProjection.activeSceneInstance?.nodeId ||
    storyProjection.graph.activeNodeId ||
    storyProjection.graph.entryNodeId ||
    storyProjection.graph.nodes[0]?.id ||
    "";
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "未知错误";
};

const requireTavernRuntimeModelInput = (runtimeModel: RuntimeModelOption) =>
  requireRuntimeModelInput(runtimeModel, TAVERN_RUNTIME_MODEL_UNAVAILABLE);

export const QuickSummary = ({
  bind,
}: QuickSummaryProps) => {
  const {
    workspace,
    activeRoom,
    roomCharacters,
    roomMessages,
    runtimeModel,
    isSending,
    visualPreset,
    setIsQuickSummaryBusy,
  } = useTavernRoomContext();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<QuickSummaryTab>("summary");
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isGeneratingNovel, setIsGeneratingNovel] = useState(false);
  const [isSubmittingNovelToStory, setIsSubmittingNovelToStory] = useState(false);
  const [exportFormat, setExportFormat] = useState<QuickNovelExportFormat>("md");
  const [error, setError] = useState("");
  const [cacheState, setCacheState] = useState<QuickSummaryCacheState>(
    () => ({
      workspaceId: workspace.id,
      entries: loadQuickSummaryCache(workspace.id),
    }),
  );

  const signature = useMemo(() => (
    activeRoom ? createQuickSummarySignature(activeRoom, roomMessages) : ""
  ), [activeRoom, roomMessages]);
  const activeCache = useMemo(() => (
    activeRoom ? cacheState.entries[getRoomActiveSceneId(activeRoom)] ?? null : null
  ), [activeRoom, cacheState.entries]);
  const isSummaryFresh = Boolean(activeCache && activeCache.signature === signature);
  const isNovelFresh = Boolean(
    activeCache?.novelContent?.trim() &&
    activeCache.novelSignature === signature,
  );
  const summaryGeneratedAtText = activeCache?.content.trim()
    ? formatQuickSummaryGeneratedAt(activeCache.generatedAt)
    : "";
  const novelGeneratedAtText = activeCache?.novelContent?.trim() && activeCache.novelGeneratedAt
    ? formatQuickSummaryGeneratedAt(activeCache.novelGeneratedAt)
    : "";

  useEffect(() => {
    setCacheState({
      workspaceId: workspace.id,
      entries: loadQuickSummaryCache(workspace.id),
    });
    setIsQuickSummaryBusy(false);
    setIsOpen(false);
    setActiveTab("summary");
    setIsGeneratingSummary(false);
    setIsGeneratingNovel(false);
    setIsSubmittingNovelToStory(false);
    setExportFormat("md");
    setError("");
  }, [setIsQuickSummaryBusy, workspace.id]);

  useEffect(() => {
    if (cacheState.workspaceId !== workspace.id) {
      return;
    }

    saveQuickSummaryCache(workspace.id, cacheState.entries);
  }, [cacheState, workspace.id]);

  useEffect(() => {
    setIsOpen(false);
    setIsGeneratingSummary(false);
    setIsGeneratingNovel(false);
    setIsSubmittingNovelToStory(false);
    setError("");
  }, [activeRoom?.id, activeRoom?.activeSceneId]);

  useEffect(() => {
    setIsQuickSummaryBusy(isGeneratingSummary || isGeneratingNovel);
  }, [isGeneratingNovel, isGeneratingSummary, setIsQuickSummaryBusy]);

  const open = useCallback(({
    force = false,
  }: {
    force?: boolean;
  } = {}) => {
    if (!activeRoom) {
      return;
    }

    setActiveTab("summary");

    if (isGeneratingSummary) {
      setIsOpen(true);
      return;
    }

    if (!force && activeCache?.content.trim()) {
      setError("");
      setIsOpen(true);
      return;
    }

    setIsOpen(true);
    setError("");

    if (isSending) {
      setError("请等待本轮回应完成后再总结当前进展。");
      return;
    }

    if (!runtimeModel) {
      setError("请先在设置中选择模型，再总结当前进展。");
      return;
    }

    const summaryMessages = getQuickSummarySourceMessages(roomMessages);
    const sceneId = getRoomActiveSceneId(activeRoom);

    setIsGeneratingSummary(true);
    void generateQuickSummary({
      workspacePath: workspace.path,
      runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
      room: activeRoom,
      characters: roomCharacters,
      messages: summaryMessages,
    })
      .then((content) => {
        setCacheState((current) => ({
          workspaceId: workspace.id,
          entries: writeQuickSummaryCacheEntry({
            entries: current.workspaceId === workspace.id
              ? current.entries
              : loadQuickSummaryCache(workspace.id),
            sceneId,
            signature,
            content,
          }),
        }));
      })
      .catch((summaryError) => {
        setError(`总结当前进展失败：${getErrorMessage(summaryError)}`);
      })
      .finally(() => {
        setIsGeneratingSummary(false);
      });
  }, [
    activeCache,
    activeRoom,
    isGeneratingSummary,
    isSending,
    roomCharacters,
    roomMessages,
    runtimeModel,
    signature,
    workspace.id,
    workspace.path,
  ]);

  useImperativeHandle(bind, () => open);

  const generateNovel = useCallback(() => {
    if (!activeRoom) {
      return;
    }

    setActiveTab("novel");

    if (isGeneratingNovel) {
      setIsOpen(true);
      return;
    }

    setIsOpen(true);
    setError("");

    if (isSending) {
      setError("请等待本轮回应完成后再生成小说。");
      return;
    }

    if (!runtimeModel) {
      setError("请先在设置中选择模型，再生成小说。");
      return;
    }

    const novelMessages = getQuickSummarySourceMessages(roomMessages);
    const sceneId = getRoomActiveSceneId(activeRoom);

    setIsGeneratingNovel(true);
    void generateQuickNovel({
      workspacePath: workspace.path,
      runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
      room: activeRoom,
      characters: roomCharacters,
      messages: novelMessages,
    })
      .then((novelContent) => {
        setCacheState((current) => ({
          workspaceId: workspace.id,
          entries: writeQuickNovelCacheEntry({
            entries: current.workspaceId === workspace.id
              ? current.entries
              : loadQuickSummaryCache(workspace.id),
            sceneId,
            signature,
            novelContent,
          }),
        }));
      })
      .catch((novelError) => {
        setError(`生成小说失败：${getErrorMessage(novelError)}`);
      })
      .finally(() => {
        setIsGeneratingNovel(false);
      });
  }, [
    activeRoom,
    isGeneratingNovel,
    isSending,
    roomCharacters,
    roomMessages,
    runtimeModel,
    signature,
    workspace.id,
    workspace.path,
  ]);

  const exportNovel = useCallback(() => {
    if (!activeRoom) {
      return;
    }

    const novelContent = activeCache?.novelContent?.trim() ?? "";
    if (!novelContent) {
      setError("暂无小说正文可导出。");
      return;
    }

    try {
      const activeSceneTitle = getTavernSceneInstanceDisplayTitle(
        activeRoom,
        activeRoom.activeSceneInstanceId,
        "当前场景",
      );
      const exportContent = createQuickNovelExportContent({
        format: exportFormat,
        roomTitle: activeRoom.title,
        sceneTitle: activeSceneTitle,
        generatedAt: activeCache?.novelGeneratedAt,
        content: novelContent,
      });
      const blob = new Blob([exportContent], {
        type: exportFormat === "md"
          ? "text/markdown;charset=utf-8"
          : "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
      link.href = url;
      link.download = `${sanitizeFileName(`${activeRoom.title}-${activeSceneTitle}-小说-${timestamp}`)}.${exportFormat}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setError("");
      toast.success(`已导出小说为 ${exportFormat.toUpperCase()} 文件`);
    } catch (exportError) {
      setError(`导出小说失败：${getErrorMessage(exportError)}`);
    }
  }, [
    activeCache?.novelContent,
    activeCache?.novelGeneratedAt,
    activeRoom,
    exportFormat,
  ]);

  const submitNovelToStory = useCallback(() => {
    if (!activeRoom) {
      return;
    }

    const storyId = activeRoom.storyBinding?.storyId ?? "";
    if (!storyId) {
      setError("当前酒馆还没有绑定故事，无法收稿。");
      return;
    }

    const nodeId = getRoomActiveStoryNodeId(activeRoom);
    if (!nodeId) {
      setError("当前酒馆没有可绑定的故事节点。");
      return;
    }

    const novelContent = activeCache?.novelContent?.trim() ?? "";
    if (!novelContent) {
      setError("暂无小说正文可收稿。");
      return;
    }

    const activeSceneTitle = getTavernSceneInstanceDisplayTitle(
      activeRoom,
      activeRoom.activeSceneInstanceId,
      "当前场景",
    );
    const sourceMessages = getQuickSummarySourceMessages(roomMessages);
    setIsSubmittingNovelToStory(true);
    void submitTavernStoryManuscript({
      storyId,
      input: {
        storyId,
        nodeId,
        source: "tavern",
        sourceRunId: activeRoom.activeRunId ?? activeRoom.id,
        sourceMessageIds: sourceMessages.map((message) => message.id),
        title: `${activeRoom.title} - ${activeSceneTitle} 小说稿`,
        content: novelContent,
        summary: (activeCache?.content || novelContent).replace(/\s+/g, " ").trim().slice(0, 160),
        metadata: {
          channel: "tavern-quick-novel",
          roomId: activeRoom.id,
          sceneInstanceId: activeRoom.activeSceneInstanceId,
        },
      },
    })
      .then(() => {
        setError("");
        toast.success("已发送到故事收稿箱。");
      })
      .catch((submitError) => {
        setError(`收稿失败：${getErrorMessage(submitError)}`);
      })
      .finally(() => {
        setIsSubmittingNovelToStory(false);
      });
  }, [
    activeCache?.content,
    activeCache?.novelContent,
    activeRoom,
    roomMessages,
    workspace.id,
    workspace.path,
  ]);

  const canSubmitNovelToStory = Boolean(
    activeRoom?.storyBinding?.storyId &&
    activeCache?.novelContent?.trim() &&
    !isGeneratingSummary &&
    !isGeneratingNovel &&
    !isSending,
  );

  return (
    <QuickSummaryDialog
      open={isOpen}
      tab={activeTab}
      visualPreset={visualPreset}
      summaryContent={activeCache?.content ?? ""}
      novelContent={activeCache?.novelContent ?? ""}
      summaryGeneratedAtText={summaryGeneratedAtText}
      novelGeneratedAtText={novelGeneratedAtText}
      isSummaryFresh={isSummaryFresh}
      isNovelFresh={isNovelFresh}
      isGeneratingSummary={isGeneratingSummary}
      isGeneratingNovel={isGeneratingNovel}
      isSubmittingNovelToStory={isSubmittingNovelToStory}
      isSending={isSending}
      error={error}
      exportFormat={exportFormat}
      canSubmitNovelToStory={canSubmitNovelToStory}
      onOpenChange={setIsOpen}
      onTabChange={setActiveTab}
      onExportFormatChange={setExportFormat}
      onRegenerateSummary={() => open({ force: true })}
      onGenerateNovel={generateNovel}
      onExportNovel={exportNovel}
      onSubmitNovelToStory={submitNovelToStory}
    />
  );
};
