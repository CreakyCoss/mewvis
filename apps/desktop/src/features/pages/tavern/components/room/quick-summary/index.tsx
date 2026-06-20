import type { Ref } from "react";
import { useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { toast } from "sonner";
import { requireRuntimeModelInput, type RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { TavernRoom } from "../../../types";
import { useTavernPageContext } from "../../context";
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
  room.activeSceneId ?? room.scenes?.[0]?.id ?? room.id;

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
    runtimeAgentId,
    isSending,
    visualPreset,
    setIsQuickSummaryBusy,
  } = useTavernPageContext();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<QuickSummaryTab>("summary");
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isGeneratingNovel, setIsGeneratingNovel] = useState(false);
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

    if (!runtimeAgentId) {
      setError("请先选择可用的 Agent 运行配置。");
      return;
    }

    const summaryMessages = getQuickSummarySourceMessages(roomMessages);
    const sceneId = getRoomActiveSceneId(activeRoom);

    setIsGeneratingSummary(true);
    void generateQuickSummary({
      workspacePath: workspace.path,
      runtimeAgentId,
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
    runtimeAgentId,
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

    if (!runtimeAgentId) {
      setError("请先选择可用的 Agent 运行配置。");
      return;
    }

    const novelMessages = getQuickSummarySourceMessages(roomMessages);
    const sceneId = getRoomActiveSceneId(activeRoom);

    setIsGeneratingNovel(true);
    void generateQuickNovel({
      workspacePath: workspace.path,
      runtimeAgentId,
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
    runtimeAgentId,
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
      const activeSceneTitle = activeRoom.scenes?.find((scene) =>
        scene.id === activeRoom.activeSceneId
      )?.title ?? "当前场景";
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
      isSending={isSending}
      error={error}
      exportFormat={exportFormat}
      onOpenChange={setIsOpen}
      onTabChange={setActiveTab}
      onExportFormatChange={setExportFormat}
      onRegenerateSummary={() => open({ force: true })}
      onGenerateNovel={generateNovel}
      onExportNovel={exportNovel}
    />
  );
};
