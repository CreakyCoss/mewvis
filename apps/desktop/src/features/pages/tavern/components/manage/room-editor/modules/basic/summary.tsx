import {
  FileText,
  Flag,
  Goal,
  PanelTop,
  MessageSquareText,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getActiveTavernScene,
  getTavernSceneDisplayTitle,
} from "../../../../../storage";
import type { TavernRoom } from "../../../../../types";
import {
  emptyValueText,
  formatCount,
  getReplyModeLabel,
} from "../../utils";

const getPreviewText = (value: string, fallback = emptyValueText) =>
  value.trim() || fallback;

const LongTextCard = ({
  icon: Icon,
  title,
  value,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
}) => {
  const displayValue = getPreviewText(value);

  return (
    <div className="rounded-md border bg-background/75 px-3 py-2.5 shadow-xs">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold leading-5">
            {title}
          </h3>
          <p
            className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground"
            title={displayValue}
          >
            {displayValue}
          </p>
        </div>
      </div>
    </div>
  );
};

const MetricCard = ({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) => (
  <div className="rounded-md border bg-background/75 px-3 py-2.5 shadow-xs">
    <div className="truncate text-xs font-medium leading-5 text-muted-foreground">
      {label}
    </div>
    <div className="mt-3 flex min-w-0 items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div
        className="min-w-0 truncate text-sm font-semibold leading-5"
        title={value}
      >
        {value}
      </div>
    </div>
  </div>
);

export const BasicSummaryContent = ({
  data,
  className,
}: {
  data: TavernRoom;
  className?: string;
}) => {
  const activeScene = getActiveTavernScene(data);
  const sceneCount = data.scenes?.length ?? 1;

  return (
    <div
      className={cn(
        "grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(20rem,1fr)]",
        className,
      )}
    >
      <div className="grid gap-2">
        <LongTextCard
          icon={FileText}
          title="故事框架"
          value={data.storyOutline}
        />
        <LongTextCard
          icon={Goal}
          title="终局目标"
          value={data.storyGoal}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <MetricCard
          icon={PanelTop}
          label="默认场景"
          value={activeScene ? getTavernSceneDisplayTitle(data, activeScene.id) : "默认场景"}
        />
        <MetricCard
          icon={MessageSquareText}
          label="回复模式"
          value={getReplyModeLabel(data.replyMode ?? "active")}
        />
        <MetricCard
          icon={UserRound}
          label="用户称呼"
          value={data.userPersonaName.trim() || emptyValueText}
        />
        <MetricCard
          icon={Flag}
          label="故事场景"
          value={formatCount(sceneCount, "场景")}
        />
      </div>
    </div>
  );
};
