import { Palette, ScrollText } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TavernRoomConfig } from "@/stories/tavern/manage/model";
import { emptyValueText } from "./utils";
import { getVisualPreset } from "../presets/visual-presets";
import { getTavernRoomStyle } from "../presets/prompts/room-styles";

type HeaderProps = {
  data: TavernRoomConfig;
};

export const Header = ({ data }: HeaderProps) => {
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
    <header className="app-page-header shrink-0 px-5 py-4 pr-14 lg:px-7 lg:pr-16">
      <div className="flex flex-col gap-3">
        <div className="min-w-0 space-y-1.5">
          <h1 className="truncate text-xl font-semibold leading-7">酒馆设置</h1>
          <p className="line-clamp-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {data.title.trim() || emptyValueText} · 调整酒馆呈现、叙事和运行方式。
          </p>
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
