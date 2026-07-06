import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref, type RefObject } from "react";
import { BookOpen, Loader2, MessageSquare, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { requireRuntimeModelInput, type RuntimeModelOption } from "@/features/pages/settings/llm/store";
import { runTavernAssetExtraction } from "@/features/pages/taverns/tavern/runtime/assistants";
import { createTavernAssetDraft } from "@/features/pages/taverns/tavern/factories/asset-factories";
import type { TavernAssetDraft } from "@/features/pages/taverns/manage/model";
import { useTavernRoomContext } from "@/features/pages/taverns/room/context";
import {
  AssetDraftsDialog,
  IllustrationHintsDialog,
  LorebookDialog,
  TipsDialog,
  type PlotDataDialogHandle,
} from "./dialogs";

const TAVERN_RUNTIME_MODEL_UNAVAILABLE = "当前模型配置已不可用，请重新选择模型。";

const requireTavernRuntimeModelInput = (runtimeModel: RuntimeModelOption) =>
  requireRuntimeModelInput(runtimeModel, TAVERN_RUNTIME_MODEL_UNAVAILABLE);

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "未知错误";
};

const hasAssetDraftItems = (draft: TavernAssetDraft) =>
  draft.sceneMemories.some((memory) => memory.note.trim()) ||
  draft.characterMemories.some((memory) => memory.characterId.trim() && memory.note.trim()) ||
  draft.lorebookEntries.some((entry) => entry.title.trim() && entry.content.trim());

export type DetailPanelKey = "asset-drafts" | "lorebook" | "illustration-hints" | "tips";

export type PlotDataSectionHandle = {
  open: (detailPanel: DetailPanelKey) => void;
};

type PlotDataSectionProps = {
  bind?: Ref<PlotDataSectionHandle>;
  externalBusy: boolean;
  onBusyChange?: (isBusy: boolean) => void;
};

type PlotDataCardData = {
  key: DetailPanelKey;
  icon: LucideIcon;
  title: string;
  summary: string;
  bindRef: RefObject<PlotDataDialogHandle | null>;
};

const PlotDataCard = ({ data }: { data: PlotDataCardData }) => {
  const Icon = data.icon;

  return (
    <button
      type="button"
      className="flex min-h-[58px] min-w-0 items-center gap-2.5 rounded-lg border border-current/10 bg-current/[0.055] px-2.5 py-2 text-left text-current shadow-sm transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-current/[0.075]"
      title={`${data.title}：${data.summary}`}
      aria-label={`${data.title}：${data.summary}`}
      onClick={() => data.bindRef.current?.open()}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-5">{data.title}</span>
        <span className="mt-1 block truncate text-[11px] leading-4 text-current/60">{data.summary}</span>
      </span>
    </button>
  );
};

