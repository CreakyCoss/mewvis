import {
  Activity,
  PanelTop,
  MessageSquareText,
  ScrollText,
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
  getReplyModeLabel,
} from "../../utils";

const getPreviewText = (value: string, fallback = emptyValueText) =>
  value.trim() || fallback;

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
  const enabledPromptBlockCount = data.prompt.blocks.filter((block) =>
    block.enabled && block.text.trim()
  ).length;
  const progressConfigCount = data.statusDefinitions.length + data.taskDefinitions.length;

  return (
    <div
      className={cn(
        "grid gap-2 sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      <MetricCard
        icon={PanelTop}
        label="当前节点呈现"
        value={activeScene ? getPreviewText(getTavernSceneDisplayTitle(data, activeScene.id)) : "默认场景"}
      />
      <MetricCard
        icon={MessageSquareText}
        label="回复模式"
        value={getReplyModeLabel(data.replyMode ?? "active")}
      />
      <MetricCard
        icon={ScrollText}
        label="启用提示词"
        value={`${enabledPromptBlockCount} 块`}
      />
      <MetricCard
        icon={Activity}
        label="进度配置"
        value={`${progressConfigCount} 项`}
      />
    </div>
  );
};
