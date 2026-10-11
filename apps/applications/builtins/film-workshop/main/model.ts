// Flow names adapted from AID Studio's StudioFlowLeftPanel (MIT).
// See THIRD_PARTY_NOTICES.md for the upstream revision and license.
export const FLOW_STEPS = [
  { id: "settings", title: "项目设定", description: "方向、风格与画面比例" },
  { id: "script", title: "剧本创作", description: "故事、分集与台词" },
  { id: "assets", title: "素材准备", description: "角色、场景与道具" },
  { id: "storyboard", title: "分镜设计", description: "镜头、画面与提示词" },
  { id: "video", title: "视频生成", description: "镜头片段与生成计划" },
  { id: "dubbing", title: "音画同步", description: "配音、声音与节奏" },
  { id: "delivery", title: "预览导出", description: "时间轴与制作清单" },
] as const;
export type FlowStep = (typeof FLOW_STEPS)[number]["id"];
export const PROJECT_KINDS = {
  comicDrama: "AI 漫剧",
  shortDrama: "AI 短剧",
  movie: "电影 / 短片",
  comic: "静态漫画",
} as const;
export const ASSET_KINDS = {
  character: "角色",
  scene: "场景",
  prop: "道具",
} as const;
export type ProjectKind = keyof typeof PROJECT_KINDS;
export type AssetKind = keyof typeof ASSET_KINDS;
export type StageStatus = "empty" | "draft" | "ready" | "blocked";

