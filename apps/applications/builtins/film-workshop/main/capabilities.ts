/** Workshop steps that will be connected after storyboard image generation. */
export const MEDIA_CAPABILITIES = {
  videos: {
    reason:
      "可先安排镜头时长、运镜和视频提示词，工坊的视频生成流程将在后续接入。",
  },
  speech: {
    reason: "可先绑定说话角色、台词和音色，工坊的配音生成流程将在后续接入。",
  },
  preview: {
    reason: "素材和分镜图片可在各自区域预览，下方时间轴展示本集制作计划。",
  },
  compose: {
    reason: "成片合成与导出将在后续接入，现在可以复制制作清单或项目 JSON。",
  },
} as const;
