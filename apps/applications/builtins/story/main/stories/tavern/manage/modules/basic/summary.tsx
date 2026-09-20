import { MessageSquareText, PanelTop, ScrollText, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "design-system/lib/utils";
import { getVisualPreset } from "../../../presets/visual-presets";
import { getTavernRoomStyle } from "../../../presets/prompts/room-styles";
import type { TavernRoomConfig } from "@/stories/tavern/manage/model";
import { getReplyModeLabel } from "../../utils";

const MetricCard = ({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) => (
  <div className="app-panel rounded-xl px-3 py-2.5">
    <div className="truncate text-xs font-medium leading-5 text-muted-foreground">{label}</div>
    <div className="mt-3 flex min-w-0 items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 truncate text-sm font-semibold leading-5" title={value}>
        {value}
      </div>
    </div>
  </div>
);

export const BasicSummaryContent = ({ data, className }: { data: TavernRoomConfig; className?: string }) => {
  const visualPreset = getVisualPreset(data.scenePresetId);
  const roomStyle = getTavernRoomStyle(data.roomStyleId);

  return (
    <div className={cn("grid gap-2 sm:grid-cols-2 xl:grid-cols-4", className)}>
      <MetricCard icon={PanelTop} label="默认视觉" value={visualPreset.label} />
      <MetricCard icon={MessageSquareText} label="回复模式" value={getReplyModeLabel(data.replyMode ?? "director")} />
      <MetricCard icon={ScrollText} label="房间文风" value={roomStyle.label} />
      <MetricCard icon={UsersRound} label="导演人数" value={`${data.settings.directorMaxSpeakers} 人`} />
    </div>
  );
};
