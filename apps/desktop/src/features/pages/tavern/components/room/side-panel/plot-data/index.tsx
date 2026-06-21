import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from "react";
import {
  Activity,
  BookOpen,
  Check,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  requireRuntimeModelInput,
  type RuntimeModelOption,
} from "@/features/pages/settings/llm/store";
import {
  filterTavernFactEventsForAudience,
  isTavernProgressVisibilityVisibleToUser,
  resolveTavernInformationView,
} from "../../../../core";
import { runTavernAssetExtraction } from "../../../../runtime/asset-extractor";
import {
  createTavernAssetDraft,
} from "../../../../storage";
import type { TavernAssetDraft } from "../../../../types";
import { useTavernPageContext } from "../../../context";
import type { DetailPanelKey } from "../types";
import {
  AssetDraftsDialog,
  IllustrationHintsDialog,
  LorebookDialog,
  PrivateIntelDialog,
  ProgressRulesDialog,
  ScriptReviewDialog,
  TipsDialog,
  TasksOutcomesDialog,
  type PlotDataDialogHandle,
} from "./dialogs";
import {
  informationViewLabels,
  isHiddenFactEvent,
  isIdentityFactEvent,
} from "./helpers";

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
  draft.characterMemories.some((memory) => memory.characterId.trim() && memory.note.trim()) ||
  draft.lorebookEntries.some((entry) => entry.title.trim() && entry.content.trim());

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

const PlotDataCard = ({
  data,
}: {
  data: PlotDataCardData;
}) => {
  const Icon = data.icon;

  return (
    <button
      type="button"
      className="flex min-h-[58px] min-w-0 items-center gap-2.5 rounded-lg border border-current/10 bg-current/[0.055] dark:bg-current/[0.075] px-2.5 py-2 text-left text-current shadow-sm transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`${data.title}：${data.summary}`}
      aria-label={`${data.title}：${data.summary}`}
      onClick={() => data.bindRef.current?.open()}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-5">
          {data.title}
        </span>
        <span className="mt-1 block h-px w-10 bg-current/10" />
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
      className="shrink-0 rounded-full border-primary/25 bg-current/[0.055] dark:bg-current/[0.075] px-2.5 text-xs text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
      disabled={isBusy}
      onClick={onExtractRecentAssets}
    >
      {isExtractingAssets ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Sparkles className="size-3.5" />
      )}
      整理最近
    </Button>
  </div>
);

