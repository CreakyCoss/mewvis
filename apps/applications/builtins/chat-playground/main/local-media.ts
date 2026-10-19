import type { ApplicationFileClient } from "@mewvis/app-sdk/files";
import type {
  MediaCapabilities,
  MediaComposeInput,
  MediaInfo,
  MediaJob,
} from "@mewvis/app-sdk/media";

export const EXAMPLE_MAX_DURATION = 60;
export const MEDIA_SIZES = [
  { label: "横屏 · 1280 × 720", width: 1280, height: 720 },
  { label: "竖屏 · 720 × 1280", width: 720, height: 1280 },
  { label: "小尺寸 · 640 × 360", width: 640, height: 360 },
];
export type MediaKind = keyof MediaCapabilities["inputs"];
export const mediaExtension = (path: string) =>
  path.split(/[\\/]/).at(-1)?.split(".").at(-1)?.toLowerCase() ?? "";
export const supportsMedia = (
  capabilities: MediaCapabilities,
  kind: MediaKind,
  path: string,
) => capabilities.inputs[kind].includes(mediaExtension(path));
export const isMediaJobActive = (job: MediaJob) =>
  ["queued", "running", "cancelling"].includes(job.status);

/** Polling and explicit actions may finish out of order. Never regress a terminal job. */
export function mergeMediaJobs(current: MediaJob[], incoming: MediaJob[]) {
  const jobs = new Map(current.map((job) => [job.id, job]));
  for (const job of incoming) {
    const previous = jobs.get(job.id);
    if (
      !previous ||
      (job.updatedAt >= previous.updatedAt &&
        (isMediaJobActive(previous) || !isMediaJobActive(job)) &&
        !(
          previous.status === "cancelling" &&
          isMediaJobActive(job) &&
          job.status !== "cancelling"
        ))
    )
      jobs.set(job.id, job);
  }
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** A streamed copy, with the same per-file limit as the local media service. */
export async function importLocalMedia(
  files: Pick<
    ApplicationFileClient,
    "beginWrite" | "writeChunk" | "commitWrite" | "abortWrite"
  >,
  dataPath: string,
  file: File,
  capabilities: MediaCapabilities,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (!capabilities.available)
    throw new Error(capabilities.reason || "本地媒体处理不可用。");
  if (!file.size || file.size > 16 * 1024 ** 3)
    throw new Error("请选择非空且不超过 16 GiB 的媒体文件。");
  if (
    !Object.keys(capabilities.inputs).some((kind) =>
      supportsMedia(capabilities, kind as MediaKind, file.name),
    )
  )
    throw new Error("该文件扩展名不在宿主支持的媒体格式中。");
  const extension = mediaExtension(file.name);
  const name =
    file.name
      .replace(/\.[^.]*$/, "")
      .replace(/[\\/<>:"|?*\x00-\x1f]/g, "_")
      .replace(/[. ]+$/g, "")
      .slice(0, 100) || "media";
  const filePath = `${dataPath.replace(/[\\/]+$/, "")}/local-media/inputs/${crypto.randomUUID()}/${name}.${extension}`;
  const id = await files.beginWrite(filePath);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    signal.throwIfAborted();
    reader = file.stream().getReader();
    let offset = 0;
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      for (let start = 0; start < value.length; start += 64 * 1024) {
        signal.throwIfAborted();
        const chunk = value.subarray(start, start + 64 * 1024);
        await files.writeChunk(id, offset, chunk);
        offset += chunk.length;
      }
    }
    if (offset !== file.size)
      throw new Error("媒体文件读取不完整，请重新导入。");
    signal.throwIfAborted();
    const saved = await files.commitWrite(id);
    signal.throwIfAborted();
    return saved;
  } catch (error) {
    await files.abortWrite(id).catch(() => {});
    throw error;
  } finally {
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
}

export function localComposeInput(input: {
  capabilities: MediaCapabilities;
  dataPath: string;
  image: MediaInfo;
  audio?: MediaInfo;
  duration: number;
  width: number;
  height: number;
  fit: "contain" | "cover";
  trimAudio: boolean;
  requestId: string;
}): MediaComposeInput {
  const { capabilities, image, audio, duration, width, height } = input;
  if (!capabilities.available)
    throw new Error(capabilities.reason || "本地媒体处理不可用。");
  if (!supportsMedia(capabilities, "image", image.filePath) || !image.video)
    throw new Error("请先探测并选择一张支持的图片。");
  if (
    !Number.isFinite(duration) ||
    duration < 0.1 ||
    duration > Math.min(EXAMPLE_MAX_DURATION, capabilities.limits.duration)
  )
    throw new Error("请输入示例允许范围内的时长。");
  if (
    !MEDIA_SIZES.some(
      (size) => size.width === width && size.height === height,
    ) ||
    width > capabilities.limits.width ||
    height > capabilities.limits.height
  )
    throw new Error("请选择宿主支持的画面尺寸。");
  if (audio) {
    if (!supportsMedia(capabilities, "audio", audio.filePath) || !audio.audio)
      throw new Error("请先探测并选择支持的配音文件。");
    if (audio.duration && audio.duration > duration + 0.05 && !input.trimAudio)
      throw new Error("配音长于视频，请增加时长或勾选裁剪配音。");
  }
  return {
    requestId: input.requestId,
    outputFilePath: `${input.dataPath.replace(/[\\/]+$/, "")}/local-media/outputs/${input.requestId}/movie.mp4`,
    width,
    height,
    fps: Math.min(24, capabilities.limits.fps),
    clips: [
      {
        visual: { kind: "image", filePath: image.filePath },
        duration,
        fit: input.fit,
        ...(audio
          ? { audio: { filePath: audio.filePath, trim: input.trimAudio } }
          : {}),
      },
    ],
  };
}

export const localMediaCode = [
  'import { getApplicationMediaClient } from "@mewvis/app-sdk/media";',
  'import { getApplicationFileClient } from "@mewvis/app-sdk/files";',
  'import { FilePreview } from "@mewvis/app-sdk/files/react";',
  "",
  "// 应用配置需声明 workspace-files；无需模型和 generate_media 授权。",
  "const media = getApplicationMediaClient();",
  "const capability = await media.capabilities();",
  "if (!capability.available) throw new Error(capability.reason);",
  "const files = getApplicationFileClient();",
  "const { dataPath } = await files.roots();",
  "// imagePath、audioPath 必须是应用数据目录或已登记工作区内的文件。",
  "// 外部文件先用 beginWrite / writeChunk / commitWrite 保存副本。",
  "const image = await media.probe(imagePath);",
  "const audio = await media.probe(audioPath);",
  "const requestId = crypto.randomUUID();",
  "const job = await media.compose({",
  "  requestId,",
  "  clips: [{ visual: { kind: 'image', filePath: image.filePath },",
  "    duration: 5, fit: 'contain',",
  "    audio: { filePath: audio.filePath, trim: true } }],",
  "  outputFilePath: `${dataPath}/local-media/outputs/${requestId}/movie.mp4`,",
  "  width: 1280, height: 720, fps: 24,",
  "});",
  "// 定时查询活动任务，终态或页面卸载后停止轮询；恢复页面用 list。",
  "const latest = await media.get(job.id);",
  "const history = await media.list({ limit: 20 });",
  "// 仅由用户点击取消；离开页面不会取消宿主后台任务。",
  "// await media.cancel(job.id);",
  "if (latest.status === 'completed' && latest.output) {",
  "  // 在 React 组件内渲染；卸载时 SDK 释放预览。",
  "  <FilePreview filePath={latest.output.filePath} />;",
  "}",
].join("\n");
