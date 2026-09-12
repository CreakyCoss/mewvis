import { ArrowLeft, Palette, ScrollText } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TavernRoomConfig } from "@/workbench/pages/stories/tavern/manage/model";
import { emptyValueText } from "./utils";
import { editorHeaderActionButtonClassName } from "./primitives";
import { getVisualPreset } from "../presets/visual-presets";
import { getTavernRoomStyle } from "../presets/prompts/room-styles";

type HeaderProps = {
  data: TavernRoomConfig;
  onBack: () => void;
};

export const Header = ({ data, onBack }: HeaderProps) => {
  const visualPreset = getVisualPreset(data.scenePresetId);
  const roomStyle = getTavernRoomStyle(data.roomStyleId);
  const headerStats: Array<{
    icon: LucideIcon;
    value: number | string;
    label: string;
  }> = [
    {
      icon: Palette,
      value: visualPreset.label,
      label: "视觉预设",
    },
    {
      icon: ScrollText,
      value: roomStyle.label,
      label: "房间文风",
    },
  ];

  return (
    <header className="app-page-header shrink-0 px-5 py-4 lg:px-7">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold leading-7">{data.title.trim() || emptyValueText}</h1>
            </div>
            <p className="line-clamp-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              编辑酒馆呈现、系统叙事和调度策略；故事资产在独立故事页维护。
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 self-start lg:self-auto">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(editorHeaderActionButtonClassName, "h-9 px-3 md:hidden")}
              onClick={onBack}
            >
              <ArrowLeft className="size-3.5" />
              返回故事
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          {headerStats.map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl border bg-card/75 px-3 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-base font-semibold leading-5">{value}</div>
                <div className="truncate text-xs leading-4 text-muted-foreground">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
};
