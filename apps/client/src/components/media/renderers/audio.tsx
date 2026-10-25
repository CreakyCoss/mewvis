import { PauseIcon, PlayIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { formatMediaTime } from "../util";

export function AudioRenderer({
  label,
  currentTime = 0,
  duration = 0,
  paused = true,
  disabled = false,
  onToggle,
  onSeek,
  muted = false,
  onMute,
}: {
  label: string;
  currentTime?: number;
  duration?: number;
  paused?: boolean;
  disabled?: boolean;
  onToggle(): void;
  onSeek(seconds: number): void;
  muted?: boolean;
  onMute?(): void;
}) {
  return (
    <div
      data-slot="audio-player"
      aria-label={`${label}播放器`}
      className="flex h-[4.5rem] w-full min-w-0 items-center gap-3 px-4 text-primary"
    >
      <button
        type="button"
        aria-label={paused ? "播放音频" : "暂停音频"}
        disabled={disabled}
        onClick={onToggle}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {paused ? (
          <PlayIcon aria-hidden="true" className="size-4 fill-current" />
        ) : (
          <PauseIcon aria-hidden="true" className="size-4 fill-current" />
        )}
      </button>
      <div className="min-w-0 flex-1 space-y-2">
        <input
          type="range"
          aria-label="音频播放进度"
          className="block h-1.5 w-full min-w-0 cursor-pointer accent-primary disabled:cursor-default"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(currentTime, duration)}
          disabled={disabled || !duration}
          onChange={(event) => onSeek(Number(event.target.value))}
        />
        <div className="flex items-center justify-between text-[11px] leading-none tabular-nums text-muted-foreground">
          <span>{formatMediaTime(currentTime)}</span>
          <span>{formatMediaTime(duration)}</span>
        </div>
      </div>
      {onMute && (
        <button
          type="button"
          aria-label={muted ? "取消音频静音" : "音频静音"}
          aria-pressed={muted}
          disabled={disabled}
          onClick={onMute}
          className="flex size-8 shrink-0 items-center justify-center rounded-md outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {muted ? (
            <VolumeXIcon aria-hidden="true" className="size-4" />
          ) : (
            <Volume2Icon aria-hidden="true" className="size-4" />
          )}
        </button>
      )}
    </div>
  );
}