export const PlotDataSection = ({
  bind,
  externalBusy,
  onBusyChange,
}: PlotDataSectionProps) => {
  const {
    activeRoom,
    workspace,
    roomCharacters,
    roomMessages,
    runtimeModel,
    runtimeAgentId,
    patchRoom,
    reportError,
    resetExecutionTrace,
    patchExecutionStep,
    setExecutionTraceAnchorMessageId,
  } = useTavernPageContext();
  const [isExtractingAssets, setIsExtractingAssets] = useState(false);
  const assetDraftsDialogRef = useRef<PlotDataDialogHandle | null>(null);
  const lorebookDialogRef = useRef<PlotDataDialogHandle | null>(null);
  const illustrationHintsDialogRef = useRef<PlotDataDialogHandle | null>(null);
  const progressRulesDialogRef = useRef<PlotDataDialogHandle | null>(null);
  const tasksOutcomesDialogRef = useRef<PlotDataDialogHandle | null>(null);
  const scriptReviewDialogRef = useRef<PlotDataDialogHandle | null>(null);
  const privateIntelDialogRef = useRef<PlotDataDialogHandle | null>(null);
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
      case "progress-rules":
        progressRulesDialogRef.current?.open();
        break;
      case "tasks-outcomes":
        tasksOutcomesDialogRef.current?.open();
        break;
      case "script-review":
        scriptReviewDialogRef.current?.open();
        break;
      case "private-intel":
        privateIntelDialogRef.current?.open();
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

  useEffect(() => () => {
    onBusyChange?.(false);
  }, [onBusyChange]);

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

    if (!runtimeAgentId) {
      reportError("请先选择可用的 Agent 运行配置。");
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

    const availableMessages = roomMessages.filter((message) =>
      message.status !== "streaming" && message.status !== "error"
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
      resetExecutionTrace([{
        id: "manual-asset-extraction",
        label: "整理最近对话",
        detail: "从最近对话中提取待确认剧情资产。",
        status: "running",
      }]);
    }

    try {
      const extractedDraft = await runTavernAssetExtraction({
        workspacePath: workspace.path,
        runtimeAgentId,
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
        assetDrafts: [...activeRoom.assetDrafts, assetDraft]
          .slice(-activeRoom.settings.maxAssetDrafts),
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
  const statusDefinitionById = new Map(activeRoom.statusDefinitions.map((definition) => [definition.id, definition]));
  const visibleStatusDefinitionCount = activeRoom.statusDefinitions.filter((definition) =>
    isTavernProgressVisibilityVisibleToUser(definition.visibility)
  ).length;
  const visibleStatusRuleCount = activeRoom.statusRules.filter((rule) => {
    const definition = statusDefinitionById.get(rule.apply.statusId);
    return definition ? isTavernProgressVisibilityVisibleToUser(definition.visibility) : true;
  }).length;
  const pendingStatusEventCount = activeRoom.statusEvents
    .filter((event) => event.status === "pending")
    .filter((event) => {
      const visibility = statusDefinitionById.get(event.statusId)?.visibility;
      return isTavernProgressVisibilityVisibleToUser(visibility ?? "public");
    })
    .length;
  const visibleTaskDefinitionCount = activeRoom.taskDefinitions.filter((task) =>
    isTavernProgressVisibilityVisibleToUser(task.visibility)
  ).length;
  const visibleSceneOutcomeCount = activeRoom.sceneOutcomes.filter((outcome) =>
    isTavernProgressVisibilityVisibleToUser(outcome.visibility)
  ).length;
  const pendingOutcomeEventCount = activeRoom.outcomeEvents.filter((event) => event.status === "pending").length;
  const privateIntelEvents = filterTavernFactEventsForAudience({
    factEvents: activeRoom.factEvents,
    room: activeRoom,
    audience: { type: "user" },
  }).filter((event) => event.visibleToUser || event.visibility !== "public");
  const currentInformationView = resolveTavernInformationView({
    policy: activeRoom.settings.informationPolicy,
    outcomeEvents: activeRoom.outcomeEvents,
  });
  const reviewFactEvents = filterTavernFactEventsForAudience({
    factEvents: activeRoom.factEvents,
    room: activeRoom,
    audience: currentInformationView === "director" ? { type: "director" } : { type: "user" },
  });
  const hiddenFactCount = activeRoom.factEvents.filter(isHiddenFactEvent).length;
  const reviewHiddenFactCount = reviewFactEvents.filter(isHiddenFactEvent).length;
  const identityFactCount = privateIntelEvents.filter(isIdentityFactEvent).length;

  const cards: PlotDataCardData[] = [
    {
      key: "asset-drafts",
      icon: Sparkles,
      title: "资产草稿",
      summary: activeRoom.assetDrafts.length > 0
        ? `${activeRoom.assetDrafts.length} 个待确认草稿`
        : "暂无待确认草稿",
      bindRef: assetDraftsDialogRef,
    },
    {
      key: "lorebook",
      icon: BookOpen,
      title: "世界书",
      summary: activeRoom.lorebookEntries.length > 0
        ? `${activeRoom.lorebookEntries.length} 条设定，${enabledLorebookCount} 条启用`
        : "暂无世界书",
      bindRef: lorebookDialogRef,
    },
    {
      key: "illustration-hints",
      icon: Sparkles,
      title: "插图提示",
      summary: activeRoom.illustrationHints.length > 0
        ? `${activeRoom.illustrationHints.length} 条画面提示`
        : activeRoom.settings.illustrationHints.enabled ? "等待导演生成" : "未开启",
      bindRef: illustrationHintsDialogRef,
    },
    {
      key: "progress-rules",
      icon: Activity,
      title: "状态规则",
      summary: `${visibleStatusDefinitionCount} 项状态，${visibleStatusRuleCount} 条规则，${pendingStatusEventCount} 条待确认`,
      bindRef: progressRulesDialogRef,
    },
    {
      key: "tasks-outcomes",
      icon: Check,
      title: "任务结局",
      summary: `${visibleTaskDefinitionCount} 个任务，${visibleSceneOutcomeCount} 个结局，${pendingOutcomeEventCount} 个待确认`,
      bindRef: tasksOutcomesDialogRef,
    },
    {
      key: "script-review",
      icon: ShieldCheck,
      title: "剧本视角",
      summary: `${informationViewLabels[currentInformationView]}，${reviewHiddenFactCount}/${hiddenFactCount} 条隐藏事实可见`,
      bindRef: scriptReviewDialogRef,
    },
    {
      key: "private-intel",
      icon: MessageSquare,
      title: "我的情报",
      summary: privateIntelEvents.length > 0
        ? `${privateIntelEvents.length} 条事实${identityFactCount > 0 ? `，${identityFactCount} 条身份/阵营` : ""}`
        : "暂无仅你可知事实",
      bindRef: privateIntelDialogRef,
    },
    {
      key: "tips",
      icon: MessageSquare,
      title: "现场提示",
      summary: "内页只保留现场信息，更多配置在首页编辑",
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
            <PlotDataCard
              key={card.key}
              data={card}
            />
          ))}
        </div>
      </section>
      <AssetDraftsDialog bind={assetDraftsDialogRef} isBusy={isBusy} />
      <LorebookDialog bind={lorebookDialogRef} isBusy={isBusy} />
      <IllustrationHintsDialog bind={illustrationHintsDialogRef} isBusy={isBusy} />
      <ProgressRulesDialog bind={progressRulesDialogRef} isBusy={isBusy} />
      <TasksOutcomesDialog bind={tasksOutcomesDialogRef} isBusy={isBusy} />
      <ScriptReviewDialog bind={scriptReviewDialogRef} isBusy={isBusy} />
      <PrivateIntelDialog bind={privateIntelDialogRef} isBusy={isBusy} />
      <TipsDialog bind={tipsDialogRef} isBusy={isBusy} />
    </>
  );
};
