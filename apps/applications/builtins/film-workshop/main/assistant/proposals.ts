import {
  blankAsset,
  blankShot,
  newId,
  validateProject,
  type AssetKind,
  type FilmAsset,
  type FilmProject,
  type FilmShot,
} from "../model";

type AssetFields = Pick<FilmAsset, "name" | "description" | "prompt">;
type ShotFields = Pick<
  FilmShot,
  | "title"
  | "description"
  | "sceneId"
  | "characterIds"
  | "framing"
  | "camera"
  | "duration"
  | "imagePrompt"
  | "videoPrompt"
  | "dialogue"
  | "speakerId"
  | "voice"
  | "sound"
>;
export type AssistantContext = {
  id: string;
  chatId: string;
  episodeId: string;
  project: FilmProject;
  scriptComplete: boolean;
};
export type ProposalChange = {
  id: string;
  targetId: string;
  label: string;
} & (
  | { kind: "script"; before: string; after: string }
  | {
      kind: "asset";
      assetKind: AssetKind;
      create: boolean;
      before: Partial<AssetFields>;
      after: Partial<AssetFields>;
    }
  | {
      kind: "shot";
      create: boolean;
      before: Partial<ShotFields>;
      after: Partial<ShotFields>;
    }
);
export type FilmProposal = {
  format: "mewvis-film-proposal";
  version: 1;
  id: string;
  projectId: string;
  episodeId: string;
  chatId: string;
  title: string;
  createdAt: number;
  changes: ProposalChange[];
};
export const CHANGE_FIELDS: Record<string, string> = {
  name: "名称",
  description: "画面／设定",
  prompt: "素材提示词",
  title: "镜头名称",
  sceneId: "场景",
  characterIds: "出镜角色",
  framing: "景别",
  camera: "运镜",
  duration: "时长（秒）",
  imagePrompt: "图片提示词",
  videoPrompt: "视频提示词",
  dialogue: "台词",
  speakerId: "说话角色",
  voice: "音色",
  sound: "声音设计",
};
const assetFields = ["name", "description", "prompt"] as const;
const shotFields = [
  "title",
  "description",
  "sceneId",
  "characterIds",
  "framing",
  "camera",
  "duration",
  "imagePrompt",
  "videoPrompt",
  "dialogue",
  "speakerId",
  "voice",
  "sound",
] as const;
export const identifier = (value: unknown): string => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))
    throw new Error("建议标识无效");
  return value;
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("建议内容必须为对象");
  return value as Record<string, unknown>;
};
const text = (value: unknown, max = 12000) => {
  if (typeof value !== "string" || value.length > max)
    throw new Error(`建议文字最多 ${max} 字符`);
  return value;
};
const named = (value: unknown) => {
  const name = text(value, 120).trim();
  if (!name) throw new Error("建议名称不能为空");
  return name;
};
const items = (value: unknown, max: number) => {
  if (!Array.isArray(value) || value.length > max)
    throw new Error(`建议最多 ${max} 项`);
  return value;
};
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
function fields(
  value: unknown,
  kind: "asset" | "shot",
): Record<string, string | number | string[]> {
  const input = object(value),
    result: Record<string, string | number | string[]> = {};
  const allowed: readonly string[] =
    kind === "asset" ? assetFields : shotFields;
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new Error("建议包含不支持的编辑字段");
  for (const [key, value] of Object.entries(input)) {
    if (key === "characterIds") {
      result[key] = items(value, 50).map(identifier);
      if (new Set(result[key]).size !== result[key].length)
        throw new Error("角色引用重复");
    } else if (key === "duration") {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0.5 ||
        value > 120
      )
        throw new Error("镜头时长必须在 0.5–120 秒之间");
      result[key] = value;
    } else if (["name", "title", "framing", "camera"].includes(key))
      result[key] = named(value);
    else if (key === "sceneId" || key === "speakerId")
      result[key] = value === "" ? "" : identifier(value);
    else result[key] = text(value, key === "voice" ? 1000 : 12000);
  }
  return result;
}

