import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { envName } from "@mewvis/product-config";
import {
  demuxer,
  fail,
  formats,
  limits,
  type ComposeInput,
  type Kind,
  type MediaInfo,
} from "./schema.js";

/** Fixed commands and generated filters only. Callers cannot supply flags, URLs or filter expressions. */
export class MediaEngine {
  private ffmpeg: string;
  private ffprobe: string;
  constructor(private env: NodeJS.ProcessEnv = process.env) {
    this.ffmpeg = env[envName("FFMPEG_PATH")] || "ffmpeg";
    this.ffprobe = env[envName("FFPROBE_PATH")] || "ffprobe";
  }
  private run(
    binary: string,
    args: string[],
    signal: AbortSignal,
    progress?: (seconds: number) => void,
  ) {
    signal.throwIfAborted();
    return new Promise<string>((resolve, reject) => {
      const child = spawn(binary, args, {
        env: this.env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      });
      let stdout = "",
        stderr = "",
        partial = "",
        settled = false,
        forcedError: Error | undefined;
      let killer: ReturnType<typeof setTimeout> | undefined;
      const stop = () => {
        child.kill("SIGTERM");
        killer ??= setTimeout(() => child.kill("SIGKILL"), 2000);
        killer.unref();
      };
      const timeout = setTimeout(stop, progress ? 6 * 60 * 60_000 : 30_000);
      timeout.unref();
      signal.addEventListener("abort", stop, { once: true });
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (killer) clearTimeout(killer);
        signal.removeEventListener("abort", stop);
        if (error) reject(error);
        else resolve(stdout);
      };
      child.stdout.on("data", (chunk: Buffer) => {
        if (!progress) {
          stdout += chunk.toString();
          if (stdout.length > 2 * 1024 * 1024) {
            forcedError = new Error("媒体工具响应过大");
            stdout = "";
            stop();
          }
        } else {
          partial += chunk.toString();
          const lines = partial.split(/\r?\n/);
          partial = lines.pop()!.slice(-1024);
          for (const line of lines) {
            const match = /^out_time_(?:us|ms)=(\d+)$/.exec(line);
            if (match) progress(Number(match[1]) / 1_000_000);
          }
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk).slice(-4096);
      });
      child.on("error", (error: NodeJS.ErrnoException) =>
        finish(
          new Error(
            error.code === "ENOENT"
              ? "未找到 FFmpeg/FFprobe，请安装或配置宿主媒体工具路径"
              : "媒体工具无法启动",
          ),
        ),
      );
      child.on("close", (code) => {
        if (signal.aborted) finish(new Error("媒体任务已取消"));
        else if (forcedError) finish(forcedError);
        else if (code !== 0)
          finish(
            new Error(stderr.trim().slice(-1500) || "媒体处理进程未正常结束"),
          );
        else finish();
      });
      if (signal.aborted) stop();
    });
  }
  async capabilities(signal = new AbortController().signal) {
    try {
      const [encoders] = await Promise.all([
        this.run(this.ffmpeg, ["-hide_banner", "-encoders"], signal),
        this.run(this.ffprobe, ["-version"], signal),
      ]);
      if (!/\blibx264\b/.test(encoders) || !/\baac\b/.test(encoders))
        throw new Error("FFmpeg 需要提供 libx264 与 AAC 编码器");
      return {
        available: true,
        output: { format: "mp4", videoCodec: "h264", audioCodec: "aac" },
        inputs: Object.fromEntries(
          Object.entries(formats).map(([kind, values]) => [
            kind,
            Object.keys(values),
          ]),
        ),
        limits,
      };
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : "媒体工具不可用",
        output: { format: "mp4", videoCodec: "h264", audioCodec: "aac" },
        inputs: Object.fromEntries(
          Object.entries(formats).map(([kind, values]) => [
            kind,
            Object.keys(values),
          ]),
        ),
        limits,
      };
    }
  }
  private input(filePath: string, kind: Kind) {
    const format = demuxer(filePath, kind);
    return [
      "-protocol_whitelist",
      "file,pipe",
      "-f",
      format,
      ...(format === "mov"
        ? ["-enable_drefs", "0", "-use_absolute_path", "0"]
        : []),
      ...(format === "image2" ? ["-pattern_type", "none"] : []),
    ];
  }
  async probe(
    filePath: string,
    kind: Kind,
    signal: AbortSignal,
  ): Promise<MediaInfo> {
    const raw = await this.run(
      this.ffprobe,
      [
        "-v",
        "error",
        ...this.input(filePath, kind),
        "-show_entries",
        "format=duration:stream=codec_type,codec_name,width,height,sample_rate,channels,duration",
        "-of",
        "json",
        filePath,
      ],
      signal,
    );
    const value = JSON.parse(raw) as {
      format?: { duration?: string };
      streams?: Array<Record<string, unknown>>;
    };
    const video = value.streams?.find((s) => s.codec_type === "video"),
      audio = value.streams?.find((s) => s.codec_type === "audio");
    if (
      (kind === "image" && !video) ||
      (kind === "video" && !video && !audio) ||
      (kind === "audio" && !audio)
    )
      fail("INVALID_MEDIA", "文件内容与指定媒体类型不一致");
    const duration = [
      kind === "audio" ? audio?.duration : video?.duration,
      value.format?.duration,
    ]
      .map(Number)
      .find((seconds) => Number.isFinite(seconds) && seconds > 0);
    return {
      filePath,
      size: (await fs.stat(filePath)).size,
      ...(duration !== undefined ? { duration } : {}),
      ...(video
        ? {
            video: {
              codec: String(video.codec_name ?? ""),
              width: Number(video.width),
              height: Number(video.height),
            },
          }
        : {}),
      ...(audio
        ? {
            audio: {
              codec: String(audio.codec_name ?? ""),
              sampleRate: Number(audio.sample_rate),
              channels: Number(audio.channels),
            },
          }
        : {}),
    };
  }
  async render(
    input: ComposeInput,
    directory: string,
    sources: Map<string, { path: string; info: MediaInfo }>,
    signal: AbortSignal,
    progress: (value: number) => void,
  ) {
    const total = input.clips.reduce((sum, clip) => sum + clip.duration, 0);
    let elapsed = 0;
    for (const [index, clip] of input.clips.entries()) {
      signal.throwIfAborted();
      const source = sources.get(
        `${clip.visual.kind}:${clip.visual.filePath}`,
      )!;
      const remaining = (source.info.duration ?? 0) - clip.visual.start;
      if (
        clip.visual.kind === "video" &&
        (remaining <= 0 ||
          (remaining + 0.05 < clip.duration && clip.shortVideo !== "freeze"))
      )
        fail(
          "DURATION_MISMATCH",
          `第 ${index + 1} 个视频不足 ${clip.duration} 秒，请调整时长或明确选择定格末帧`,
        );
      const args = [
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-threads",
        "2",
        "-filter_complex_threads",
        "2",
        ...this.input(source.path, clip.visual.kind),
      ];
      if (clip.visual.kind === "image") args.push("-loop", "1");
      else if (clip.visual.start) args.push("-ss", String(clip.visual.start));
      args.push("-i", source.path);
      let audioStream = "1:a:0",
        volume = 1;
      if (clip.audio) {
        const audio = sources.get(`audio:${clip.audio.filePath}`)!;
        const remainingAudio = (audio.info.duration ?? 0) - clip.audio.start;
        if (
          remainingAudio <= 0 ||
          (!clip.audio.trim && remainingAudio > clip.duration + 0.05)
        )
          fail(
            "DURATION_MISMATCH",
            `第 ${index + 1} 个音频与片段时长不匹配，请调整时长或明确允许裁剪`,
          );
        args.push(...this.input(audio.path, "audio"));
        if (clip.audio.start) args.push("-ss", String(clip.audio.start));
        args.push("-i", audio.path);
        volume = clip.audio.volume;
      } else if (
        clip.sourceAudio === "keep" &&
        clip.visual.kind === "video" &&
        source.info.audio
      )
        audioStream = "0:a:0";
      else args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
      const scale =
        clip.fit === "cover"
          ? `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height}`
          : `scale=${input.width}:${input.height}:force_original_aspect_ratio=decrease,pad=${input.width}:${input.height}:(ow-iw)/2:(oh-ih)/2`;
      const freeze =
        clip.visual.kind === "video" && remaining < clip.duration
          ? `tpad=stop_mode=clone:stop_duration=${clip.duration},`
          : "";
      const filter = `[0:v:0]${freeze}trim=duration=${clip.duration},setpts=PTS-STARTPTS,${scale},setsar=1,fps=${input.fps},format=yuv420p[v];[${audioStream}]atrim=duration=${clip.duration},asetpts=PTS-STARTPTS,volume=${volume},aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${clip.duration}[a]`;
      args.push(
        "-filter_complex",
        filter,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-threads",
        "2",
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-t",
        String(clip.duration),
        "-map_metadata",
        "-1",
        "-progress",
        "pipe:1",
        "-nostats",
        "-n",
        join(directory, `segment-${index}.mp4`),
      );
      await this.run(this.ffmpeg, args, signal, (seconds) =>
        progress(
          Math.min(
            0.95,
            ((elapsed + Math.min(seconds, clip.duration)) / total) * 0.95,
          ),
        ),
      );
      elapsed += clip.duration;
    }
    const manifest = join(directory, "concat.txt"),
      output = join(directory, "result.mp4");
    await fs.writeFile(
      manifest,
      input.clips.map((_, index) => `file 'segment-${index}.mp4'`).join("\n"),
      { flag: "wx", mode: 0o600 },
    );
    await this.run(
      this.ffmpeg,
      [
        "-hide_banner",
        "-nostdin",
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-f",
        "concat",
        "-safe",
        "1",
        "-i",
        manifest,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        "-map_metadata",
        "-1",
        "-n",
        output,
      ],
      signal,
    );
    const verified = await this.probe(output, "video", signal);
    if (
      !verified.size ||
      !verified.video ||
      !verified.audio ||
      !verified.duration
    )
      fail("INVALID_MEDIA", "成片校验未通过");
    progress(1);
    return output;
  }
}