const PlotDataHeader = ({
  isBusy,
  isExtractingAssets,
  onExtractRecentAssets,
}: {
  isBusy: boolean;
  isExtractingAssets: boolean;
  onExtractRecentAssets: () => void;
}) => (
  <div className="flex min-h-9 items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-2 text-sm font-semibold leading-tight text-current">
      <BookOpen className="size-4 shrink-0 text-primary" />
      <span className="truncate">剧情资料</span>
    </div>
    <Button
      type="button"
      size="xs"
      variant="outline"
      className="shrink-0 rounded-full border-primary/25 bg-current/[0.055] px-2.5 text-xs text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50 dark:bg-current/[0.075]"
      disabled={isBusy}
      onClick={onExtractRecentAssets}
    >
      {isExtractingAssets ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
      整理最近
    </Button>
  </div>
);

export const PlotDataSection = ({ bind, externalBusy, onBusyChange }: PlotDataSectionProps) => {
  const {
    activeRoom,
    workspace,
    roomCharacters,
    roomMessages,
    runtimeModel,
    patchRoom,
    reportError,
    resetExecutionTrace,
    patchExecutionStep,
    setExecutionTraceAnchorMessageId,
  } = useTavernRoomContext();
  const [isExtractingAssets, setIsExtractingAssets] = useState(false);
  const assetDraftsDialogRef = useRef<PlotDataDialogHandle | null>(null);
  const lorebookDialogRef = useRef<PlotDataDialogHandle | null>(null);
  const illustrationHintsDialogRef = useRef<PlotDataDialogHandle | null>(null);
  const tipsDialogRef = useRef<PlotDataDialogHandle | null>(null);
  const open = useCallback((detailPanel: DetailPanelKey) => {
    switch (detailPanel) {
      case "asset-drafts":
        assetDraftsDialogRef.current?.open();
        break;
      case "lorebook":
        lorebookDialogRef.current?.open();
        break;
      case "illustration-hints":
        illustrationHintsDialogRef.current?.open();
        break;
      case "tips":
        tipsDialogRef.current?.open();
        break;
    }
  }, []);

  useImperativeHandle(bind, () => ({ open }), [open]);
  useEffect(() => {
    onBusyChange?.(isExtractingAssets);
  }, [isExtractingAssets, onBusyChange]);

  useEffect(
    () => () => {
      onBusyChange?.(false);
    },
    [onBusyChange],
  );

  if (!activeRoom) {
    return null;
  }

  const isBusy = externalBusy || isExtractingAssets;
  const extractRecentAssets = async () => {
    if (isBusy) {
      return;
    }

    if (!runtimeModel) {
      reportError("请先在设置中选择模型，再整理剧情资产。");
      return;
    }

    if (roomCharacters.length === 0) {
      reportError("当前房间还没有可整理的角色。");
      return;
    }

    if (activeRoom.assetDrafts.length >= activeRoom.settings.maxAssetDrafts) {
      reportError("待确认草稿已达上限，请先应用或忽略一部分草稿。");
      return;
    }

    const availableMessages = roomMessages.filter(
      (message) => message.status !== "streaming" && message.status !== "error",
    );
    const contextMessages = availableMessages.slice(-30);
    const sourceMessages = availableMessages.slice(-12);
    if (sourceMessages.length === 0) {
      reportError("当前房间还没有可整理的对话。");
      return;
    }

    setIsExtractingAssets(true);
    reportError("");
    if (activeRoom.settings.showExecutionTrace) {
      setExecutionTraceAnchorMessageId(roomMessages.at(-1)?.id ?? "");
      resetExecutionTrace([
        {
          id: "manual-asset-extraction",
          label: "整理最近对话",
          detail: "从最近对话中提取待确认剧情资产。",
          status: "running",
        },
      ]);
    }

    try {
      const extractedDraft = await runTavernAssetExtraction({
        workspacePath: workspace.path,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        room: activeRoom,
        characters: roomCharacters,
        messages: contextMessages,
        sourceMessages,
        references: [],
        currentUserText: "手动整理最近对话中值得沉淀的剧情资产。",
      });
      const assetDraft = createTavernAssetDraft(extractedDraft);
      if (!hasAssetDraftItems(assetDraft)) {
        patchExecutionStep("manual-asset-extraction", {
          status: "done",
          detail: "没有发现新的稳定剧情资产。",
        });
        toast.info("最近对话没有整理出新的剧情资产。");
        return;
      }

      patchRoom(activeRoom.id, {
        assetDrafts: [...activeRoom.assetDrafts, assetDraft].slice(-activeRoom.settings.maxAssetDrafts),
      });
      patchExecutionStep("manual-asset-extraction", {
        status: "done",
        detail: "已生成待确认草稿。",
      });
      toast.success("已生成剧情资产草稿，请确认后应用。");
    } catch (assetError) {
      patchExecutionStep("manual-asset-extraction", {
        status: "error",
        detail: getErrorMessage(assetError),
      });
      reportError(`剧情资产整理失败：${getErrorMessage(assetError)}`);
    } finally {
      setIsExtractingAssets(false);
    }
  };

  const enabledLorebookCount = activeRoom.lorebookEntries.filter((entry) => entry.enabled).length;
  const cards: PlotDataCardData[] = [
    {
      key: "asset-drafts",
      icon: Sparkles,
      title: "资产草稿",
      summary: activeRoom.assetDrafts.length > 0 ? `${activeRoom.assetDrafts.length} 个待确认草稿` : "暂无待确认草稿",
      bindRef: assetDraftsDialogRef,
    },
    {
      key: "lorebook",
      icon: BookOpen,
      title: "世界书",
      summary:
        activeRoom.lorebookEntries.length > 0
          ? `${activeRoom.lorebookEntries.length} 条设定，${enabledLorebookCount} 条启用`
          : "暂无世界书",
      bindRef: lorebookDialogRef,
    },
    {
      key: "illustration-hints",
      icon: Sparkles,
      title: "插图提示",
      summary:
        activeRoom.illustrationHints.length > 0
          ? `${activeRoom.illustrationHints.length} 条画面提示`
          : activeRoom.settings.illustrationHints.enabled
            ? "等待导演生成"
            : "未开启",
      bindRef: illustrationHintsDialogRef,
    },
    {
      key: "tips",
      icon: MessageSquare,
      title: "现场提示",
      summary: "现场信息与当前节点记忆",
      bindRef: tipsDialogRef,
    },
  ];

  return (
    <>
      <section className="space-y-3">
        <PlotDataHeader
          isBusy={isBusy}
          isExtractingAssets={isExtractingAssets}
          onExtractRecentAssets={() => void extractRecentAssets()}
        />
        <div className="grid grid-cols-2 gap-2.5">
          {cards.map((card) => (
            <PlotDataCard key={card.key} data={card} />
          ))}
        </div>
      </section>
      <AssetDraftsDialog bind={assetDraftsDialogRef} isBusy={isBusy} />
      <LorebookDialog bind={lorebookDialogRef} isBusy={isBusy} />
      <IllustrationHintsDialog bind={illustrationHintsDialogRef} isBusy={isBusy} />
      <TipsDialog bind={tipsDialogRef} isBusy={isBusy} />
    </>
  );
};