/** Model inputs contain authored fields only. Entity IDs, media, deletions and order are application-owned. */
export function createProposal(
  input: unknown,
  source: AssistantContext,
): FilmProposal {
  const request = object(input),
    project = validateProject(source.project);
  if (request.contextId !== source.id || request.chatId !== source.chatId)
    throw new Error("创作上下文已变化，请基于当前上下文重新提交建议");
  if (
    Object.keys(request).some(
      (key) =>
        !["contextId", "chatId", "title", "script", "assets", "shots"].includes(
          key,
        ),
    )
  )
    throw new Error("不支持的建议参数");
  const episode = project.episodes.find((item) => item.id === source.episodeId);
  if (!episode) throw new Error("建议对应的分集已不存在");
  const proposalId = newId(),
    changes: ProposalChange[] = [];
  const push = (change: Omit<ProposalChange, "id">) =>
    changes.push({ ...change, id: newId() } as ProposalChange);
  if (request.script !== undefined) {
    if (!source.scriptComplete)
      throw new Error(
        "本轮只提供了剧本摘要，不能据此替换完整剧本；请缩小分集内容后重试",
      );
    const script = text(request.script, 80000);
    if (!script.trim()) throw new Error("剧本建议不能为空；本工具不删除剧本");
    if (script !== episode.script)
      push({
        kind: "script",
        targetId: episode.id,
        label: episode.title,
        before: episode.script,
        after: script,
      } as ProposalChange);
  }
  const assets =
    request.assets === undefined ? [] : items(request.assets, 150).map(object);
  const aliases = new Map<string, string>(),
    assetKinds = new Map(project.assets.map((asset) => [asset.id, asset.kind]));
  for (const asset of assets) {
    const key = identifier(asset.key),
      targetId = asset.id === undefined ? newId() : identifier(asset.id);
    if (aliases.has(key) || (assetKinds.has(key) && key !== targetId))
      throw new Error("素材引用 key 重复或与已有标识冲突");
    if ([...aliases.values()].includes(targetId))
      throw new Error("同一素材不能重复提交");
    const current = project.assets.find((item) => item.id === targetId);
    if (asset.id !== undefined && !current)
      throw new Error("要修改的素材已不存在");
    const kind = asset.kind ?? current?.kind;
    if (kind !== "character" && kind !== "scene" && kind !== "prop")
      throw new Error("新增素材需要指定角色、场景或道具类型");
    if (current && current.kind !== kind)
      throw new Error("不能更改已有素材的类型");
    aliases.set(key, targetId);
    assetKinds.set(targetId, kind);
  }
  for (const asset of assets) {
    if (
      Object.keys(asset).some(
        (key) =>
          !["key", "id", "kind", "name", "description", "prompt"].includes(key),
      )
    )
      throw new Error("素材建议包含不支持的字段");
    const targetId = aliases.get(asset.key as string)!,
      current = project.assets.find((item) => item.id === targetId);
    const authored = Object.fromEntries(
      assetFields
        .filter((key) => asset[key] !== undefined)
        .map((key) => [key, asset[key]]),
    );
    const after = fields(authored, "asset") as Partial<AssetFields>,
      before: Partial<AssetFields> = {};
    if (!current && !after.name) throw new Error("新增素材需要名称");
    for (const key of assetFields)
      if (key in after) {
        if (current && same(current[key], after[key])) delete after[key];
        else if (current) before[key] = current[key];
      }
    if (Object.keys(after).length)
      push({
        kind: "asset",
        targetId,
        label: (authored.name as string) || current?.name || "新素材",
        assetKind: assetKinds.get(targetId)!,
        create: !current,
        before,
        after,
      } as ProposalChange);
  }
  const resolve = (value: unknown, kind: AssetKind) => {
    if (value === "") return "";
    const key = identifier(value),
      id = aliases.get(key) ?? key;
    if (assetKinds.get(id) !== kind)
      throw new Error(
        `镜头引用了不存在或类型不匹配的${kind === "scene" ? "场景" : "角色"}`,
      );
    return id;
  };
  const targeted = new Set<string>();
  for (const shot of request.shots === undefined
    ? []
    : items(request.shots, 200).map(object)) {
    if (
      Object.keys(shot).some(
        (key) =>
          key !== "id" && !(shotFields as readonly string[]).includes(key),
      )
    )
      throw new Error("镜头建议包含不支持的字段");
    const targetId = shot.id === undefined ? newId() : identifier(shot.id);
    if (targeted.has(targetId)) throw new Error("同一镜头不能重复提交");
    targeted.add(targetId);
    const current = episode.shots.find((item) => item.id === targetId);
    if (shot.id !== undefined && !current)
      throw new Error("要修改的镜头不属于当前分集或已不存在");
    const authored = Object.fromEntries(
      shotFields
        .filter((key) => shot[key] !== undefined)
        .map((key) => [key, shot[key]]),
    );
    if (authored.sceneId !== undefined)
      authored.sceneId = resolve(authored.sceneId, "scene");
    if (authored.characterIds !== undefined)
      authored.characterIds = items(authored.characterIds, 50).map((value) =>
        resolve(value, "character"),
      );
    if (authored.speakerId !== undefined)
      authored.speakerId = resolve(authored.speakerId, "character");
    const after = fields(authored, "shot") as Partial<ShotFields>,
      before: Partial<ShotFields> = {};
    if (!current && !after.title) throw new Error("新增镜头需要名称");
    for (const key of shotFields)
      if (key in after) {
        if (current && same(current[key], after[key])) delete after[key];
        else if (current) Object.assign(before, { [key]: current[key] });
      }
    if (Object.keys(after).length)
      push({
        kind: "shot",
        targetId,
        label: (authored.title as string) || current?.title || "新镜头",
        create: !current,
        before,
        after,
      } as ProposalChange);
  }
  if (!changes.length) throw new Error("建议没有包含新的变更");
  const proposal: FilmProposal = {
    format: "mewvis-film-proposal",
    version: 1,
    id: proposalId,
    projectId: project.id,
    episodeId: episode.id,
    chatId: source.chatId,
    title: named(request.title),
    createdAt: Date.now(),
    changes,
  };
  // Validate references, final counts and total size before publishing a proposal.
  applyProposal(
    project,
    proposal,
    changes.map((change) => change.id),
  );
  return proposal;
}

