import { extname } from "node:path";
import { object, onlyKeys, ServiceError } from "../../shared/validation.js";

export const fail = (code: string, message: string, status = 400): never => {
  throw new ServiceError(status, code, message);
};
export const limits = {
  clips: 200,
  duration: 7200,
  width: 3840,
  height: 3840,
  fps: 60,
};
export const formats = {
  image: {
    png: "image2",
    jpg: "image2",
    jpeg: "image2",
    webp: "image2",
    bmp: "image2",
  },
  video: { mp4: "mov", mov: "mov", webm: "matroska", mkv: "matroska" },
  audio: {
    wav: "wav",
    mp3: "mp3",
    m4a: "mov",
    mp4: "mov",
    ogg: "ogg",
    flac: "flac",
  },
} as const;
export type Kind = keyof typeof formats;
export function demuxer(path: string, kind: Kind) {
  const extension = extname(path).slice(1).toLowerCase();
  const value = (formats[kind] as Record<string, string>)[extension];
  if (typeof value !== "string")
    fail(
      "UNSUPPORTED_MEDIA",
      `不支持的${kind === "image" ? "图片" : kind === "video" ? "视频" : "音频"}格式：${extension || "无扩展名"}`,
    );
  return value;
}
export function path(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 4096 ||
    /[\0\r\n]/.test(value)
  )
    fail("INVALID_ARGUMENT", "媒体文件路径无效");
  return value as string;
}
function number(value: unknown, label: string, min: number, max: number) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    fail("INVALID_ARGUMENT", `${label}必须在 ${min}–${max} 之间`);
  return value as number;
}
function choice<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !values.includes(value as T))
    fail("INVALID_ARGUMENT", `${label}无效`);
  return value as T;
}
export function compose(input: unknown) {
  const p = object(input);
  onlyKeys(p, [
    "clips",
    "outputFilePath",
    "width",
    "height",
    "fps",
    "requestId",
  ]);
  const width = number(p.width, "宽度", 16, limits.width),
    height = number(p.height, "高度", 16, limits.height);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width % 2 ||
    height % 2 ||
    width * height > 3840 * 2160
  )
    fail("INVALID_ARGUMENT", "画面尺寸必须为偶数，且不超过 4K 像素数");
  const fps = number(p.fps ?? 24, "帧率", 1, limits.fps);
  if (!Number.isInteger(fps)) fail("INVALID_ARGUMENT", "帧率必须是整数");
  if (
    !Array.isArray(p.clips) ||
    !p.clips.length ||
    p.clips.length > limits.clips
  )
    fail("INVALID_ARGUMENT", `clips 必须包含 1–${limits.clips} 个片段`);
  const clips = (p.clips as unknown[]).map((value) => {
    const c = object(value);
    onlyKeys(c, [
      "visual",
      "duration",
      "fit",
      "shortVideo",
      "sourceAudio",
      "audio",
    ]);
    const v = object(c.visual);
    onlyKeys(v, ["filePath", "kind", "start"]);
    const visual = {
      filePath: path(v.filePath),
      kind: choice(v.kind, ["image", "video"] as const, "画面类型"),
      start: number(v.start ?? 0, "画面起点", 0, limits.duration),
    };
    demuxer(visual.filePath, visual.kind);
    if (visual.kind === "image" && visual.start)
      fail("INVALID_ARGUMENT", "静态图片不支持截取起点");
    let audio:
      | { filePath: string; start: number; volume: number; trim: boolean }
      | undefined;
    if (c.audio !== undefined) {
      const a = object(c.audio);
      onlyKeys(a, ["filePath", "start", "volume", "trim"]);
      if (a.trim !== undefined && typeof a.trim !== "boolean")
        fail("INVALID_ARGUMENT", "audio.trim 必须是布尔值");
      audio = {
        filePath: path(a.filePath),
        start: number(a.start ?? 0, "音频起点", 0, limits.duration),
        volume: number(a.volume ?? 1, "音量", 0, 4),
        trim: a.trim === true,
      };
      demuxer(audio.filePath, "audio");
    }
    return {
      visual,
      duration: number(c.duration, "片段时长", 0.1, 600),
      fit: choice(
        c.fit ?? "contain",
        ["contain", "cover"] as const,
        "画面适配",
      ),
      shortVideo: choice(
        c.shortVideo ?? "error",
        ["error", "freeze"] as const,
        "短视频处理",
      ),
      sourceAudio: choice(
        c.sourceAudio ?? "mute",
        ["mute", "keep"] as const,
        "原声处理",
      ),
      ...(audio ? { audio } : {}),
    };
  });
  if (clips.reduce((sum, clip) => sum + clip.duration, 0) > limits.duration)
    fail("LIMIT_EXCEEDED", "合成总时长超过 2 小时");
  const outputFilePath = path(p.outputFilePath);
  if (extname(outputFilePath).toLowerCase() !== ".mp4")
    fail("INVALID_ARGUMENT", "输出文件必须使用 .mp4 扩展名");
  if (
    clips.some(
      (c) =>
        c.visual.filePath === outputFilePath ||
        c.audio?.filePath === outputFilePath,
    )
  )
    fail("INVALID_ARGUMENT", "输出文件不能覆盖输入素材");
  if (
    p.requestId !== undefined &&
    (typeof p.requestId !== "string" || !/^[\w-]{1,128}$/.test(p.requestId))
  )
    fail("INVALID_ARGUMENT", "requestId 无效");
  return {
    clips,
    outputFilePath,
    width,
    height,
    fps,
    ...(p.requestId ? { requestId: p.requestId as string } : {}),
  };
}
export type ComposeInput = ReturnType<typeof compose>;
export type MediaInfo = {
  filePath: string;
  size: number;
  duration?: number;
  video?: { codec: string; width: number; height: number };
  audio?: { codec: string; sampleRate: number; channels: number };
};
export type MediaJob = {
  id: string;
  status:
    "queued" | "running" | "cancelling" | "completed" | "failed" | "cancelled";
  phase: "queued" | "preparing" | "rendering" | "saving" | "done";
  progress: number;
  createdAt: number;
  updatedAt: number;
  outputFilePath: string;
  output?: {
    filePath: string;
    name: string;
    type: "file";
    size: number;
    modifiedAt: number;
  };
  error?: { code: string; message: string };
};
