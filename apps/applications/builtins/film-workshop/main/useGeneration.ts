import { useEffect, useRef, useState } from "react";
import {
  getApplicationChatClient,
  type ApplicationChatSession,
} from "@mewvis/app-sdk/chat";
import { getApplicationFileClient } from "@mewvis/app-sdk/files";
import { assistantContext } from "./assistant-context";
import { projectSession } from "./assistant-session";
import {
  applyGeneration,
  generationMarker,
  generationResult,
  relativeMediaPath,
} from "./media";
import { newId, type FilmGeneration, type FilmMedia } from "./model";
import type { useEditor } from "./useEditor";

export function useGeneration(editor: ReturnType<typeof useEditor>) {
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [retry, setRetry] = useState(0);
  const [stopping, setStopping] = useState(false);
  const startingRef = useRef(false),
    latest = useRef(editor);
  latest.current = editor;
  const watched = useRef(
    new Map<
      string,
      { close: () => void; sync: () => void; session: ApplicationChatSession }
    >(),
  );
  const pending =
    editor.project.generations?.filter((job) =>
      ["preparing", "running"].includes(job.status),
    ) ?? [];
  const key = pending.map((job) => `${job.id}:${job.taskId ?? ""}`).join(":");
  useEffect(() => {
    let disposed = false;
    for (const [id, watcher] of watched.current)
      if (!pending.some((job) => job.id === id)) {
        watcher.close();
        watched.current.delete(id);
      }
    for (const job of pending) {
      const watcher = watched.current.get(job.id);
      if (watcher) {
        watcher.sync();
        continue;
      }
      void getApplicationChatClient()
        .openSession({ workspaceId: job.workspaceId, chatId: job.chatId })
        .then((session) => {
          if (disposed || watched.current.has(job.id)) return;
          let tail = Promise.resolve();
          const sync = () => {
            const snapshot = session.getSnapshot();
            tail = tail
              .then(async () => {
                const currentEditor = latest.current;
                const current = currentEditor.current.current;
                const record = current.generations?.find(
                  (item) => item.id === job.id,
                );
                if (
                  !record ||
                  !["preparing", "running"].includes(record.status)
                )
                  return;
                const result = generationResult(record, snapshot);
                if (!result) return;
                const outputs: FilmMedia[] = [];
                for (const output of result.outputs) {
                  const path = relativeMediaPath(current, output.filePath);
                  if (!path.startsWith(`generated/${record.id}/`))
                    throw new Error("生成结果不属于本次镜头请求");
                  const known = current.media?.find(
                    (media) => media.path === path,
                  );
                  if (known) {
                    outputs.push(known);
                    continue;
                  }
                  const info = await getApplicationFileClient().stat(
                    output.filePath,
                  );
                  if (info.type !== "file" || !info.size)
                    throw new Error("生成文件不存在或为空");
                  outputs.push({
                    id: newId(),
                    path,
                    name: info.name.slice(0, 120),
                    kind: "image",
                    size: info.size,
                    mimeType: output.mimeType ?? "",
                    source: "generated",
                    createdAt: Date.now(),
                  });
                }
                latest.current.edit((project) =>
                  applyGeneration(
                    project,
                    job.id,
                    result.status,
                    outputs,
                    result.error,
                  ),
                );
                await latest.current.flush();
              })
              .catch((reason) => {
                const message =
                  reason instanceof Error ? reason.message : String(reason);
                setError(message);
                latest.current.edit((project) => {
                  const record = project.generations?.find(
                    (item) => item.id === job.id,
                  );
                  return record &&
                    ["preparing", "running"].includes(record.status)
                    ? applyGeneration(project, job.id, "failed", [], message)
                    : project;
                });
              });
          };
          const close = session.subscribe(sync);
          watched.current.set(job.id, { close, sync, session });
          sync();
        })
        .catch((reason) => {
          if (!disposed)
            setError(reason instanceof Error ? reason.message : String(reason));
        });
    }
    return () => {
      disposed = true;
    };
  }, [key, retry]);
  useEffect(
    () => () => {
      for (const watcher of watched.current.values()) watcher.close();
      watched.current.clear();
    },
    [],
  );

  const generate = async (episodeId: string, shotId: string) => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setError("");
    let job: FilmGeneration | undefined;
    let dispatched = false;
    try {
      const project = editor.current.current;
      if (!project.workspace) throw new Error("请先选择项目工作目录");
      const episode = project.episodes.find((item) => item.id === episodeId);
      const shot = episode?.shots.find((item) => item.id === shotId);
      if (!episode || !shot) throw new Error("镜头已不存在");
      if (
        project.generations?.some((item) =>
          ["preparing", "running"].includes(item.status),
        )
      )
        throw new Error("请等待当前生图结束，或在助手中停止任务");
      const prompt = shot.imagePrompt.trim() || shot.description.trim();
      if (!prompt) throw new Error("请先填写画面内容或图片提示词");
      await editor.flush();
      const session = await projectSession(project, episodeId);
      if (session.getSnapshot().phase !== "idle")
        throw new Error("创作助手正在执行任务，请等待结束");
      if (!session.getSnapshot().config.selectedModelId)
        throw new Error("请先在创作助手中选择模型");
      const context = await session.setContext(
        assistantContext(project, episode, "storyboard", shotId),
      );
      if (!context.ok) throw new Error(context.error);
      job = {
        id: newId(),
        episodeId,
        shotId,
        chatId: session.identity.id,
        workspaceId: project.workspace.id,
        status: "preparing",
        prompt,
        previousMediaId: shot.imageMediaId,
        outputIds: [],
        createdAt: Date.now(),
      };
      editor.edit((current) => ({
        ...current,
        generations: [...(current.generations ?? []), job!],
      }));
      await editor.flush();
      if (
        editor.current.current.generations?.find((item) => item.id === job!.id)
          ?.status !== "preparing"
      )
        return;
      const result = await session.send({
        requestId: job.id,
        blocks: [
          {
            type: "text",
            content: `为「${shot.title}」生成一张 ${project.aspectRatio} 分镜图。\n${prompt}\n${generationMarker(job.id)}`,
          },
        ],
        text: `请结合项目的画面比例与视觉风格，为镜头「${shot.title}」生成一张分镜图片。\n${generationMarker(job.id)}\n先查询 generate_media 的 image-generation 用途，按其 Schema 组合输入，只调用一次生成；不要用文字建议代替实际生成。参考文件只在当前用途支持时使用。失败或停止后不要自动重试。\n${JSON.stringify(
          {
            projectId: project.id,
            episodeId,
            shotId,
            prompt,
            style: project.style,
            aspectRatio: project.aspectRatio,
            references: project.assets
              .filter(
                (asset) =>
                  asset.id === shot.sceneId ||
                  shot.characterIds.includes(asset.id),
              )
              .map((asset) => ({
                name: asset.name,
                description: asset.description,
                files: (asset.mediaIds ?? []).flatMap((id) => {
                  const media = project.media?.find((item) => item.id === id);
                  return media
                    ? [`${project.workspace!.directory}/${media.path}`]
                    : [];
                }),
              })),
            outputDirectory: `${project.workspace.directory}/generated/${job.id}`,
          },
          null,
          2,
        )}`,
      });
      if (result.status !== "dispatched")
        throw new Error(result.reason || "生成请求未提交");
      dispatched = true;
      editor.edit((current) => ({
        ...current,
        generations: current.generations?.map((item) =>
          item.id === job!.id
            ? {
                ...item,
                taskId: result.taskId,
                status: item.status === "preparing" ? "running" : item.status,
              }
            : item,
        ),
      }));
      await editor.flush();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      if (job && !dispatched) {
        editor.edit((project) =>
          applyGeneration(project, job!.id, "failed", [], message),
        );
        await editor.flush().catch(() => {});
      }
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  };
  const stop = async () => {
    const job = pending[0];
    if (!job || startingRef.current || stopping) return;
    setStopping(true);
    setError("");
    try {
      const session =
        watched.current.get(job.id)?.session ??
        (await getApplicationChatClient().openSession({
          workspaceId: job.workspaceId,
          chatId: job.chatId,
        }));
      const snapshot = session.getSnapshot();
      if (snapshot.phase !== "idle") {
        if (job.taskId !== snapshot.execution?.taskId)
          throw new Error("助手正在执行其他任务，请在助手中确认后停止");
        const result = await session.stop();
        if (!result.ok) throw new Error(result.error);
      }
      latest.current.edit((project) => {
        const record = project.generations?.find((item) => item.id === job.id);
        return record && ["preparing", "running"].includes(record.status)
          ? applyGeneration(project, job.id, "stopped", [])
          : project;
      });
      await latest.current.flush();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setStopping(false);
    }
  };
  return {
    generate,
    stop,
    stopping,
    error,
    starting,
    busy: starting || pending.length > 0,
    retry: () => {
      setError("");
      setRetry((value) => value + 1);
    },
  };
}
