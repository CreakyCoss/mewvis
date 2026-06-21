import {
  useCallback,
  useImperativeHandle,
  useRef,
  type ReactNode,
  type Ref,
} from "react";
import {
  Activity,
  BookOpen,
  Check,
  Clock,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TavernRoom } from "../../../../types";
import type { DetailPanelKey } from "../types";
import { Detail, type PlotDataDetailHandle } from "./detail";

export type PlotDataSectionHandle = {
  open: (detailPanel: DetailPanelKey) => void;
};

type PlotDataSectionProps = {
  bind?: Ref<PlotDataSectionHandle>;
  activeRoom: TavernRoom;
  isBusy: boolean;
  isExtractingAssets: boolean;
  enabledLorebookCount: number;
  visibleStatusDefinitionCount: number;
  visibleStatusRuleCount: number;
  pendingStatusEventCount: number;
  visibleTaskDefinitionCount: number;
  visibleSceneOutcomeCount: number;
  pendingOutcomeEventCount: number;
  currentInformationViewLabel: string;
  reviewHiddenFactCount: number;
  hiddenFactCount: number;
  privateIntelCount: number;
  identityFactCount: number;
  onExtractRecentAssets: () => void;
  renderDetailContent: (detailPanel: DetailPanelKey) => ReactNode;
};

type PlotDataCardData = {
  icon: LucideIcon;
  title: string;
  summary: string;
  detailPanel: DetailPanelKey;
};

const PlotDataCard = ({
  data,
  onOpen,
}: {
  data: PlotDataCardData;
  onOpen: (detailPanel: DetailPanelKey) => void;
}) => {
  const Icon = data.icon;

  return (
    <button
      type="button"
      className="flex min-h-[58px] min-w-0 items-center gap-2.5 rounded-lg border border-current/10 bg-background/45 px-2.5 py-2 text-left text-current shadow-sm transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`${data.title}：${data.summary}`}
      aria-label={`${data.title}：${data.summary}`}
      onClick={() => onOpen(data.detailPanel)}
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
      className="shrink-0 rounded-full border-primary/25 bg-background/45 px-2.5 text-xs text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
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
  activeRoom,
  isBusy,
  isExtractingAssets,
  enabledLorebookCount,
  visibleStatusDefinitionCount,
  visibleStatusRuleCount,
  pendingStatusEventCount,
  visibleTaskDefinitionCount,
  visibleSceneOutcomeCount,
  pendingOutcomeEventCount,
  currentInformationViewLabel,
  reviewHiddenFactCount,
  hiddenFactCount,
  privateIntelCount,
  identityFactCount,
  onExtractRecentAssets,
  renderDetailContent,
}: PlotDataSectionProps) => {
  const detailRef = useRef<PlotDataDetailHandle | null>(null);
  const open = useCallback((detailPanel: DetailPanelKey) => {
    detailRef.current?.open(detailPanel);
  }, []);

  useImperativeHandle(bind, () => ({ open }), [open]);

  const cards: PlotDataCardData[] = [
    {
      icon: Sparkles,
      title: "资产草稿",
      summary: activeRoom.assetDrafts.length > 0
        ? `${activeRoom.assetDrafts.length} 个待确认草稿`
        : "暂无待确认草稿",
      detailPanel: "asset-drafts",
    },
    {
      icon: Clock,
      title: "时间线",
      summary: activeRoom.timelineEvents.length > 0
        ? `${activeRoom.timelineEvents.length} 个剧情事件`
        : "暂无剧情事件",
      detailPanel: "timeline",
    },
    {
      icon: BookOpen,
      title: "世界书",
      summary: activeRoom.lorebookEntries.length > 0
        ? `${activeRoom.lorebookEntries.length} 条设定，${enabledLorebookCount} 条启用`
        : "暂无世界书",
      detailPanel: "lorebook",
    },
    {
      icon: Sparkles,
      title: "插图提示",
      summary: activeRoom.illustrationHints.length > 0
        ? `${activeRoom.illustrationHints.length} 条画面提示`
        : activeRoom.settings.illustrationHints.enabled ? "等待导演生成" : "未开启",
      detailPanel: "illustration-hints",
    },
    {
      icon: Activity,
      title: "状态规则",
      summary: `${visibleStatusDefinitionCount} 项状态，${visibleStatusRuleCount} 条规则，${pendingStatusEventCount} 条待确认`,
      detailPanel: "progress-rules",
    },
    {
      icon: Check,
      title: "任务结局",
      summary: `${visibleTaskDefinitionCount} 个任务，${visibleSceneOutcomeCount} 个结局，${pendingOutcomeEventCount} 个待确认`,
      detailPanel: "tasks-outcomes",
    },
    {
      icon: ShieldCheck,
      title: "剧本视角",
      summary: `${currentInformationViewLabel}，${reviewHiddenFactCount}/${hiddenFactCount} 条隐藏事实可见`,
      detailPanel: "script-review",
    },
    {
      icon: MessageSquare,
      title: "我的情报",
      summary: privateIntelCount > 0
        ? `${privateIntelCount} 条事实${identityFactCount > 0 ? `，${identityFactCount} 条身份/阵营` : ""}`
        : "暂无仅你可知事实",
      detailPanel: "private-intel",
    },
    {
      icon: MessageSquare,
      title: "现场提示",
      summary: "内页只保留现场信息，更多配置在首页编辑",
      detailPanel: "tips",
    },
  ];

  return (
    <>
      <section className="space-y-3">
        <PlotDataHeader
          isBusy={isBusy}
          isExtractingAssets={isExtractingAssets}
          onExtractRecentAssets={onExtractRecentAssets}
        />
        <div className="grid grid-cols-2 gap-2.5">
          {cards.map((card) => (
            <PlotDataCard
              key={card.detailPanel}
              data={card}
              onOpen={open}
            />
          ))}
        </div>
      </section>
      <Detail bind={detailRef} renderContent={renderDetailContent} />
    </>
  );
};
