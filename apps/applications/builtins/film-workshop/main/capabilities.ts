/** Boundaries of the workshop's media preview and final composition. */
export const MEDIA_CAPABILITIES = {
  preview: {
    reason: "图片、视频和配音可在各自区域预览，下方时间轴展示本集制作计划。",
  },
  compose: {
    reason: "成片合成与导出将在后续接入，现在可以复制制作清单或项目 JSON。",
  },
} as const;
