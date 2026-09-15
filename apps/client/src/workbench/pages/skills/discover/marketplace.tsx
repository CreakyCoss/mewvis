import { Brain, Code2, Download, Globe2, Loader2, Palette, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MarketplaceSkill } from "../types";
import { formatMarketplaceUpdatedAt, formatStars } from "./utils";

type MarketplaceResultProps = {
  skill: MarketplaceSkill;
  installed: boolean;
  installing: boolean;
  actionHidden?: boolean;
  onInstall: () => void;
};

export const MarketplaceResult = ({
  skill,
  installed,
  installing,
  actionHidden = false,
  onInstall,
}: MarketplaceResultProps) => {
  const actionPinned = installing;
  const actionVisibleOnHover = !installed && !actionHidden && !actionPinned;
  const actionLabel = installing ? "添加中" : "添加";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <article
          tabIndex={0}
          aria-label={`查看 ${skill.name} 详情`}
          className="app-interactive-card group relative grid min-h-[104px] min-w-0 grid-cols-[56px_minmax(0,1fr)] items-center gap-3 rounded-2xl p-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-sidebar-primary/25"
        >
          <div className="flex size-14 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <MarketplaceIcon name={skill.name} />
          </div>

          <div
            className={[
              "min-w-0",
              installed ? "pr-[72px]" : "",
              actionPinned ? "pr-24" : "",
              actionVisibleOnHover ? "group-hover:pr-24 group-focus-within:pr-24" : "",
            ].join(" ")}
          >
            <h4 className="truncate text-base font-semibold tracking-normal">{skill.name}</h4>
            <p className="mt-1 line-clamp-1 text-sm leading-5 text-muted-foreground">
              {skill.description || "暂无描述"}
            </p>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="min-w-0 truncate">{skill.author || "未知作者"}</span>
              <span className="text-muted-foreground/40">|</span>
              <span className="shrink-0">{formatStars(skill.stars)}</span>
            </div>
          </div>

          {installed && (
            <span className="pointer-events-none absolute top-3 right-3 z-10 inline-flex h-5 items-center rounded-full bg-success/10 px-2 text-xs font-medium text-success ring-1 ring-success/20">
              已添加
            </span>
          )}

          {!installed && !actionHidden && (
            <Button
              type="button"
              size="sm"
              variant="default"
              className={[
                "absolute top-1/2 right-4 h-9 -translate-y-1/2 rounded-full px-4 transition-opacity",
                actionPinned
                  ? "opacity-100 disabled:opacity-100"
                  : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
              ].join(" ")}
              onClick={onInstall}
              disabled={installing}
            >
              {installing ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Download className="size-4" />
              )}
              <span>{actionLabel}</span>
            </Button>
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
            {installed && <span className="rounded-full bg-background/15 px-2 py-0.5 text-xs">已添加</span>}
          </div>
          <p className="text-xs text-background/75">{skill.description || "暂无描述"}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-background/60">
            <span>{skill.author || "未知作者"}</span>
            <span>{formatStars(skill.stars)}</span>
            <MarketplaceUpdatedAt value={skill.updatedAt} />
          </div>
          <p className="break-all text-xs text-background/60">{skill.githubUrl || skill.skillUrl}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

const MarketplaceUpdatedAt = ({ value }: { value?: string | null }) => {
  const updatedAt = formatMarketplaceUpdatedAt(value);
  return updatedAt ? <span>更新于 {updatedAt}</span> : null;
};

const MarketplaceIcon = ({ name }: { name: string }) => {
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
