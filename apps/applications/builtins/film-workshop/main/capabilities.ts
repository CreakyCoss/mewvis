/** Application-side seams; these are plans, not capabilities advertised by the host. */
export const MEDIA_CAPABILITIES = {
  // TODO(FILM-001): import binary assets, store outside JSON, obtain host-owned resource handles.
  images: {
    available: false,
    label: "图片生成",
    reason: "图片生成尚未接入。可以先完善素材描述和图片提示词。",
  },
  // TODO(FILM-002): connect capability-aware model routing with host-resolved credentials.
  videos: {
    available: false,
    label: "视频生成",
    reason: "视频生成尚未接入。可以先安排镜头时长、运镜和视频提示词。",
  },
  // TODO(FILM-003): persist provider task IDs; recover, cancel, limit concurrency and deduplicate submissions.
  speech: {
    available: false,
    label: "配音生成",
    reason: "配音生成尚未接入。可以先绑定说话角色、台词和音色。",
  },
  // TODO(FILM-004): scoped media preview with stream/range access; keep arbitrary network blocked.
  preview: {
    available: false,
    label: "音视频预览",
    reason: "音视频预览尚未接入。下方时间轴展示制作计划。",
  },
  // TODO(FILM-005): FFmpeg runtime, composition/cancellation and destination-aware file export.
  compose: {
    available: false,
    label: "成片导出",
    reason: "成片合成与导出尚未接入。现在可以复制制作清单或项目 JSON。",
  },
} as const;

// TODO(FILM-006): reusable interactive canvas after entity editors and persistence settle.
// TODO(FILM-007): explicit story-workshop import/export; never read another application's storage.
export interface MediaGenerationRequest {
  projectId: string;
  episodeId: string;
  shotId?: string;
  kind: "image" | "video" | "speech";
  modelId: string;
  prompt: string;
  referenceAssetIds: string[];
}
export interface MediaGenerationGateway {
  submit(request: MediaGenerationRequest): Promise<{ taskId: string }>;
  query(taskId: string): Promise<{
    status: "queued" | "running" | "succeeded" | "failed";
    assetId?: string;
    error?: string;
  }>;
  cancel(taskId: string): Promise<{ upstreamCancelled: boolean }>;
}
