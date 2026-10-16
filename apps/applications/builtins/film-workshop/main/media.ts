import type { ApplicationFileClient } from "@mewvis/app-sdk/files";
import type { ChatSnapshot } from "@mewvis/app-sdk/chat";
import {
  newId,
  type FilmProject,
  type FilmMedia,
  type FilmGeneration,
} from "./model";

export function mediaPath(project: FilmProject, media: FilmMedia) {
  if (!project.workspace) throw new Error("请先选择工作目录");
  return `${project.workspace.directory}/${media.path}`;
}
export function relativeMediaPath(project: FilmProject, filePath: string) {
  const root = project.workspace?.directory;
  filePath = filePath.replaceAll("\\", "/");
  if (!root || !filePath.startsWith(root + "/") || /[\0\r\n]/.test(filePath))
    throw new Error("生成文件不在本项目目录中");
  const path = filePath.slice(root.length + 1);
  if (path.split("/").some((part) => !part || part === "." || part === ".."))
    throw new Error("媒体路径无效");
  return path;
}
export async function importMedia(
  project: FilmProject,
  file: File,
  files: ApplicationFileClient,
): Promise<FilmMedia> {
  if (!project.workspace) throw new Error("请先选择工作目录");
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  const kind: FilmMedia["kind"] | undefined =
    /^(png|jpe?g|webp|gif|avif|bmp)$/.test(extension)
      ? "image"
      : /^(mp4|webm|mov)$/.test(extension)
        ? "video"
        : /^(mp3|wav|ogg|m4a)$/.test(extension)
          ? "audio"
          : extension === "pdf"
            ? "pdf"
            : /^(txt|md)$/.test(extension)
              ? "text"
              : undefined;
  if (!kind) throw new Error("请选择图片、视频、音频、PDF 或文本文件");
  if (file.size === 0) throw new Error("不能导入空文件");
  const id = newId(),
    path = `media/${id}.${extension}`;
  const write = await files.beginWrite(
    `${project.workspace.directory}/${path}`,
  );
  try {
    for (let offset = 0; offset < file.size; offset += 64 * 1024)
      await files.writeChunk(
        write,
        offset,
        new Uint8Array(
          await file.slice(offset, offset + 64 * 1024).arrayBuffer(),
        ),
      );
    await files.commitWrite(write);
  } catch (error) {
    await files.abortWrite(write).catch(() => {});
    throw error;
  }
  return {
    id,
    path,
    name: file.name.slice(0, 120),
    kind,
    size: file.size,
    mimeType: file.type,
    source: "imported",
    createdAt: Date.now(),
  };
}
export const generationMarker = (id: string) => `[影视生成:${id}]`;
export function generationResult(
  job: FilmGeneration,
  snapshot: Readonly<ChatSnapshot>,
) {
  const start = snapshot.messages.findIndex(
    (message) =>
      message.role === "user" &&
      message.blocks.some(
        (block) =>
          block.type === "text" &&
          block.content.includes(generationMarker(job.id)),
      ),
  );
  if (start < 0) return null;
  const messages = snapshot.messages.slice(start + 1);
  const next = messages.findIndex((message) => message.role === "user");
  const blocks = (next < 0 ? messages : messages.slice(0, next)).flatMap(
    (message) => (message.role === "assistant" ? message.blocks : []),
  );
  const results = blocks.flatMap((block) =>
    block.type === "tool" &&
    block.name === "generate_media" &&
    block.media?.purpose === "image-generation"
      ? [block.media]
      : [],
  );
  const outputs = [
    ...new Map(
      results
        .flatMap((result) =>
          result.outputs.filter((output) => output.type === "image"),
        )
        .map((output) => [output.filePath, output]),
    ).values(),
  ];
  const execution = snapshot.execution;
  const matchingExecution = execution && job.taskId === execution.taskId;
  const finished =
    next >= 0 ||
    (matchingExecution &&
      ["completed", "cancelled", "failed"].includes(execution.state));
  const failed =
    results.some((result) => result.status === "failed") ||
    (matchingExecution && execution.state === "failed");
  const stopped =
    results.some((result) => result.status === "stopped") ||
    (matchingExecution && execution.state === "cancelled");
  const error =
    results.find((result) => result.error)?.error ||
    (matchingExecution ? snapshot.error : undefined);
  const status: FilmGeneration["status"] = stopped
    ? "stopped"
    : failed
      ? "failed"
      : outputs.length &&
          (finished || results.some((result) => result.status === "completed"))
        ? "completed"
        : finished
          ? "failed"
          : "running";
  return {
    outputs,
    status,
    ...(error
      ? { error }
      : status === "failed"
        ? { error: "本次没有返回可用图片，请查看助手消息后重试。" }
        : {}),
  };
}
export function applyGeneration(
  project: FilmProject,
  id: string,
  status: FilmGeneration["status"],
  outputs: FilmMedia[],
  error?: string,
): FilmProject {
  const job = project.generations?.find((item) => item.id === id);
  if (!job) return project;
  const known = new Map(
    (project.media ?? []).map((media) => [media.path, media]),
  );
  const added: FilmMedia[] = [];
  const ids = outputs.map((output) => {
    const previous = known.get(output.path);
    if (previous) return previous.id;
    known.set(output.path, output);
    added.push(output);
    return output.id;
  });
  const outputIds = [...new Set([...job.outputIds, ...ids])];
  if (
    !added.length &&
    job.status === status &&
    job.error === error &&
    outputIds.length === job.outputIds.length
  )
    return project;
  return {
    ...project,
    media: [...(project.media ?? []), ...added],
    generations: project.generations!.map((item) =>
      item.id === id
        ? {
            ...item,
            status,
            outputIds,
            ...(error ? { error } : { error: undefined }),
          }
        : item,
    ),
    episodes: project.episodes.map((episode) =>
      episode.id !== job.episodeId
        ? episode
        : {
            ...episode,
            shots: episode.shots.map((shot) =>
              shot.id !== job.shotId
                ? shot
                : {
                    ...shot,
                    mediaIds: [...new Set([...(shot.mediaIds ?? []), ...ids])],
                    imageMediaId:
                      shot.imageMediaId === job.previousMediaId && ids.length
                        ? ids[0]
                        : shot.imageMediaId,
                  },
            ),
          },
    ),
  };
}
