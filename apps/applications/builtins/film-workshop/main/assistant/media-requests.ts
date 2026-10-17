import type {
  ApplicationStorage,
  ApplicationStorageValue,
} from "@mewvis/app-sdk/data";
import { GENERATION_TYPES, generationPrompt } from "../media";
import {
  newId,
  validateProject,
  type FilmGeneration,
  type FilmProject,
} from "../model";
import { identifier, type AssistantContext } from "./proposals";

const prefix = (projectId: string) =>
  `film:media-request:${identifier(projectId)}:`;
type MediaRequest = {
  projectId: string;
  contextId: string;
  attempt: number;
  job: FilmGeneration;
};
const preparing = new Map<string, Promise<FilmGeneration>>();

/** App-owned requests shared by button actions and the assistant tool. Project writes stay with the editor. */
export function createMediaRequestStore(storage: ApplicationStorage) {
  const read = (value: MediaRequest, project: FilmProject) => {
    if (
      value.projectId !== project.id ||
      !value.contextId ||
      value.job.contextId !== value.contextId ||
      !Number.isSafeInteger(value.attempt) ||
      value.attempt < 0 ||
      value.attempt > 10
    )
      throw new Error("媒体任务上下文无效");
    const validated = validateProject({ ...project, generations: [value.job] });
    return validated.generations![0];
  };
  return {
    async prepare(
      source: AssistantContext,
      purpose: FilmGeneration["purpose"],
      shotId?: string,
      prompt?: string,
      attempt = 0,
    ) {
      if (!["image-generation", "video-generation", "speech"].includes(purpose))
        throw new Error("不支持的生成用途");
      if (!Number.isSafeInteger(attempt) || attempt < 0 || attempt > 10)
        throw new Error("无效的生成尝试序号");
      const project = source.project;
      if (!project.workspace)
        throw new Error("请调用 ask_user 提醒用户先选择项目工作目录");
      const episode = project.episodes.find(
        (item) => item.id === source.episodeId,
      );
      const shot = episode?.shots.find(
        (item) => item.id === (shotId ?? source.selectedShotId),
      );
      if (!shot)
        throw new Error(
          "目标镜头不明确，请调用 ask_user 确认本集中的镜头后重试",
        );
      const text = prompt?.trim() || generationPrompt(shot, purpose);
      if (text.length > 32000)
        throw new Error("生成内容过长，请调用 ask_user 确认台词或提示词");
      const base = `${prefix(project.id)}${identifier(source.id)}:${identifier(shot.id)}:${purpose}`;
      if (attempt > 0 && !(await storage.getItem(`${base}:${attempt - 1}`)))
        throw new Error("重试前需要已有任务，并通过 ask_user 获得明确授权");
      const key = `${base}:${attempt}`;
      const previous = preparing.get(key);
      if (previous) return previous;
      const operation = (async () => {
        const saved = await storage.getItem<MediaRequest>(key);
        if (saved) return read(saved, project);
        if ((project.generations?.length ?? 0) >= 2000)
          throw new Error("生成记录达到项目上限");
        const previousMediaId = shot[GENERATION_TYPES[purpose].field];
        const job: FilmGeneration = {
          id: newId(),
          purpose,
          contextId: source.id,
          episodeId: source.episodeId,
          shotId: shot.id,
          chatId: source.chatId,
          workspaceId: project.workspace!.id,
          status: "preparing",
          prompt: text,
          ...(previousMediaId ? { previousMediaId } : {}),
          outputIds: [],
          createdAt: Date.now(),
        };
        const value: MediaRequest = {
          projectId: project.id,
          contextId: source.id,
          attempt,
          job,
        };
        read(value, project);
        await storage.setItem(key, value as unknown as ApplicationStorageValue);
        return job;
      })();
      preparing.set(key, operation);
      try {
        return await operation;
      } finally {
        preparing.delete(key);
      }
    },
    async unread(project: FilmProject, seen: ReadonlySet<string>) {
      const records: Array<{ key: string; job: FilmGeneration }> = [];
      for (const key of (await storage.keys()).filter(
        (key) => key.startsWith(prefix(project.id)) && !seen.has(key),
      )) {
        const value = await storage.getItem<MediaRequest>(key);
        if (!value) continue;
        const job = read(value, project);
        if (
          key !==
          `${prefix(project.id)}${identifier(value.contextId)}:${identifier(job.shotId)}:${job.purpose}:${value.attempt}`
        )
          throw new Error("媒体任务索引无效");
        records.push({ key, job });
      }
      return records;
    },
  };
}
