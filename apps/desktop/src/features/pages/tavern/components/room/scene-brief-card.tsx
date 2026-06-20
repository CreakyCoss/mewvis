import type { ReactNode } from "react";
import {
  Clapperboard,
  Feather,
  Landmark,
  Scale,
  Swords,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { VisualPresetDefinition } from "@/features/pages/tavern/visual-presets";
import { cn } from "@/lib/utils";

export type SceneBriefCardContent = {
  themeLabel: string;
  title: string;
  sceneTitle: string;
  briefLines: string[];
  description: string;
  mechanism: string;
  goal: string;
  ending: string;
  footerNote?: string;
};

type SceneBriefCardProps = {
  visualPreset: VisualPresetDefinition;
  content: SceneBriefCardContent;
  className?: string;
  sceneSelector?: ReactNode;
  progressSlot?: ReactNode;
};

const SceneBriefItem = ({
  icon: Icon,
  title,
  value,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
}) => (
  <div className="min-w-0 px-3 py-3.5 sm:px-3.5 sm:py-4">
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-current/[0.07] text-current ring-1 ring-current/10">
        <Icon className="size-4 opacity-75" />
      </span>
      <div className="min-w-0 text-[13.5px] font-semibold leading-5 opacity-80">
        {title}
      </div>
    </div>
    <p className="mt-2 whitespace-pre-wrap break-words text-[12.5px] leading-5 opacity-[0.76]">
      {value}
    </p>
  </div>
);

export const SceneBriefCard = ({
  visualPreset,
  content,
  className,
  sceneSelector,
  progressSlot,
}: SceneBriefCardProps) => {
  const items = [
    {
      icon: Landmark,
      title: "场景描述",
      value: content.description,
    },
    {
      icon: Swords,
      title: "推进机制",
      value: content.mechanism,
    },
    {
      icon: Target,
      title: "当前目标",
      value: content.goal,
    },
    {
      icon: Scale,
      title: "结局触发",
      value: content.ending,
    },
  ];

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-xl border px-3 py-3.5 sm:px-3.5 sm:py-4",
        visualPreset.tavern.sceneCard,
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-0.5 sm:px-1">
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold leading-4",
            visualPreset.tavern.sceneBadge,
          )}
        >
          {content.themeLabel}
        </span>
        <h2 className="min-w-0 truncate text-lg font-semibold leading-7 sm:text-xl">
          {content.title}
        </h2>
        <span className="text-sm font-medium opacity-[0.54]">
          {content.sceneTitle}
        </span>
      </div>

      {sceneSelector && (
        <div className="mt-3 grid gap-2 md:hidden">
          <div className="flex items-center gap-1.5">
            <Clapperboard className="size-4 shrink-0 opacity-70" />
            {sceneSelector}
          </div>
        </div>
      )}

      {progressSlot}

      {content.briefLines.length > 0 && (
        <div className="mt-4 space-y-0.5 rounded-lg border border-current/12 bg-current/[0.025] px-3.5 py-3 text-[12.5px] leading-6 shadow-[inset_0_1px_18px_rgba(255,255,255,0.04)] sm:px-4">
          {content.briefLines.map((line) => (
            <p key={line} className="whitespace-pre-wrap">
              {line}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-current/12 bg-current/[0.018]">
        <div className="grid divide-y divide-current/10 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          {items.map((item) => (
            <SceneBriefItem
              key={item.title}
              icon={item.icon}
              title={item.title}
              value={item.value}
            />
          ))}
        </div>
      </div>

      {content.footerNote && (
        <div className="mt-3 flex items-start gap-2 border-t border-current/10 px-0.5 pt-2.5 text-[12.5px] leading-5 opacity-[0.72] sm:px-1">
          <Feather className="mt-0.5 size-4 shrink-0" />
          <p className="whitespace-pre-wrap">{content.footerNote}</p>
        </div>
      )}
    </section>
  );
};
