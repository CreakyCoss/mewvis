import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import { ChevronRight } from "lucide-react";
import { resolveAvatar } from "@/assets/avatars";
import { HoverCard, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import type { ResolvedStatusMetric } from "../types";
import { CharacterDetail } from "./detail";
import { CharacterMetricView } from "./status-metric";

const CharacterCardContent = ({
  character,
  isActive,
  metrics,
}: {
  character: TavernCharacter;
  isActive: boolean;
  metrics: ResolvedStatusMetric[];
}) => {
  const avatar = resolveAvatar(character.avatar).src;
  const compactMetrics = metrics.slice(0, 2);

  if (isActive) {
    return (
      <span className="block space-y-3">
        <span className="flex min-w-0 items-center gap-3">
          <img
            src={avatar}
            alt=""
            className="size-12 shrink-0 rounded-lg border border-current/15 bg-current/[0.045] dark:bg-current/[0.065] object-cover shadow-sm"
          />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center">
              <span className="truncate text-sm font-semibold leading-tight">{character.name}</span>
            </span>
            <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-current/65">
              {character.speakingStyle || character.description || "当前默认发言角色"}
            </span>
          </span>
        </span>
        {compactMetrics.length > 0 ? (
          <span className="grid grid-cols-2 gap-2">
            {compactMetrics.map((metric) => (
              <CharacterMetricView key={metric.key} metric={metric} variant="featured" />
            ))}
          </span>
        ) : (
          <span className="block rounded-lg border border-current/10 bg-current/[0.06] dark:bg-current/[0.085] px-3 py-2.5 text-xs text-current/65">
            暂无可见状态
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <img
        src={avatar}
        alt=""
        className="size-10 shrink-0 rounded-lg border border-current/15 bg-current/[0.045] dark:bg-current/[0.065] object-cover shadow-sm"
      />
      <span className="min-w-[3.5rem] max-w-[4.5rem] truncate text-[13px] font-semibold leading-tight">
        {character.name}
      </span>
      <span className="grid min-w-0 flex-1 grid-cols-2 gap-2.5">
        {compactMetrics.length > 0 ? (
          compactMetrics.map((metric) => <CharacterMetricView key={metric.key} metric={metric} />)
        ) : (
          <span className="col-span-2 text-[11px] text-current/65">暂无可见状态</span>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-current/60" />
    </span>
  );
};

export const CharacterStatusRow = ({
  character,
  room,
  isActive,
  disabled,
  memory,
  metrics,
  isBusy,
  isCompacting,
  isRebuilding,
  isExtractingMemory,
  onClick,
  onAddMemory,
  onExtractMemory,
  onCompact,
  onRebuild,
}: {
  character: TavernCharacter;
  room: TavernRoom;
  isActive: boolean;
  disabled: boolean;
  memory: string;
  metrics: ResolvedStatusMetric[];
  isBusy: boolean;
  isCompacting: boolean;
  isRebuilding: boolean;
  isExtractingMemory: boolean;
  onClick: () => void;
  onAddMemory: () => void;
  onExtractMemory: () => void;
  onCompact: () => void;
  onRebuild: () => void;
}) => (
  <HoverCard openDelay={120} closeDelay={120}>
    <HoverCardTrigger asChild>
      <button
        type="button"
        className={cn(
          "w-full min-w-0 rounded-xl border border-current/10 bg-current/[0.055] dark:bg-current/[0.075] p-2.5 text-left text-current shadow-sm transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
          isActive && "border-primary/30 bg-primary/10 ring-1 ring-primary/10",
        )}
        disabled={disabled}
        onClick={onClick}
      >
        <CharacterCardContent character={character} isActive={isActive} metrics={metrics} />
      </button>
    </HoverCardTrigger>
    <CharacterDetail
      character={character}
      room={room}
      memory={memory}
      metrics={metrics}
      isBusy={isBusy}
      isCompacting={isCompacting}
      isRebuilding={isRebuilding}
      isExtractingMemory={isExtractingMemory}
      onAddMemory={onAddMemory}
      onExtractMemory={onExtractMemory}
      onCompact={onCompact}
      onRebuild={onRebuild}
    />
  </HoverCard>
);
