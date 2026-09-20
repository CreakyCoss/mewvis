export const SHORT_NOVEL_ROLES = {
  manifest: "story-manifest",
  primary: "story-book",
  positioning: "story-positioning",
  style: "story-style",
  character: "story-character",
  relationships: "story-relationships",
  worldEntry: "story-world-entry",
  bookArc: "story-book-arc",
  volume: "story-volume",
  chapterPlan: "story-chapter-plan",
  chapterResult: "story-chapter",
  chapterContent: "story-chapter-content",
  characterState: "story-character-state",
  foreshadows: "story-foreshadows",
  timeline: "story-timeline",
  progress: "story-progress",
  analysis: "story-analysis",
  review: "story-review",
  import: "story-import",
} as const;

export const SHORT_NOVEL_CONTEXTS = [
  {
    name: "project-summary",
    label: "短篇项目摘要",
    scope: "project",
    documentKinds: [
      "story-manifest",
      "story-book",
      "story-positioning",
      "story-style",
      "story-character",
      "story-world-entry",
      "story-book-arc",
      "story-volume",
      "story-chapter-plan",
      "story-analysis",
      "story-review",
      "story-import",
      "story-progress",
    ],
  },
  {
    name: "chapter-writing",
    label: "短篇写作上下文",
    scope: "chapter",
    targetKind: "story-chapter-plan",
    targetSelectors: ["/id", "/number"],
    documentKinds: [
      "story-manifest",
      "story-book",
      "story-positioning",
      "story-style",
      "story-book-arc",
      "story-volume",
      "story-chapter-plan",
      "story-chapter",
      "story-chapter-content",
      "story-character",
      "story-character-state",
      "story-world-entry",
      "story-relationships",
      "story-foreshadows",
      "story-timeline",
      "story-analysis",
      "story-progress",
    ],
  },
] as const;

export const SHORT_NOVEL_VALIDATION_MODES = {
  draft: {
    label: "增量草稿",
    description: "允许内容未完成，但已存在字段、文档和引用必须合法",
  },
  openBook: {
    label: "短篇开篇完成",
    description: "要求核心定位、主角、文风和开篇阶段达到可写作状态",
  },
  chapterWrite: {
    label: "短篇正文写作",
    description: "要求正文与细纲、角色、设定和状态引用一致",
  },
} as const;

export const SHORT_NOVEL_RULES = {
  "identity.duplicate": {
    severity: "error",
    label: "ID 唯一",
    description: "同类实体和嵌套对象的稳定 ID 不得重复",
  },
  "reference.missing": {
    severity: "error",
    label: "引用存在",
    description: "reference 和 reference-list 必须指向已存在的目标",
  },
  "manifest.title": {
    severity: "error",
    label: "标题同步",
    description: "manifest.title 必须与 story-book.title 一致",
  },
  "range.invalid": {
    severity: "error",
    label: "范围有效",
    description: "起始章节不得晚于结束章节",
  },
  "range.overlap": {
    severity: "error",
    label: "范围不重叠",
    description: "故事阶段和章节范围不得非法重叠",
  },
  "volumes.number": {
    severity: "error",
    label: "分段编号唯一",
    description: "短篇分段编号不得重复",
  },
  "chapters.number": {
    severity: "error",
    label: "章节号唯一",
    description: "章节细纲和正文编号不得重复",
  },
  "chapter.budget": {
    severity: "error",
    label: "字数预算",
    description: "章节节拍预算总和必须满足章节目标范围",
  },
  "foreshadow.resolution": {
    severity: "error",
    label: "伏笔回收完整",
    description: "resolved 状态必须提供实际回收章节和回收结果",
  },
  "book.title": {
    severity: "error",
    label: "篇名必填",
    modes: ["openBook"],
  },
  "book.logline": {
    severity: "error",
    label: "一句话梗概必填",
    modes: ["openBook"],
  },
  "style.tone": {
    severity: "error",
    label: "文风语气必填",
    modes: ["openBook"],
  },
  "opening.protagonist": {
    severity: "error",
    label: "主角完整",
    modes: ["openBook"],
  },
  "opening.stage": {
    severity: "error",
    label: "开篇阶段完整",
    modes: ["openBook"],
  },
} as const;
