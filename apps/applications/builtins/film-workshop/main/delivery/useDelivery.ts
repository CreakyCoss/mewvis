import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApplicationMediaError,
  getApplicationMediaClient,
  type MediaCapabilities,
  type MediaJob,
} from "@mewvis/app-sdk/media";
import type { FilmRender } from "../model";
import type { useEditor } from "../useEditor";
import {
  applyRender,
  createRender,
  renderPending,
  renderRequest,
  type RenderOptions,
  type RenderSelection,
} from "./plan";

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
export function useDelivery(editor: ReturnType<typeof useEditor>) {
  const { project, current, edit, flush } = editor;
  const [capability, setCapability] = useState<MediaCapabilities>();
  const [capabilityError, setCapabilityError] = useState("");
  const [jobs, setJobs] = useState<Record<string, MediaJob>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState("");
  const [revision, setRevision] = useState(0);
  const lock = useRef(false),
    submitting = useRef(new Set<string>()),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const checkCapability = useCallback(async () => {
    try {
      const value = await getApplicationMediaClient().capabilities();
      if (active.current) {
        setCapability(value);
        setCapabilityError("");
      }
      return value;
    } catch (error) {
      if (active.current) setCapabilityError(message(error));
      return undefined;
    }
  }, []);
  useEffect(() => {
    void checkCapability();
  }, [checkCapability]);
  const reconcile = useCallback(
    async (id: string, job: MediaJob) => {
      // Validate before publishing progress or updating the live editor.
      const before = current.current;
      const next = applyRender(before, id, job);
      if (!active.current) return;
      setJobs((previous) => ({ ...previous, [id]: job }));
      if (next !== before) {
        edit((project) => applyRender(project, id, job));
        await flush();
      }
    },
    [current, edit, flush],
  );
  const submit = useCallback(
    async (render: FilmRender) => {
      submitting.current.add(render.id);
      try {
        const job = await getApplicationMediaClient().compose(
          renderRequest(current.current, render),
        );
        await reconcile(render.id, job);
      } catch (error) {
        // Submission may have reached the host. Keep the request snapshot and never retry automatically.
        if (
          active.current &&
          error instanceof ApplicationMediaError &&
          [
            "INVALID_ARGUMENT",
            "CAPABILITY_UNAVAILABLE",
            "PERMISSION_DENIED",
            "LIMIT_EXCEEDED",
            "FILE_EXISTS",
            "REQUEST_CONFLICT",
            "UNSUPPORTED_MEDIA",
          ].includes(error.code)
        ) {
          edit((p) => ({
            ...p,
            renders: p.renders?.map((r) =>
              r.id === render.id
                ? {
                    ...r,
                    status: "failed",
                    error: message(error).slice(0, 4000),
                  }
                : r,
            ),
          }));
          await flush().catch(() => {});
        }
        if (active.current)
          setErrors((previous) => ({
            ...previous,
            [render.id]: message(error),
          }));
      } finally {
        submitting.current.delete(render.id);
      }
    },
    [current, reconcile, edit, flush],
  );
  const pendingKey = (project.renders ?? [])
    .filter((r) => renderPending(r) && r.jobId)
    .map((r) => `${r.id}:${r.jobId}`)
    .join(",");
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const failed = new Set<string>();
    const poll = async () => {
      for (const render of current.current.renders ?? []) {
        if (stopped) return;
        if (
          !renderPending(render) ||
          !render.jobId ||
          submitting.current.has(render.id) ||
          failed.has(render.id)
        )
          continue;
        try {
          const job = await getApplicationMediaClient().get(render.jobId);
          if (!stopped) {
            await reconcile(render.id, job);
            setErrors((previous) => ({ ...previous, [render.id]: "" }));
          }
        } catch (error) {
          failed.add(render.id);
          if (!stopped)
            setErrors((previous) => ({
              ...previous,
              [render.id]: message(error),
            }));
        }
      }
      if (!stopped)
        timer = setTimeout(() => {
          void poll();
        }, 1000);
    };
    if (pendingKey) void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pendingKey, revision, current, reconcile]);
  const start = async (
    episodeId: string,
    mode: FilmRender["mode"],
    options: RenderOptions,
    selection: RenderSelection,
  ) => {
    if (lock.current || current.current.renders?.some(renderPending)) return;
    lock.current = true;
    setStarting(true);
    setError("");
    let saved = false,
      render: FilmRender | undefined;
    try {
      const available = await checkCapability();
      if (!available?.available)
        throw new Error(available?.reason || "宿主媒体服务不可用");
      await flush();
      const project = current.current;
      const episode = project.episodes.find((e) => e.id === episodeId);
      if (!episode) throw new Error("当前分集已被删除");
      render = createRender(project, episode, mode, options, selection);
      for (const [index, clip] of render.input.clips.entries()) {
        for (const [path, kind] of [
          [clip.visual.filePath, clip.visual.kind],
          ...(clip.audio ? [[clip.audio.filePath, "audio"] as const] : []),
        ] as const) {
          const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
          if (
            !available.inputs[kind as "image" | "video" | "audio"].includes(
              extension,
            )
          )
            throw new Error(
              `第 ${index + 1} 镜包含宿主不支持的 ${extension} 文件，请更换素材`,
            );
        }
      }
      const record = render;
      edit((p) => ({ ...p, renders: [...(p.renders ?? []), record] }));
      await flush();
      saved = true;
      await submit(record);
    } catch (error) {
      if (render && !saved) {
        const id = render.id;
        edit((p) => ({ ...p, renders: p.renders?.filter((r) => r.id !== id) }));
      }
      if (active.current) setError(message(error));
    } finally {
      lock.current = false;
      if (active.current) setStarting(false);
    }
  };
  const resume = async (render: FilmRender) => {
    if (submitting.current.has(render.id)) return;
    setErrors((previous) => ({ ...previous, [render.id]: "" }));
    if (render.jobId) {
      setRevision((value) => value + 1);
      return;
    }
    try {
      await flush();
      await submit(render);
    } catch (error) {
      setErrors((previous) => ({ ...previous, [render.id]: message(error) }));
    }
  };
  const cancel = async (render: FilmRender) => {
    if (!render.jobId || cancelling) return;
    setCancelling(render.id);
    try {
      await reconcile(
        render.id,
        await getApplicationMediaClient().cancel(render.jobId),
      );
    } catch (error) {
      setErrors((previous) => ({ ...previous, [render.id]: message(error) }));
    } finally {
      if (active.current) setCancelling("");
    }
  };
  return {
    capability,
    capabilityError,
    checkCapability,
    starting,
    cancelling,
    jobs,
    errors,
    error,
    start,
    resume,
    cancel,
    busy: starting || !!project.renders?.some(renderPending),
  };
}
export type DeliveryController = ReturnType<typeof useDelivery>;
