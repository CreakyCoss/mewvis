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
      className="flex h-14 w-full min-w-0 items-center gap-3 px-3.5 text-primary"
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
      <input
        type="range"
        aria-label="音频播放进度"
        className="h-1.5 min-w-0 flex-1 cursor-pointer accent-primary disabled:cursor-default"
        min={0}
        max={duration || 1}
        step={0.1}
        value={Math.min(currentTime, duration)}
        disabled={disabled || !duration}
        onChange={(event) => onSeek(Number(event.target.value))}
      />
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
      </span>
      {onMute && (
        <button
          type="button"
          aria-label={muted ? "取消音频静音" : "音频静音"}
          aria-pressed={muted}
          disabled={disabled}
          onClick={onMute}
          className="flex size-7 shrink-0 items-center justify-center rounded-md outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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
