import type { ApplicationFileClient } from "@mewvis/app-sdk/files";
import type { ChatSnapshot } from "@mewvis/app-sdk/chat";
import {
  newId,
  type FilmProject,
  type FilmMedia,
  type FilmGeneration,
  type FilmEpisode,
  type FilmShot,
} from "./model";

export const GENERATION_TYPES = {
  "image-generation": {
    kind: "image",
    field: "imageMediaId",
    label: "分镜图片",
    step: "storyboard",
  },
  "video-generation": {
    kind: "video",
    field: "videoMediaId",
    label: "镜头视频",
    step: "video",
  },
  speech: {
    kind: "audio",
    field: "audioMediaId",
    label: "角色配音",
    step: "dubbing",
  },
} as const;
export const generationType = (job: Pick<FilmGeneration, "purpose">) =>
  GENERATION_TYPES[job.purpose ?? "image-generation"];
export function generationPrompt(
  shot: FilmShot,
  purpose: FilmGeneration["purpose"],
) {
  return purpose === "speech"
    ? shot.dialogue.trim()
    : purpose === "video-generation"
      ? shot.videoPrompt.trim() || shot.description.trim()
      : shot.imagePrompt.trim() || shot.description.trim();
}
export function generationMessage(
  project: FilmProject,
  episode: FilmEpisode,
  shot: FilmShot,
  job: FilmGeneration,
) {
  const type = generationType(job);
  const firstFrame = project.media?.find(
    (media) => media.id === shot.imageMediaId && media.kind === "image",
  );
  const speaker = project.assets.find((asset) => asset.id === shot.speakerId);
  const details = {
    projectId: project.id,
    episodeId: episode.id,
    shotId: shot.id,
    purpose: job.purpose,
    prompt: job.prompt,
    style: project.style,
    aspectRatio: project.aspectRatio,
    ...(job.purpose === "video-generation"
      ? {
          duration: shot.duration,
          camera: shot.camera,
          ...(firstFrame ? { firstFrame: mediaPath(project, firstFrame) } : {}),
        }
      : {}),
    ...(job.purpose === "speech"
      ? {
          text: job.prompt,
          speaker: speaker?.name,
          voice: shot.voice,
          sound: shot.sound,
        }
      : {}),
    ...(job.purpose === "image-generation"
      ? {
          references: project.assets
            .filter(
              (asset) =>
                asset.id === shot.sceneId ||
                shot.characterIds.includes(asset.id),
            )
            .map((asset) => ({
              name: asset.name,
              description: asset.description,
              files: (asset.mediaIds ?? []).flatMap((id) => {
                const media = project.media?.find(
                  (item) => item.id === id && item.kind === "image",
                );
                return media ? [mediaPath(project, media)] : [];
              }),
            })),
        }
      : {}),
    outputDirectory: `${project.workspace!.directory}/generated/${job.id}`,
  };
  const instruction =
    job.purpose === "speech"
      ? "台词必须原样朗读，不添加旁白或说明。按音色要求映射当前用途支持的音色参数；音色备注不是供应商音色 ID，不得直接当作 voice_id。声音设计只作为配音指导，不调用视频或其他用途，不合成背景音乐。"
      : job.purpose === "video-generation"
        ? '有 firstFrame 时使用该本地图片，通过 generate_media 的 files 数组绑定到 Schema 对应的图片字段，例如 [{"pointer":"/image","filePath":"首帧绝对路径"}]；字段名以实际 Schema 为准。当前用途不支持该图片时说明原因并停止，不得擅自丢弃首帧。无首帧时按文生视频生成。按 Schema 设置时长和画幅，不编造不支持的参数；数值参数使用 JSON 数字。镜头时长不在支持范围内时，说明支持的时长并请用户调整后再生成，不得取最接近的值或自行改写时长。'
        : "结合画面比例与视觉风格生成分镜图片；参考文件只在当前用途支持时使用。";
  return {
    blocks: [
      {
        type: "text" as const,
        content: `为「${shot.title}」生成${type.label}。\n${job.prompt}\n${generationMarker(job.id)}`,
      },
    ],
    text: `为镜头「${shot.title}」生成${type.label}。\n${generationMarker(job.id)}\n先查询 generate_media 的 ${job.purpose} 用途，严格按其 Schema 组合输入和可覆盖参数，只调用一次生成，必须使用下面的 outputDirectory。不要用文字建议代替实际生成，不切换模型或用途；配置不支持时明确说明并停止。失败或停止后不要自动重试。${instruction}\n${JSON.stringify(details, null, 2)}`,
  };
}

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
    block.media?.purpose === (job.purpose ?? "image-generation")
      ? [block.media]
      : [],
  );
  const outputs = [
    ...new Map(
      results
        .flatMap((result) =>
          result.outputs.filter(
            (output) => output.type === generationType(job).kind,
          ),
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
        ? {
            error: `本次没有返回可用${generationType(job).label}，请查看助手消息后重试。`,
          }
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
  const type = generationType(job);
  outputs = outputs.filter((output) => output.kind === type.kind);
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
                    [type.field]:
                      shot[type.field] === job.previousMediaId && ids.length
                        ? ids[0]
                        : shot[type.field],
                  },
            ),
          },
    ),
  };
}
