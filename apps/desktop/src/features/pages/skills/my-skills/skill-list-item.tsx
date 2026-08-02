import { Brain, Code2, Globe2, Loader2, Palette, Search, Sparkles, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Skill } from "../types";
import { skillDescriptionPreview } from "./utils";

type SkillListItemProps = {
  skill: Skill;
  disabled: boolean;
  removable: boolean;
  removing: boolean;
  onRemove: (skill: Skill) => void;
};

export const SkillListItem = ({ skill, disabled, removable, removing, onRemove }: SkillListItemProps) => {
  const description = skillDescriptionPreview(skill.description);
  const fullDescription = skill.description.trim() || "暂无描述";
  const actionPinned = removing;
  const actionHoverSpaceClassName = removable ? "group-hover:pr-14 group-focus-within:pr-14" : "";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <article
          tabIndex={0}
          aria-label={`查看 ${skill.name} 详情`}
          onMouseLeave={(event) => {
            const activeElement = document.activeElement;
            if (activeElement instanceof HTMLElement && event.currentTarget.contains(activeElement)) {
              activeElement.blur();
            }
          }}
          className="app-interactive-card group relative grid min-h-[112px] min-w-0 grid-cols-[56px_minmax(0,1fr)] items-center gap-3 rounded-2xl p-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-sidebar-primary/25"
        >
          <div className="flex size-14 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <SkillCardIcon name={skill.name} />
          </div>

          <div
            className={["min-w-0", actionPinned ? "pr-14" : "", actionPinned ? "" : actionHoverSpaceClassName].join(
              " ",
            )}
          >
            <h3 className="min-w-0 truncate text-base font-semibold tracking-normal">{skill.name}</h3>
            <p className="mt-1 line-clamp-2 break-words text-sm leading-5 text-muted-foreground">{description}</p>
          </div>

          {removable && (
            <div
              className={[
                "absolute top-1/2 right-4 flex -translate-y-1/2 items-center gap-2 transition-opacity",
                actionPinned
                  ? "opacity-100"
                  : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
              ].join(" ")}
            >
              <SkillActionIconButton
                label={removing ? "移除中" : "移除"}
                variant="destructive"
                disabled={disabled || removing}
                onClick={() => onRemove(skill)}
                icon={
                  removing ? (
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Trash2 className="size-4" />
                  )
                }
              />
            </div>
          )}
        </article>
      </TooltipTrigger>

      <TooltipContent
        side="top"
        align="start"
        sideOffset={10}
        className="block max-w-sm whitespace-normal p-3 text-left leading-5"
      >
        <div className="space-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">{skill.name}</span>
          </div>
          <p className="whitespace-pre-wrap break-words text-xs text-background/75">{fullDescription}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

type SkillActionIconButtonProps = {
  label: string;
  icon: ReactNode;
  variant: "default" | "secondary" | "destructive";
  disabled: boolean;
  onClick: () => void;
};

const SkillActionIconButton = ({ label, icon, variant, disabled, onClick }: SkillActionIconButtonProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        type="button"
        size="icon"
        variant={variant}
        className="size-9 rounded-full"
        aria-label={label}
        disabled={disabled}
        onClick={(event) => {
          onClick();
          event.currentTarget.blur();
        }}
        onPointerEnter={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onFocus={(event) => event.stopPropagation()}
      >
        {icon}
      </Button>
    </TooltipTrigger>
    <TooltipContent side="top" sideOffset={8}>
      {label}
    </TooltipContent>
  </Tooltip>
);

const SkillCardIcon = ({ name }: { name: string }) => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("design") || lowerName.includes("ui")) {
    return <Palette className="size-7 text-pink-500" />;
  }
  if (lowerName.includes("search") || lowerName.includes("research")) {
    return <Search className="size-7 text-chart-1" />;
  }
  if (lowerName.includes("brain") || lowerName.includes("idea")) {
    return <Brain className="size-7 text-chart-2" />;
  }
  if (lowerName.includes("web") || lowerName.includes("browser")) {
    return <Globe2 className="size-7 text-blue-500" />;
  }
  if (lowerName.includes("code") || lowerName.includes("script")) {
    return <Code2 className="size-7 text-success" />;
  }
  return <Sparkles className="size-7 text-chart-3" />;
};
