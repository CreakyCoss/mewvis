import type { MediaComposeInput, MediaJob } from "@mewvis/app-sdk/media";
import {
  newId,
  type FilmEpisode,
  type FilmProject,
  type FilmRender,
  type FilmShot,
} from "../model";
import { mediaPath, relativeMediaPath } from "../media";

export type RenderOptions = {
  resolution: 720 | 1080;
  fps: 24 | 30;
  fit: "contain" | "cover";
  freeze: boolean;
  trimAudio: boolean;
  keepAudio: boolean;
};
export type RenderSelection = Record<
  string,
  { visualId?: string; audioId?: string }
>;
export const defaultRenderOptions: RenderOptions = {
  resolution: 720,
  fps: 24,
  fit: "contain",
  freeze: false,
  trimAudio: false,
  keepAudio: true,
};
export const renderPending = (render: FilmRender) =>
  !["completed", "failed", "cancelled"].includes(render.status);
export function shotSelection(shot: FilmShot, selection: RenderSelection) {
  return {
    visualId:
      selection[shot.id]?.visualId ??
      shot.videoMediaId ??
      shot.imageMediaId ??
      "",
    audioId: selection[shot.id]?.audioId ?? shot.audioMediaId ?? "",
  };
}
export function renderDimensions(
  ratio: FilmProject["aspectRatio"],
  height: number,
) {
  return ratio === "9:16"
    ? { width: height, height: (height * 16) / 9 }
    : ratio === "1:1"
      ? { width: height, height }
      : { width: (height * 16) / 9, height };
}
export function createRender(
  project: FilmProject,
  episode: FilmEpisode,
  mode: FilmRender["mode"],
  options: RenderOptions,
  selection: RenderSelection,
): FilmRender {
  if (!project.workspace) throw new Error("请先选择项目工作目录");
  if (!episode.shots.length) throw new Error("请先添加分镜并选择画面素材");
  if ((project.renders?.length ?? 0) >= 2000)
    throw new Error("合成记录已达上限，请先移除不需要的记录");
  const id = newId();
  const clips = episode.shots.map((shot, index) => {
    const selected = shotSelection(shot, selection);
    const visual = project.media?.find(
      (m) =>
        m.id === selected.visualId &&
        shot.mediaIds?.includes(m.id) &&
        (m.kind === "image" || m.kind === "video"),
    );
    if (!visual)
      throw new Error(`第 ${index + 1} 镜「${shot.title}」缺少画面素材`);
    const audio = selected.audioId
      ? project.media?.find(
          (m) =>
            m.id === selected.audioId &&
            shot.mediaIds?.includes(m.id) &&
            m.kind === "audio",
        )
      : undefined;
    if (selected.audioId && !audio)
      throw new Error(`第 ${index + 1} 镜的配音素材已失效，请重新选择`);
    return {
      visual: { kind: visual.kind as "image" | "video", filePath: visual.path },
      duration: shot.duration,
      fit: options.fit,
      shortVideo: options.freeze ? ("freeze" as const) : ("error" as const),
      sourceAudio: options.keepAudio ? ("keep" as const) : ("mute" as const),
      ...(audio
        ? { audio: { filePath: audio.path, trim: options.trimAudio } }
        : {}),
    };
  });
  return {
    id,
    episodeId: episode.id,
    episodeTitle: episode.title,
    mode,
    status: "preparing",
    createdAt: Date.now(),
    input: {
      clips,
      ...renderDimensions(
        project.aspectRatio,
        mode === "preview" ? 360 : options.resolution,
      ),
      fps: options.fps,
      outputFilePath: `${mode === "preview" ? "previews" : "exports"}/${id}.mp4`,
    },
  };
}
export function renderRequest(
  project: FilmProject,
  render: FilmRender,
): MediaComposeInput {
  const resolve = (path: string) => {
    const absolute = mediaPath(project, { path });
    relativeMediaPath(project, absolute);
    return absolute;
  };
  return {
    ...render.input,
    requestId: render.id,
    outputFilePath: resolve(render.input.outputFilePath),
    clips: render.input.clips.map((clip) => ({
      ...clip,
      visual: { ...clip.visual, filePath: resolve(clip.visual.filePath) },
      ...(clip.audio
        ? { audio: { ...clip.audio, filePath: resolve(clip.audio.filePath) } }
        : {}),
    })),
  };
}
/** Reconcile by pinned task and output path; never replace the current timeline or media choices. */
export function applyRender(
  project: FilmProject,
  id: string,
  job: MediaJob,
): FilmProject {
  const render = project.renders?.find((r) => r.id === id);
  if (!render) return project;
  if (
    (render.jobId && render.jobId !== job.id) ||
    relativeMediaPath(project, job.outputFilePath) !==
      render.input.outputFilePath
  )
    throw new Error("宿主合成任务与当前记录不一致");
  if (
    (!renderPending(render) && job.status !== render.status) ||
    (render.status === "cancelling" &&
      ["queued", "running"].includes(job.status))
  )
    return project;
  if (
    job.status === "completed" &&
    (!job.output ||
      job.output.type !== "file" ||
      !job.output.size ||
      relativeMediaPath(project, job.output.filePath) !==
        render.input.outputFilePath)
  )
    throw new Error("宿主未返回有效的成片文件");
  const error = job.error?.message.slice(0, 4000),
    size = job.output?.size;
  if (
    render.jobId === job.id &&
    render.status === job.status &&
    render.error === error &&
    render.size === size
  )
    return project;
  return {
    ...project,
    renders: project.renders!.map((r) =>
      r.id === id
        ? { ...r, jobId: job.id, status: job.status, error, size }
        : r,
    ),
  };
}
