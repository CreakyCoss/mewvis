import { MessageSquareText, PanelTop, ScrollText, Settings2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getVisualPreset } from "../../../tavern/visual-presets";
import type { TavernRoom } from "@/features/pages/taverns/manage/model";
import { getReplyModeLabel } from "../../utils";

const MetricCard = ({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) => (
  <div className="rounded-md border bg-background/75 px-3 py-2.5 shadow-xs">
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

export const BasicSummaryContent = ({ data, className }: { data: TavernRoom; className?: string }) => {
  const visualPreset = getVisualPreset(data.scenePresetId);
  const enabledPromptBlockCount = data.prompt.blocks.filter((block) => block.enabled && block.text.trim()).length;
  const interactionRuleCount = data.settings.interactionQualityRuleIds.length;

  return (
    <div className={cn("grid gap-2 sm:grid-cols-2 xl:grid-cols-4", className)}>
      <MetricCard icon={PanelTop} label="默认视觉" value={visualPreset.label} />
      <MetricCard icon={MessageSquareText} label="回复模式" value={getReplyModeLabel(data.replyMode ?? "director")} />
      <MetricCard icon={ScrollText} label="启用提示词" value={`${enabledPromptBlockCount} 块`} />
      <MetricCard icon={Settings2} label="交互规则" value={`${interactionRuleCount} 项`} />
    </div>
  );
};
