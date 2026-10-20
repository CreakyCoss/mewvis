import {
  CircleAlert,
  CircleCheck,
  Image,
  Square,
  Video,
  Volume2,
} from "lucide-react";
import type { FilmGeneration, FilmShot } from "../model";
import { useId } from "react";
import { GENERATION_TYPES } from "../media";
import type { ShotEditorProps } from "./index";

export function GenerationControls(
  props: ShotEditorProps & {
    shot: FilmShot;
    purpose: FilmGeneration["purpose"];
  },
) {
  const statusId = useId();
  const { shot, purpose } = props;
  const type = GENERATION_TYPES[purpose];
  const job = props.project.generations
    ?.filter(
      (job) =>
        job.episodeId === props.episode.id &&
        job.shotId === shot.id &&
        job.purpose === purpose,
    )
    .at(-1);
  const running = !!job && ["preparing", "running"].includes(job.status);
  const status =
    job?.status === "completed"
      ? "新版本已保存"
      : job?.status === "failed"
        ? "生成失败"
        : "";
  const StatusIcon = job?.status === "failed" ? CircleAlert : CircleCheck;
  const GenerateIcon =
    purpose === "video-generation"
      ? Video
      : purpose === "speech"
        ? Volume2
        : Image;
  const label = purpose === "video-generation" ? "视频片段" : type.label;
  const canStop = running && !!props.stopGeneration;
  const buttonLabel = running
    ? props.generationStopping
      ? "正在停止…"
      : job.status === "preparing"
        ? "准备生成…"
        : "正在生成…"
    : props.generationBusy
      ? "其他任务进行中"
      : `生成${label}`;
  return (
    <div
      className="film-generation-controls"
      role="group"
      aria-label={`${type.label}生成操作`}
    >
      <div
        className="film-generation-feedback"
        id={statusId}
        role="status"
        aria-atomic="true"
      >
        {status && (
          <span
            className="film-generation-status"
            data-state={job?.status}
            title={job?.status === "failed" ? job.error : undefined}
          >
            <StatusIcon size={12} aria-hidden />
            <span>{status}</span>
          </span>
        )}
      </div>
      <button
        type="button"
        aria-busy={running || props.generationBusy}
        aria-label={
          canStop && !props.generationStopping
            ? `${buttonLabel}，点击停止生成`
            : undefined
        }
        title={
          canStop && !props.generationStopping ? "点击停止生成" : undefined
        }
        aria-describedby={status ? statusId : undefined}
        className={`film-generation-trigger${canStop ? " film-generation-stop" : " film-primary"}`}
        disabled={
          canStop
            ? props.generationStarting || props.generationStopping
            : !props.generate ||
              !props.project.workspace ||
              running ||
              props.generationBusy
        }
        onClick={() => {
          if (canStop) void props.stopGeneration?.(job?.id);
          else void props.generate?.(props.episode.id, shot.id, purpose);
        }}
      >
        {canStop ? (
          <Square size={13} aria-hidden />
        ) : (
          <GenerateIcon size={15} aria-hidden />
        )}
        {buttonLabel}
      </button>
    </div>
  );
}
