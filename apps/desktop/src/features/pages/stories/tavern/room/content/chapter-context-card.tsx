import { BookOpenText, Feather } from "lucide-react";
import type { VisualPresetDefinition } from "@/features/pages/stories/tavern/presets/visual-presets/types";
import { cn } from "@/lib/utils";

export type ChapterContextCardContent = {
  themeLabel: string;
  title: string;
  chapterLabel: string;
  sections: Array<{ id: string; label: string; content: string }>;
  footerNote?: string;
};

export const ChapterContextCard = ({
  visualPreset,
  content,
  className,
}: {
  visualPreset: VisualPresetDefinition;
  content: ChapterContextCardContent;
  className?: string;
}) => (
  <section
    className={cn(
      "relative overflow-hidden rounded-xl border px-2.5 py-2.5 sm:px-3 sm:py-3",
      visualPreset.tavern.sceneCard,
      className,
    )}
  >
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-0.5">
      <span
        className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-4", visualPreset.tavern.sceneBadge)}
      >
        {content.themeLabel}
      </span>
      <h2 className="min-w-0 truncate text-base font-semibold leading-6 sm:text-lg">{content.title}</h2>
      <span className="text-xs font-medium opacity-[0.54]">{content.chapterLabel}</span>
    </div>

    <div className="mt-3 overflow-hidden rounded-lg border border-current/12 bg-current/[0.018]">
      <div className="grid lg:grid-cols-2">
        {content.sections.map((section, index) => (
          <div
            key={section.id}
            className={cn(
              "min-w-0 px-3 py-3",
              index > 0 && "border-t border-current/10",
              index % 2 === 1 && "lg:border-l",
              index > 1 && "lg:border-t",
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-current/[0.07] ring-1 ring-current/10">
                <BookOpenText className="size-3.5 opacity-75" />
              </span>
              <div className="truncate text-[12.5px] font-semibold leading-4 opacity-80">{section.label}</div>
            </div>
            <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap break-words text-[12px] leading-5 opacity-[0.76]">
              {section.content}
            </p>
          </div>
        ))}
      </div>
    </div>

    {content.footerNote ? (
      <div className="mt-2.5 flex items-start gap-2 border-t border-current/10 px-0.5 pt-2 text-[12px] leading-5 opacity-[0.72]">
        <Feather className="mt-0.5 size-3.5 shrink-0" />
        <p className="whitespace-pre-wrap">{content.footerNote}</p>
      </div>
    ) : null}
  </section>
);