export function validateProposal(value: unknown): FilmProposal {
  const p = object(value);
  if (p.format !== "mewvis-film-proposal" || p.version !== 1)
    throw new Error("不支持的创作建议格式");
  const ids = new Set<string>(),
    targets = new Set<string>();
  const changes = items(p.changes, 351).map((value): ProposalChange => {
    const c = object(value),
      id = identifier(c.id),
      targetId = identifier(c.targetId),
      label = named(c.label);
    if (ids.has(id) || targets.has(`${c.kind}:${targetId}`))
      throw new Error("建议包含重复变更");
    ids.add(id);
    targets.add(`${c.kind}:${targetId}`);
    if (c.kind === "script") {
      const after = text(c.after, 80000);
      if (!after.trim()) throw new Error("剧本建议不能为空");
      return {
        id,
        targetId,
        label,
        kind: "script",
        before: text(c.before, 80000),
        after,
      };
    }
    if (
      (c.kind !== "asset" && c.kind !== "shot") ||
      typeof c.create !== "boolean"
    )
      throw new Error("建议类型无效");
    const before = fields(c.before, c.kind),
      after = fields(c.after, c.kind);
    if (
      !Object.keys(after).length ||
      (c.create
        ? Object.keys(before).length
        : !same(Object.keys(before).sort(), Object.keys(after).sort()))
    )
      throw new Error("建议的原始字段无效");
    if (c.kind === "asset") {
      if (
        !["character", "scene", "prop"].includes(c.assetKind as string) ||
        (c.create && !after.name)
      )
        throw new Error("素材建议无效");
      return {
        id,
        targetId,
        label,
        kind: "asset",
        assetKind: c.assetKind as AssetKind,
        create: c.create,
        before,
        after,
      } as ProposalChange;
    }
    if (c.create && !after.title) throw new Error("新增镜头需要名称");
    return {
      id,
      targetId,
      label,
      kind: "shot",
      create: c.create,
      before,
      after,
    } as ProposalChange;
  });
  if (
    !changes.length ||
    typeof p.createdAt !== "number" ||
    !Number.isSafeInteger(p.createdAt) ||
    p.createdAt < 0
  )
    throw new Error("建议记录无效");
  return {
    format: "mewvis-film-proposal",
    version: 1,
    id: identifier(p.id),
    projectId: identifier(p.projectId),
    episodeId: identifier(p.episodeId),
    chatId: identifier(p.chatId),
    title: named(p.title),
    createdAt: p.createdAt,
    changes,
  };
}
export function changeStatus(
  project: FilmProject,
  proposal: FilmProposal,
  change: ProposalChange,
): "ready" | "applied" | "conflict" {
  if (project.appliedAssistantChangeIds?.includes(change.id)) return "applied";
  const episode = project.episodes.find(
    (item) => item.id === proposal.episodeId,
  );
  if (project.id !== proposal.projectId || !episode) return "conflict";
  if (change.kind === "script")
    return change.targetId === episode.id && change.before === episode.script
      ? "ready"
      : "conflict";
  const current =
    change.kind === "asset"
      ? project.assets.find((item) => item.id === change.targetId)
      : episode.shots.find((item) => item.id === change.targetId);
  if (change.create) return current ? "conflict" : "ready";
  if (
    !current ||
    (change.kind === "asset" &&
      (current as FilmAsset).kind !== change.assetKind)
  )
    return "conflict";
  return Object.entries(change.before).every(([key, before]) =>
    same((current as unknown as Record<string, unknown>)[key], before),
  )
    ? "ready"
    : "conflict";
}
export function changeDependencies(
  proposal: FilmProposal,
  change: ProposalChange,
): string[] {
  if (change.kind !== "shot") return [];
  const references = [
    change.after.sceneId,
    change.after.speakerId,
    ...(change.after.characterIds ?? []),
  ];
  return proposal.changes
    .filter(
      (item) =>
        item.kind === "asset" &&
        item.create &&
        references.includes(item.targetId),
    )
    .map((item) => item.id);
}
export function applyProposal(
  project: FilmProject,
  proposal: FilmProposal,
  selected: string[],
): FilmProject {
  if (project.id !== proposal.projectId) throw new Error("建议不属于当前项目");
  const episode = project.episodes.find(
    (item) => item.id === proposal.episodeId,
  );
  if (!episode) throw new Error("建议对应的分集已删除");
  const chosen = new Set(selected);
  if (
    selected.some((id) => !proposal.changes.some((change) => change.id === id))
  )
    throw new Error("选择了不存在的建议");
  const changes = proposal.changes.filter(
    (change) =>
      chosen.has(change.id) &&
      changeStatus(project, proposal, change) !== "applied",
  );
  if (!changes.length) return project;
  for (const change of changes) {
    if (changeStatus(project, proposal, change) === "conflict")
      throw new Error(
        `「${change.label}」在建议生成后已修改或删除，请保留当前内容并重新生成建议`,
      );
    for (const dependency of changeDependencies(proposal, change))
      if (
        !chosen.has(dependency) &&
        !project.appliedAssistantChangeIds?.includes(dependency)
      )
        throw new Error("请同时采用镜头引用的新增素材");
  }
  let next = {
    ...project,
    assets: [...project.assets],
    episodes: project.episodes.map((item) =>
      item.id === episode.id ? { ...item, shots: [...item.shots] } : item,
    ),
  };
  const target = next.episodes.find((item) => item.id === episode.id)!;
  for (const change of changes) {
    if (change.kind === "script") target.script = change.after;
    else if (change.kind === "asset") {
      if (change.create)
        next.assets.push({
          ...blankAsset(change.assetKind),
          ...change.after,
          id: change.targetId,
        });
      else
        next.assets = next.assets.map((item) =>
          item.id === change.targetId ? { ...item, ...change.after } : item,
        );
    } else if (change.create)
      target.shots.push({
        ...blankShot(target.shots.length + 1),
        ...change.after,
        id: change.targetId,
      });
    else
      target.shots = target.shots.map((item) =>
        item.id === change.targetId ? { ...item, ...change.after } : item,
      );
  }
  next = {
    ...next,
    appliedAssistantChangeIds: [
      ...(project.appliedAssistantChangeIds ?? []),
      ...changes.map((change) => change.id),
    ],
  } as FilmProject;
  return validateProject(next);
}
