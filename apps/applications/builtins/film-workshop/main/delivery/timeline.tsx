import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Film,
  Mic,
  Pause,
  Play,
  Video,
} from "lucide-react";
import type { FilmEpisode, FilmMedia, FilmProject } from "../model";
import { FilePreview } from "@mewvis/app-sdk/files/react";
import { mediaPath } from "../media";
import { shotSelection, type RenderSelection } from "./plan";
import { Waveform } from "./waveform";

export const timecode = (seconds: number) => {
  const value = Math.max(0, seconds);
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
};
export function timelineClips(
  project: FilmProject,
  episode: FilmEpisode,
  selection: RenderSelection,
) {
  let start = 0;
  return episode.shots.map((shot, index) => {
    const selected = shotSelection(shot, selection);
    const media =
      project.media?.filter((m) => shot.mediaIds?.includes(m.id)) ?? [];
    const clip = {
      shot,
      index,
      start,
      end: start + shot.duration,
      visual: media.find(
        (m) =>
          m.id === selected.visualId && ["image", "video"].includes(m.kind),
      ),
      audio: media.find((m) => m.id === selected.audioId && m.kind === "audio"),
    };
    start = clip.end;
    return clip;
  });
}
export type TimelineClip = ReturnType<typeof timelineClips>[number];
function Thumbnail({
  project,
  media,
}: {
  project: FilmProject;
  media?: FilmMedia;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="film-timeline-thumbnail" ref={ref}>
      {media && visible ? (
        <FilePreview
          filePath={mediaPath(project, media)}
          mediaControls={false}
        />
      ) : (
        <Video size={22} />
      )}
    </div>
  );
}
export function Timeline({
  project,
  clips,
  selectedId,
  currentTime,
  playing,
  seekable,
  onSelect,
  onSeek,
  onPlay,
}: {
  project: FilmProject;
  clips: TimelineClip[];
  selectedId?: string;
  currentTime: number;
  playing: boolean;
  seekable: boolean;
  onSelect(id: string): void;
  onSeek(seconds: number): void;
  onPlay(): void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const total = clips.at(-1)?.end ?? 0;
  const tick = total <= 30 ? 5 : total <= 120 ? 15 : total <= 600 ? 60 : 300;
  const ticks = Array.from(
    { length: Math.ceil(total / tick) },
    (_, i) => i * tick,
  ).concat(total);
  useEffect(() => {
    if (!seekable || !playing || !scroller.current || !content.current) return;
    const x = (currentTime / total) * content.current.clientWidth;
    const node = scroller.current;
    if (x < node.scrollLeft || x > node.scrollLeft + node.clientWidth - 20)
      node.scrollLeft = Math.max(0, x - node.clientWidth / 3);
  }, [currentTime, total, playing, seekable]);
  const choose = (clip: TimelineClip) => {
    onSelect(clip.shot.id);
    if (seekable) onSeek(clip.start);
  };
  return (
    <section className="film-timeline" aria-label="合成时间轴">
      <header className="film-timeline-toolbar">
        <button
          className="film-icon-button"
          aria-label={playing ? "暂停预览" : "播放预览"}
          disabled={!seekable}
          onClick={onPlay}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <span className="film-timeline-clock">
          {timecode(seekable ? currentTime : 0)}{" "}
          <span>/ {timecode(total)}</span>
        </span>
        <small>
          {clips.length} 个镜头 · {Number(total.toFixed(2))} 秒
        </small>
        <div>
          <button
            className="film-icon-button"
            aria-label="向左查看时间轴"
            onClick={() =>
              scroller.current?.scrollBy({ left: -320, behavior: "smooth" })
            }
          >
            <ChevronLeft size={15} />
          </button>
          <button
            className="film-icon-button"
            aria-label="向右查看时间轴"
            onClick={() =>
              scroller.current?.scrollBy({ left: 320, behavior: "smooth" })
            }
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </header>
      {clips.length ? (
        <div className="film-timeline-tracks">
          <div className="film-timeline-labels">
            <div />
            <span>
              <Film size={15} />
              画面
            </span>
            <span>
              <Mic size={15} />
              配音
            </span>
          </div>
          <div className="film-timeline-scroll" ref={scroller}>
            <div
              className="film-timeline-content"
              ref={content}
              style={{
                minWidth: Math.min(
                  18000,
                  Math.max(420, total * 24, clips.length * 100),
                ),
              }}
            >
              <div className="film-timeline-ruler">
                {ticks.map((value, i) => (
                  <span
                    key={i}
                    style={{ left: `${(value / total) * 100}%` }}
                    className={i === ticks.length - 1 ? "is-last" : ""}
                  >
                    {Number(value.toFixed(1))}s
                  </span>
                ))}
                <input
                  type="range"
                  aria-label="预览播放位置"
                  min={0}
                  max={total}
                  step={0.05}
                  value={seekable ? Math.min(currentTime, total) : 0}
                  disabled={!seekable}
                  onChange={(e) => onSeek(Number(e.target.value))}
                />
              </div>
              <div className="film-timeline-track film-timeline-visuals">
                {clips.map((clip) => (
                  <button
                    key={clip.shot.id}
                    aria-label={`选择第 ${clip.index + 1} 镜 ${clip.shot.title}`}
                    aria-pressed={clip.shot.id === selectedId}
                    style={{ width: `${(clip.shot.duration / total) * 100}%` }}
                    onClick={() => choose(clip)}
                    className={!clip.visual ? "is-empty" : ""}
                  >
                    <Thumbnail project={project} media={clip.visual} />
                    <span>
                      <b>
                        {String(clip.index + 1).padStart(2, "0")}{" "}
                        {clip.shot.title}
                      </b>
                      <small>{clip.shot.duration}秒</small>
                    </span>
                  </button>
                ))}
              </div>
              <div className="film-timeline-track film-timeline-voices">
                {clips.map((clip) => (
                  <button
                    key={clip.shot.id}
                    aria-label={`选择第 ${clip.index + 1} 镜配音`}
                    aria-pressed={clip.shot.id === selectedId}
                    style={{ width: `${(clip.shot.duration / total) * 100}%` }}
                    onClick={() => choose(clip)}
                    className={!clip.audio ? "is-empty" : ""}
                  >
                    {clip.audio ? (
                      <>
                        <span>
                          {String(clip.index + 1).padStart(2, "0")}{" "}
                          {clip.audio.name}
                        </span>
                        <Waveform
                          filePath={mediaPath(project, clip.audio)}
                          revision={`${clip.audio.size}:${clip.audio.createdAt}`}
                          duration={clip.shot.duration}
                        />
                      </>
                    ) : (
                      <small>无独立配音</small>
                    )}
                  </button>
                ))}
              </div>
              {seekable && (
                <div
                  className="film-timeline-playhead"
                  aria-hidden
                  style={
                    {
                      "--playhead": `${Math.min(100, (currentTime / total) * 100)}%`,
                    } as CSSProperties
                  }
                />
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="film-muted">添加分镜并选择画面素材，开始制作本集成片。</p>
      )}
    </section>
  );
}
