// Flow names adapted from AID Studio's StudioFlowLeftPanel (MIT).
// See THIRD_PARTY_NOTICES.md for the upstream revision and license.
import type { MediaComposeInput, MediaJob } from "@mewvis/app-sdk/media";
export const FLOW_STEPS = [
  { id: "settings", title: "项目设定", description: "方向、风格与画面比例" },
  { id: "script", title: "剧本创作", description: "故事、分集与台词" },
  { id: "assets", title: "素材准备", description: "角色、场景与道具" },
  { id: "storyboard", title: "分镜设计", description: "镜头、画面与提示词" },
  { id: "video", title: "视频生成", description: "镜头片段与生成计划" },
  { id: "dubbing", title: "音画同步", description: "配音、声音与节奏" },
  {
    id: "delivery",
    title: "预览导出",
    description: "合成预览、成片与导出记录",
  },
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

export interface FilmWorkspace {
  id: string;
  root: string;
  directory: string;
}
export interface FilmMedia {
  id: string;
  name: string;
  kind: "image" | "video" | "audio" | "pdf" | "text";
  /** Relative to this project's directory; never a temporary preview URL. */
  path: string;
  size: number;
  mimeType: string;
  source: "imported" | "generated";
  createdAt: number;
}
export interface FilmGeneration {
  id: string;
  purpose: "image-generation" | "video-generation" | "speech";
  episodeId: string;
  shotId: string;
  chatId: string;
  workspaceId: string;
  contextId?: string;
  taskId?: string;
  status: "preparing" | "running" | "completed" | "failed" | "stopped";
  prompt: string;
  /** Selection at submission; prevents auto-selecting a result after the user clears it. */
  previousMediaId?: string;
  outputIds: string[];
  error?: string;
  createdAt: number;
}

export interface FilmAsset {
  id: string;
  kind: AssetKind;
  name: string;
  description: string;
  prompt: string;
  reference: string;
  mediaIds?: string[];
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
  mediaIds?: string[];
  imageMediaId?: string;
  videoMediaId?: string;
  audioMediaId?: string;
}
export interface FilmEpisode {
  id: string;
  title: string;
  script: string;
  shots: FilmShot[];
}
export interface FilmRender {
  id: string;
  episodeId: string;
  episodeTitle: string;
  mode: "preview" | "export";
  status: "preparing" | MediaJob["status"];
  jobId?: string;
  createdAt: number;
  /** Frozen composition snapshot. All paths are relative to the project directory. */
  input: Omit<MediaComposeInput, "requestId">;
  size?: number;
  error?: string;
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
  workspace?: FilmWorkspace;
  media?: FilmMedia[];
  generations?: FilmGeneration[];
  renders?: FilmRender[];
  appliedAssistantChangeIds?: string[];
}
export const MAX_PROJECT_BYTES = 16 * 1024 * 1024;
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
function relativePath(value: unknown): string {
  const path = text(value, "媒体路径", 4096);
  if (
    !path ||
    path.startsWith("/") ||
    /^[a-z]:/i.test(path) ||
    path.includes("\\") ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    /[\0\r\n]/.test(path)
  )
    throw new Error("媒体路径必须位于项目目录中");
  return path;
}
export function checkProjectSize(project: FilmProject): void {
  if (
    new TextEncoder().encode(JSON.stringify(project)).byteLength >
    MAX_PROJECT_BYTES
  )
    throw new Error("项目数据超过 16 MiB，请拆分项目后保存。");
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
  const media =
    p.media === undefined
      ? undefined
      : array(p.media, "媒体文件", 10000).map((item): FilmMedia => {
          const m = object(item, "媒体文件");
          const path = relativePath(m.path);
          return {
            id: id(m.id),
            name: name(m.name, "文件名称"),
            kind: choice(
              m.kind,
              ["image", "video", "audio", "pdf", "text"],
              "媒体类型",
            ),
            path,
            size: timestamp(m.size),
            mimeType: text(m.mimeType, "MIME 类型", 255),
            source: choice(m.source, ["imported", "generated"], "媒体来源"),
            createdAt: timestamp(m.createdAt),
          };
        });
  const mediaIds = (value: unknown) => {
    const values = array(value, "媒体引用", 1000).map((v) =>
      text(v, "媒体标识", 80),
    );
    if (
      new Set(values).size !== values.length ||
      values.some((v) => !media?.some((m) => m.id === v))
    )
      throw new Error("引用了不存在的媒体文件");
    return values;
  };
  const assets = array(p.assets, "素材", 150).map((item): FilmAsset => {
    const a = object(item, "素材");
    return {
      id: id(a.id),
      kind: choice(a.kind, ["character", "scene", "prop"], "素材类型"),
      name: name(a.name, "素材名称"),
      description: text(a.description, "素材描述"),
      prompt: text(a.prompt, "素材提示词"),
      reference: text(a.reference, "素材文件备注", 1000),
      ...(a.mediaIds !== undefined ? { mediaIds: mediaIds(a.mediaIds) } : {}),
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
        ...(s.mediaIds !== undefined ? { mediaIds: mediaIds(s.mediaIds) } : {}),
        ...(s.imageMediaId
          ? { imageMediaId: text(s.imageMediaId, "分镜图片标识", 80) }
          : {}),
        ...(s.videoMediaId
          ? { videoMediaId: text(s.videoMediaId, "镜头视频标识", 80) }
          : {}),
        ...(s.audioMediaId
          ? { audioMediaId: text(s.audioMediaId, "镜头音频标识", 80) }
          : {}),
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
  for (const episode of episodes)
    for (const shot of episode.shots)
      for (const [field, kind] of [
        ["imageMediaId", "image"],
        ["videoMediaId", "video"],
        ["audioMediaId", "audio"],
      ] as const) {
        const selected = shot[field];
        if (
          selected &&
          (!shot.mediaIds?.includes(selected) ||
            !media?.some((m) => m.id === selected && m.kind === kind))
        )
          throw new Error("当前镜头媒体引用无效");
      }
  let workspace: FilmWorkspace | undefined;
  if (p.workspace !== undefined) {
    const w = object(p.workspace, "工作目录");
    const root = text(w.root, "工作区路径", 4096),
      directory = text(w.directory, "项目目录", 4096);
    if (
      !/^(\/|[a-z]:\/)/i.test(root) ||
      root.includes("\\") ||
      directory !==
        root.replace(/[\\/]+$/, "") + "/film-projects/" + projectId ||
      directory.split(/[\\/]/).includes("..") ||
      /[\0\r\n]/.test(directory + root)
    )
      throw new Error("项目工作目录无效");
    const workspaceId = text(w.id, "工作区标识", 256);
    if (!workspaceId.trim()) throw new Error("工作区标识无效");
    workspace = { id: workspaceId, root, directory };
  }
  const generations =
    p.generations === undefined
      ? undefined
      : array(p.generations, "生成记录", 2000).map((item): FilmGeneration => {
          const g = object(item, "生成记录");
          return {
            id: id(g.id),
            // Existing project files contain image jobs without an explicit purpose.
            purpose: choice(
              g.purpose === undefined ? "image-generation" : g.purpose,
              ["image-generation", "video-generation", "speech"],
              "生成用途",
            ),
            episodeId: text(g.episodeId, "分集标识", 80),
            shotId: text(g.shotId, "镜头标识", 80),
            chatId: text(g.chatId, "会话标识", 256),
            workspaceId: text(g.workspaceId, "工作区标识", 256),
            status: choice(
              g.status,
              ["preparing", "running", "completed", "failed", "stopped"],
              "生成状态",
            ),
            prompt: text(g.prompt, "生成提示词", 32000),
            outputIds: mediaIds(g.outputIds),
            createdAt: timestamp(g.createdAt),
            ...(g.contextId
              ? { contextId: text(g.contextId, "生成上下文", 80) }
              : {}),
            ...(g.taskId ? { taskId: text(g.taskId, "任务标识", 256) } : {}),
            ...(g.previousMediaId
              ? { previousMediaId: text(g.previousMediaId, "原媒体标识", 80) }
              : {}),
            ...(g.error ? { error: text(g.error, "生成错误", 4000) } : {}),
          };
        });
  if ((media?.length || generations?.length) && !workspace)
    throw new Error("媒体和生成记录需要项目工作目录");
  if (
    generations?.some(
      (job) => job.workspaceId !== workspace?.id || !job.chatId.trim(),
    )
  )
    throw new Error("生成记录与项目工作区不一致");
  const renders =
    p.renders === undefined
      ? undefined
      : array(p.renders, "合成记录", 2000).map((value): FilmRender => {
          const r = object(value, "合成记录"),
            input = object(r.input, "合成快照");
          const renderId = id(r.id),
            mode = choice(r.mode, ["preview", "export"], "合成用途");
          const width = timestamp(input.width),
            height = timestamp(input.height),
            fps = timestamp(input.fps);
          if (
            width < 16 ||
            height < 16 ||
            width > 3840 ||
            height > 3840 ||
            width % 2 ||
            height % 2 ||
            width * height > 3840 * 2160 ||
            fps < 1 ||
            fps > 60
          )
            throw new Error("合成画面规格无效");
          const clips = array(input.clips, "合成片段", 200).map((value) => {
            const c = object(value, "合成片段"),
              v = object(c.visual, "画面素材");
            if (
              typeof c.duration !== "number" ||
              !Number.isFinite(c.duration) ||
              c.duration < 0.5 ||
              c.duration > 120
            )
              throw new Error("合成片段时长无效");
            let audio;
            if (c.audio !== undefined) {
              const a = object(c.audio, "配音素材");
              if (typeof a.trim !== "boolean")
                throw new Error("配音裁剪配置无效");
              audio = { filePath: relativePath(a.filePath), trim: a.trim };
            }
            return {
              visual: {
                filePath: relativePath(v.filePath),
                kind: choice(v.kind, ["image", "video"], "画面类型"),
              },
              duration: c.duration,
              fit: choice(c.fit, ["contain", "cover"], "画面适配"),
              shortVideo: choice(c.shortVideo, ["error", "freeze"], "视频补足"),
              sourceAudio: choice(c.sourceAudio, ["mute", "keep"], "原声设置"),
              ...(audio ? { audio } : {}),
            };
          });
          if (
            !clips.length ||
            clips.reduce((sum, c) => sum + c.duration, 0) > 7200
          )
            throw new Error("合成总时长无效");
          const outputFilePath = relativePath(input.outputFilePath);
          if (
            outputFilePath !==
            `${mode === "preview" ? "previews" : "exports"}/${renderId}.mp4`
          )
            throw new Error("合成输出路径无效");
          const status = choice(
            r.status,
            [
              "preparing",
              "queued",
              "running",
              "cancelling",
              "completed",
              "failed",
              "cancelled",
            ],
            "合成状态",
          );
          const jobId =
            r.jobId === undefined ? undefined : name(r.jobId, "宿主任务标识");
          if (
            (!["preparing", "failed"].includes(status) && !jobId) ||
            (status === "completed" && (!r.size || typeof r.size !== "number"))
          )
            throw new Error("合成结果记录不完整");
          return {
            id: renderId,
            episodeId: text(r.episodeId, "分集标识", 80),
            episodeTitle: name(r.episodeTitle, "分集名称"),
            mode,
            status,
            createdAt: timestamp(r.createdAt),
            input: { clips, width, height, fps, outputFilePath },
            ...(jobId ? { jobId } : {}),
            ...(r.size !== undefined ? { size: timestamp(r.size) } : {}),
            ...(r.error ? { error: text(r.error, "合成错误", 4000) } : {}),
          };
        });
  if (renders?.length && !workspace)
    throw new Error("合成记录需要项目工作目录");
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
    ...(workspace ? { workspace } : {}),
    ...(media ? { media } : {}),
    ...(generations ? { generations } : {}),
    ...(renders ? { renders } : {}),
    ...(p.appliedAssistantChangeIds !== undefined
      ? {
          appliedAssistantChangeIds: array(
            p.appliedAssistantChangeIds,
            "已采用的助手建议",
            20000,
          ).map((value) => {
            const result = text(value, "建议标识", 80);
            if (!/^[a-zA-Z0-9_-]+$/.test(result))
              throw new Error("建议标识无效");
            return result;
          }),
        }
      : {}),
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
  const copy: FilmProject = {
    ...project,
    id: newId(),
    createdAt: now,
    updatedAt: now,
    assets: project.assets.map((a) => ({
      ...a,
      id: assetIds.get(a.id)!,
      mediaIds: [],
    })),
    episodes: project.episodes.map((e) => ({
      ...e,
      id: newId(),
      shots: e.shots.map((s) => ({
        ...s,
        id: newId(),
        mediaIds: [],
        imageMediaId: undefined,
        videoMediaId: undefined,
        audioMediaId: undefined,
        characterIds: s.characterIds.map((id) => assetIds.get(id)!),
        sceneId: assetIds.get(s.sceneId) ?? "",
        speakerId: assetIds.get(s.speakerId) ?? "",
      })),
    })),
  };
  delete copy.workspace;
  delete copy.media;
  delete copy.generations;
  delete copy.renders;
  delete copy.appliedAssistantChangeIds;
  return copy;
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
  if (step === "video")
    return !episode.shots.length
      ? "empty"
      : episode.shots.every((shot) => shot.videoMediaId)
        ? "ready"
        : "draft";
  if (step === "dubbing") {
    const spoken = episode.shots.filter((shot) => shot.dialogue.trim());
    return !episode.shots.length
      ? "empty"
      : spoken.every((shot) => shot.audioMediaId)
        ? "ready"
        : "draft";
  }
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
      `分镜图片：${project.media?.find((media) => media.id === s.imageMediaId)?.path || "尚未选择"}`,
      `视频提示词：${s.videoPrompt || "待补充"}`,
      `镜头视频：${project.media?.find((media) => media.id === s.videoMediaId)?.path || "尚未选择"}`,
      `台词：${s.dialogue || "无"}`,
      `说话角色：${assetName(s.speakerId)}；音色备注：${s.voice || "未设置"}`,
      `声音设计：${s.sound || "未设置"}`,
      `角色配音：${project.media?.find((media) => media.id === s.audioMediaId)?.path || "尚未选择"}`,
      `文件备注：图片 ${s.imageReference || "无"}；视频 ${s.videoReference || "无"}；音频 ${s.audioReference || "无"}`,
      "",
    ]),
    "## 待完善",
    "",
    ...(report.issues.length
      ? report.issues.map((issue) => `- ${issue}`)
      : ["- 制作计划已准备，可以进入素材生成阶段。"]),
    "- 成片合成与文件导出待接入。",
    "",
  ].join("\n");
}
