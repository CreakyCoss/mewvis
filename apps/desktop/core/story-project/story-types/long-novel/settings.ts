export const LONG_NOVEL_PATHS = {
  "story-manifest": "story/manifest.json",
  "story-book": "story/book.json",
  "story-positioning": "story/positioning.json",
  "story-style": "story/style.json",
  "story-character": "story/characters/{id}.json",
  "story-relationships": "story/relationships.json",
  "story-world-entry": "story/world/{id}.json",
  "story-book-arc": "story/outline/book-arc.json",
  "story-volume": "story/outline/volumes/{id}.json",
  "story-chapter-plan": "story/outline/chapters/{id}.json",
  "story-chapter": "story/tracking/chapter-results/{id}.json",
  "story-chapter-content": "story/chapters/{id}.md",
  "story-character-state": "story/tracking/character-states/{characterId}.json",
  "story-foreshadows": "story/tracking/foreshadows.json",
  "story-timeline": "story/tracking/timeline/{id}.json",
  "story-progress": "story/tracking/progress.json",
  "story-analysis": "story/analysis/{id}.json",
  "story-review": "story/reviews/{id}.json",
  "story-import": "story/imports/{id}.json",
} as const;

export const LONG_NOVEL_ROLES = {
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

export const LONG_NOVEL_CONTEXTS = [
  {
    name: "project-summary",
    label: "故事项目摘要",
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
    label: "章节写作上下文",
    scope: "chapter",
    targetKind: "story-chapter-plan",
    targetSelectors: ["/id", "/number"],
    documentKinds: [
      "story-manifest",
      "story-book",
      "story-positioning",
      "story-style",
      "story-volume",
      "story-chapter-plan",
      "story-chapter",
      "story-chapter-content",
      "story-character",
      "story-character-state",
      "story-world-entry",
      "story-relationships",
      "story-foreshadows",
      "story-progress",
    ],
  },
] as const;

export const LONG_NOVEL_VALIDATION_MODES = {
  draft: {
    label: "增量草稿",
    description: "允许内容未完成，但已存在字段、文档和引用必须合法",
  },
  openBook: {
    label: "开书完成",
    description: "要求核心定位、主角、文风、开篇阶段和分卷达到可写作状态",
  },
  chapterWrite: {
    label: "章节写作",
    description: "要求章节正文与细纲、角色、设定和状态引用一致",
  },
} as const;

export const LONG_NOVEL_RULES = {
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
  "manifest.files": {
    severity: "error",
    label: "清单完整",
    description: "manifest 文件索引必须与正式故事文件完全一致",
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
    description: "分卷和全书阶段范围不得非法重叠",
  },
  "volumes.number": {
    severity: "error",
    label: "卷号唯一",
    description: "分卷编号不得重复",
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
    label: "书名必填",
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
