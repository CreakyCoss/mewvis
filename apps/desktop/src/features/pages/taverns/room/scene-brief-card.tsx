import type { ReactNode } from "react";
import { Feather, Landmark, Scale, Swords, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { VisualPresetDefinition } from "@/features/pages/taverns/tavern/visual-presets";
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
  hasDivider = false,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  hasDivider?: boolean;
}) => (
  <div
    className={cn(
      "relative min-w-0 px-2.5 py-2.5 sm:px-3 sm:py-3",
      hasDivider &&
        "before:absolute before:left-3 before:right-3 before:top-0 before:h-px before:bg-current/10 before:content-[''] lg:before:bottom-3 lg:before:left-0 lg:before:right-auto lg:before:top-3 lg:before:h-auto lg:before:w-px",
    )}
  >
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-current/[0.07] text-current ring-1 ring-current/10">
        <Icon className="size-3.5 opacity-75" />
      </span>
      <div className="min-w-0 text-[12.5px] font-semibold leading-4 opacity-80">{title}</div>
    </div>
    <p className="mt-1.5 whitespace-pre-wrap break-words text-[12px] leading-5 opacity-[0.76]">{value}</p>
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
        "relative overflow-hidden rounded-xl border px-2.5 py-2.5 sm:px-3 sm:py-3",
        visualPreset.tavern.sceneCard,
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-0.5">
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-4",
            visualPreset.tavern.sceneBadge,
          )}
        >
          {content.themeLabel}
        </span>
        <h2 className="min-w-0 truncate text-base font-semibold leading-6 sm:text-lg">{content.title}</h2>
        <span className="text-xs font-medium opacity-[0.54]">{content.sceneTitle}</span>
      </div>

      {sceneSelector && <div className="mt-2 grid gap-2 md:hidden">{sceneSelector}</div>}

      {progressSlot}

      {content.briefLines.length > 0 && (
        <div className="mt-3 space-y-0.5 rounded-lg border border-current/12 bg-current/[0.025] px-3 py-2.5 text-[12px] leading-5 shadow-[inset_0_1px_18px_rgba(255,255,255,0.04)]">
          {content.briefLines.map((line) => (
            <p key={line} className="whitespace-pre-wrap">
              {line}
            </p>
          ))}
        </div>
      )}

      <div className="mt-3 overflow-hidden rounded-lg border border-current/12 bg-current/[0.018]">
        <div className="grid lg:grid-cols-4">
          {items.map((item, index) => (
            <SceneBriefItem
              key={item.title}
              icon={item.icon}
              title={item.title}
              value={item.value}
              hasDivider={index > 0}
            />
          ))}
        </div>
      </div>

      {content.footerNote && (
        <div className="mt-2.5 flex items-start gap-2 border-t border-current/10 px-0.5 pt-2 text-[12px] leading-5 opacity-[0.72]">
          <Feather className="mt-0.5 size-3.5 shrink-0" />
          <p className="whitespace-pre-wrap">{content.footerNote}</p>
        </div>
      )}
    </section>
  );
};