export interface FilmAsset {
  id: string;
  kind: AssetKind;
  name: string;
  description: string;
  prompt: string;
  reference: string;
}
export interface FilmShot {
  id: string;
  title: string;
  description: string;
  sceneId: string;
  characterIds: string[];
  framing: string;
  camera: string;
  duration: number;
  imagePrompt: string;
  videoPrompt: string;
  dialogue: string;
  speakerId: string;
  voice: string;
  sound: string;
  imageReference: string;
  videoReference: string;
  audioReference: string;
}
export interface FilmEpisode {
  id: string;
  title: string;
  script: string;
  shots: FilmShot[];
}
export interface FilmProject {
  format: "mewvis-film-project";
  version: 1;
  id: string;
  title: string;
  kind: ProjectKind;
  aspectRatio: "16:9" | "9:16" | "1:1";
  style: string;
  synopsis: string;
  createdAt: number;
  updatedAt: number;
  assets: FilmAsset[];
  episodes: FilmEpisode[];
}
export const MAX_PROJECT_BYTES = 220 * 1024;
export const newId = () => crypto.randomUUID();
export const blankEpisode = (title = "第 1 集"): FilmEpisode => ({
  id: newId(),
  title,
  script: "",
  shots: [],
});
export const blankAsset = (kind: AssetKind): FilmAsset => ({
  id: newId(),
  kind,
  name: `新${ASSET_KINDS[kind]}`,
  description: "",
  prompt: "",
  reference: "",
});
export const blankShot = (number: number): FilmShot => ({
  id: newId(),
  title: `镜头 ${String(number).padStart(2, "0")}`,
  description: "",
  sceneId: "",
  characterIds: [],
  framing: "中景",
  camera: "固定镜头",
  duration: 5,
  imagePrompt: "",
  videoPrompt: "",
  dialogue: "",
  speakerId: "",
  voice: "",
  sound: "",
  imageReference: "",
  videoReference: "",
  audioReference: "",
});
export function createProject(title: string, kind: ProjectKind): FilmProject {
  const now = Date.now();
  return {
    format: "mewvis-film-project",
    version: 1,
    id: newId(),
    title: title.trim(),
    kind,
    aspectRatio: kind === "shortDrama" ? "9:16" : "16:9",
    style: "",
    synopsis: "",
    createdAt: now,
    updatedAt: now,
    assets: [],
    episodes: [blankEpisode(kind === "movie" ? "正片" : "第 1 集")],
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label}必须是对象`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 12000): string {
  if (typeof value !== "string" || value.length > max)
    throw new Error(`${label}必须是长度不超过 ${max} 的文本`);
  return value;
}
function name(value: unknown, label: string): string {
  const result = text(value, label, 120).trim();
  if (!result) throw new Error(`请填写${label}`);
  return result;
}
function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new Error(`${label}最多包含 ${max} 项`);
  return value;
}
function choice<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !values.includes(value as T))
    throw new Error(`${label}无效`);
  return value as T;
}
function timestamp(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("项目时间无效");
  return value;
}
export function checkProjectSize(project: FilmProject): void {
  if (
    new TextEncoder().encode(JSON.stringify(project)).byteLength >
    MAX_PROJECT_BYTES
  )
    throw new Error(
      "项目超过 220 KiB，请减少剧本或分镜文本后保存。大素材接入后将单独存储。",
    );
}

/** Validate every persisted/imported record; never repair or discard unknown versions. */
export function validateProject(value: unknown): FilmProject {
  const p = object(value, "项目");
  if (p.format !== "mewvis-film-project" || p.version !== 1)
    throw new Error("不支持的影视项目格式或版本");
  const ids = new Set<string>();
  const id = (value: unknown): string => {
    const result = text(value, "标识", 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(result) || ids.has(result))
      throw new Error("项目包含无效或重复标识");
    ids.add(result);
    return result;
  };
  const projectId = id(p.id);
  const assets = array(p.assets, "素材", 150).map((item): FilmAsset => {
    const a = object(item, "素材");
    return {
      id: id(a.id),
      kind: choice(a.kind, ["character", "scene", "prop"], "素材类型"),
      name: name(a.name, "素材名称"),
      description: text(a.description, "素材描述"),
      prompt: text(a.prompt, "素材提示词"),
      reference: text(a.reference, "素材文件备注", 1000),
    };
  });
  const hasAsset = (assetId: string, kind: AssetKind) =>
    !assetId || assets.some((a) => a.id === assetId && a.kind === kind);
  const episodes = array(p.episodes, "分集", 50).map((item): FilmEpisode => {
    const e = object(item, "分集");
    const episodeId = id(e.id);
    const shots = array(e.shots, "分镜", 200).map((item): FilmShot => {
      const s = object(item, "分镜");
      if (
        typeof s.duration !== "number" ||
        !Number.isFinite(s.duration) ||
        s.duration < 0.5 ||
        s.duration > 120
      )
        throw new Error("镜头时长必须在 0.5–120 秒之间");
      const sceneId = text(s.sceneId, "场景标识", 80);
      const speakerId = text(s.speakerId, "说话角色标识", 80);
      const characterIds = array(s.characterIds, "出镜角色", 50).map((v) =>
        text(v, "角色标识", 80),
      );
      if (
        !hasAsset(sceneId, "scene") ||
        !hasAsset(speakerId, "character") ||
        characterIds.some((v) => !v || !hasAsset(v, "character")) ||
        new Set(characterIds).size !== characterIds.length
      )
        throw new Error("镜头引用了不存在或类型不匹配的素材");
      return {
        id: id(s.id),
        title: name(s.title, "镜头名称"),
        description: text(s.description, "镜头内容"),
        sceneId,
        characterIds,
        framing: name(s.framing, "景别"),
        camera: name(s.camera, "运镜"),
        duration: s.duration,
        imagePrompt: text(s.imagePrompt, "图片提示词"),
        videoPrompt: text(s.videoPrompt, "视频提示词"),
        dialogue: text(s.dialogue, "台词"),
        speakerId,
        voice: text(s.voice, "音色备注", 1000),
        sound: text(s.sound, "声音设计"),
        imageReference: text(s.imageReference, "图片文件备注", 1000),
        videoReference: text(s.videoReference, "视频文件备注", 1000),
        audioReference: text(s.audioReference, "音频文件备注", 1000),
      };
    });
    return {
      id: episodeId,
      title: name(e.title, "分集名称"),
      script: text(e.script, "剧本", 80000),
      shots,
    };
  });
  if (!episodes.length) throw new Error("项目至少需要一个分集");
  const result: FilmProject = {
    format: "mewvis-film-project",
    version: 1,
    id: projectId,
    title: name(p.title, "项目名称"),
    kind: choice(
      p.kind,
      ["comicDrama", "shortDrama", "movie", "comic"],
      "创作方向",
    ),
    aspectRatio: choice(p.aspectRatio, ["16:9", "9:16", "1:1"], "画面比例"),
    style: text(p.style, "视觉风格", 1000),
    synopsis: text(p.synopsis, "故事梗概"),
    createdAt: timestamp(p.createdAt),
    updatedAt: timestamp(p.updatedAt),
    assets,
    episodes,
  };
  checkProjectSize(result);
  return result;
}

export function removeAsset(
  project: FilmProject,
  assetId: string,
): FilmProject {
  return {
    ...project,
    assets: project.assets.filter((a) => a.id !== assetId),
    episodes: project.episodes.map((e) => ({
      ...e,
      shots: e.shots.map((s) => ({
        ...s,
        sceneId: s.sceneId === assetId ? "" : s.sceneId,
        speakerId: s.speakerId === assetId ? "" : s.speakerId,
        characterIds: s.characterIds.filter((id) => id !== assetId),
      })),
    })),
  };
}
export function copyProject(source: FilmProject): FilmProject {
  const project = validateProject(source),
    assetIds = new Map(project.assets.map((a) => [a.id, newId()]));
  const now = Date.now();
  return {
    ...project,
    id: newId(),
    createdAt: now,
    updatedAt: now,
    assets: project.assets.map((a) => ({ ...a, id: assetIds.get(a.id)! })),
    episodes: project.episodes.map((e) => ({
      ...e,
      id: newId(),
      shots: e.shots.map((s) => ({
        ...s,
        id: newId(),
        characterIds: s.characterIds.map((id) => assetIds.get(id)!),
        sceneId: assetIds.get(s.sceneId) ?? "",
        speakerId: assetIds.get(s.speakerId) ?? "",
      })),
    })),
  };
}
export function moveShot(
  episode: FilmEpisode,
  shotId: string,
  direction: -1 | 1,
): FilmEpisode {
  const shots = [...episode.shots],
    index = shots.findIndex((s) => s.id === shotId),
    target = index + direction;
  if (index < 0 || target < 0 || target >= shots.length) return episode;
  [shots[index], shots[target]] = [shots[target], shots[index]];
  return { ...episode, shots };
}
export function stageStatus(
  project: FilmProject,
  episode: FilmEpisode,
  step: FlowStep,
): StageStatus {
  if (step === "settings")
    return project.synopsis.trim() && project.style.trim() ? "ready" : "draft";
  if (step === "script") return episode.script.trim() ? "ready" : "empty";
  if (step === "assets")
    return project.assets.length
      ? project.assets.every((a) => a.description.trim())
        ? "ready"
        : "draft"
      : "empty";
  if (step === "storyboard")
    return episode.shots.length
      ? episode.shots.every((s) => s.description.trim() && s.imagePrompt.trim())
        ? "ready"
        : "draft"
      : "empty";
  if (step === "video" || step === "dubbing") return "blocked";
  return episode.shots.length ? "draft" : "empty";
}
export function deliveryReport(project: FilmProject, episode: FilmEpisode) {
  const issues: string[] = [];
  if (!episode.script.trim()) issues.push("本集尚无剧本");
  if (!episode.shots.length) issues.push("本集尚无分镜");
  for (const [index, shot] of episode.shots.entries()) {
    const label = `镜头 ${index + 1}`;
    if (!shot.description.trim()) issues.push(`${label}缺少画面内容`);
    if (!shot.imagePrompt.trim()) issues.push(`${label}缺少图片提示词`);
    if (shot.dialogue.trim() && !shot.speakerId)
      issues.push(`${label}台词尚未绑定角色`);
  }
  return {
    ready: issues.length === 0,
    issues,
    shots: episode.shots.length,
    duration: episode.shots.reduce((sum, s) => sum + s.duration, 0),
    mediaVerified: false as const,
    projectTitle: project.title,
    episodeTitle: episode.title,
  };
}
export function productionManifest(
  project: FilmProject,
  episode: FilmEpisode,
): string {
  const report = deliveryReport(project, episode);
  const assetName = (id: string) =>
    project.assets.find((a) => a.id === id)?.name ?? "未指定";
  return [
    `# ${project.title} · ${episode.title}`,
    "",
    `创作方向：${PROJECT_KINDS[project.kind]} · 画面比例：${project.aspectRatio}`,
    `视觉风格：${project.style || "未设置"}`,
    `预计时长：${report.duration} 秒 · 镜头数：${report.shots}`,
    "",
    "> 本文是制作计划。文件备注未经媒体校验，不代表已生成素材或已完成成片。",
    "",
    "## 剧本",
    "",
    episode.script || "尚未填写",
    "",
    "## 项目素材",
    "",
    ...project.assets.map(
      (a) =>
        `- ${ASSET_KINDS[a.kind]}：${a.name} — ${a.description || "待补充"}`,
    ),
    "",
    "## 镜头清单",
    "",
    ...episode.shots.flatMap((s, index) => [
      `### ${String(index + 1).padStart(2, "0")} · ${s.title}`,
      "",
      `${s.duration} 秒 · ${s.framing} · ${s.camera}`,
      `场景：${assetName(s.sceneId)}；角色：${s.characterIds.map(assetName).join("、") || "未指定"}`,
      "",
      s.description || "画面内容待补充",
      "",
      `图片提示词：${s.imagePrompt || "待补充"}`,
      `视频提示词：${s.videoPrompt || "待补充"}`,
      `台词：${s.dialogue || "无"}`,
      `说话角色：${assetName(s.speakerId)}；音色备注：${s.voice || "未设置"}`,
      `声音设计：${s.sound || "未设置"}`,
      `文件备注：图片 ${s.imageReference || "无"}；视频 ${s.videoReference || "无"}；音频 ${s.audioReference || "无"}`,
      "",
    ]),
    "## 待完善",
    "",
    ...(report.issues.length
      ? report.issues.map((issue) => `- ${issue}`)
      : ["- 制作计划已准备，可以进入素材生成阶段。"]),
    "- 图片、视频、配音生成及媒体预览待接入。",
    "- 成片合成与文件导出待接入。",
    "",
  ].join("\n");
}
