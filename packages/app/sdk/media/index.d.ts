import type { ApplicationFileInfo } from "../files/index.js";

export type MediaSource = Readonly<{
  filePath: string;
  kind: "image" | "video";
  /** Seconds into the source; images start at zero. */
  start?: number;
}>;
export type MediaClip = Readonly<{
  visual: MediaSource;
  /** Explicit output duration, in seconds. */
  duration: number;
  fit?: "contain" | "cover";
  /** Short videos fail unless holding their final frame is explicitly selected. */
  shortVideo?: "error" | "freeze";
  /** Defaults to mute. A separate audio file replaces the original soundtrack. */
  sourceAudio?: "mute" | "keep";
  audio?: Readonly<{
    filePath: string;
    start?: number;
    volume?: number;
    /** Audio exceeding the clip duration fails unless trimming is explicitly enabled. */
    trim?: boolean;
  }>;
}>;
export type MediaComposeInput = Readonly<{
  clips: readonly MediaClip[];
  /** An absolute path within an authorized data directory or workspace; must not exist. */
  outputFilePath: string;
  width: number;
  height: number;
  fps?: number;
  /** Coalesces retries within this application; reuse with different input is rejected. */
  requestId?: string;
}>;
export type MediaInfo = Readonly<{
  filePath: string;
  size: number;
  duration?: number;
  video?: Readonly<{ codec: string; width: number; height: number }>;
  audio?: Readonly<{ codec: string; sampleRate: number; channels: number }>;
}>;
export type MediaJob = Readonly<{
  id: string;
  status:
    "queued" | "running" | "cancelling" | "completed" | "failed" | "cancelled";
  phase: "queued" | "preparing" | "rendering" | "saving" | "done";
  progress: number;
  createdAt: number;
  updatedAt: number;
  outputFilePath: string;
  output?: ApplicationFileInfo;
  error?: Readonly<{ code: string; message: string }>;
}>;
export type MediaCapabilities = Readonly<{
  available: boolean;
  reason?: string;
  output: Readonly<{ format: "mp4"; videoCodec: "h264"; audioCodec: "aac" }>;
  inputs: Readonly<{
    image: readonly string[];
    video: readonly string[];
    audio: readonly string[];
  }>;
  limits: Readonly<{
    clips: number;
    duration: number;
    width: number;
    height: number;
    fps: number;
  }>;
}>;
export type ApplicationMediaRequest = Readonly<{
  version: 1;
  method: "capabilities" | "probe" | "compose" | "get" | "list" | "cancel";
  params?: Record<string, unknown>;
}>;
export type ApplicationMediaResponse =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } };
export interface ApplicationMediaTransport {
  readonly version: 1;
  request(request: ApplicationMediaRequest): Promise<ApplicationMediaResponse>;
}
export interface ApplicationMediaClient {
  capabilities(): Promise<MediaCapabilities>;
  probe(filePath: string): Promise<MediaInfo>;
  compose(input: MediaComposeInput): Promise<MediaJob>;
  get(id: string): Promise<MediaJob>;
  list(options?: { limit?: number }): Promise<MediaJob[]>;
  cancel(id: string): Promise<MediaJob>;
}
export declare class ApplicationMediaError extends Error {
  readonly code: string;
  constructor(code: string, message: string);
}
export declare function createApplicationMediaClient(
  transport: ApplicationMediaTransport,
): ApplicationMediaClient;
export declare function getApplicationMediaClient(): ApplicationMediaClient;
