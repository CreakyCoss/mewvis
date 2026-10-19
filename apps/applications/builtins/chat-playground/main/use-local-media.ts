import { useEffect, useRef, useState } from "react";
import {
  getApplicationFileClient,
  type ApplicationFileRoots,
} from "@mewvis/app-sdk/files";
import {
  getApplicationMediaClient,
  type MediaCapabilities,
  type MediaInfo,
  type MediaJob,
} from "@mewvis/app-sdk/media";
import {
  EXAMPLE_MAX_DURATION,
  MEDIA_SIZES,
  importLocalMedia,
  isMediaJobActive,
  localComposeInput,
  mergeMediaJobs,
  supportsMedia,
} from "./local-media";
const errorText = (reason: unknown) =>
  reason instanceof Error ? reason.message : String(reason);

export function useLocalMedia() {
  const [capabilities, setCapabilities] = useState<MediaCapabilities>();
  const [roots, setRoots] = useState<ApplicationFileRoots>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pollError, setPollError] = useState("");
  const [pollVersion, setPollVersion] = useState(0);
  const [path, setPath] = useState("");
  const [info, setInfo] = useState<MediaInfo>();
  const [image, setImage] = useState<MediaInfo>();
  const [audio, setAudio] = useState<MediaInfo>();
  const [duration, setDuration] = useState("5");
  const [size, setSize] = useState(0);
  const [fit, setFit] = useState<"contain" | "cover">("contain");
  const [trimAudio, setTrimAudio] = useState(false);
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const operation = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(false);
  const upload = useRef<HTMLInputElement>(null);
  const activeIds = jobs
    .filter(isMediaJobActive)
    .map((job) => job.id)
    .sort()
    .join(",");

  const load = async (signal: AbortSignal) => {
    const values = await Promise.allSettled([
      Promise.resolve().then(() => getApplicationMediaClient().capabilities()),
      Promise.resolve().then(() => getApplicationFileClient().roots()),
      Promise.resolve().then(() =>
        getApplicationMediaClient().list({ limit: 20 }),
      ),
    ]);
    signal.throwIfAborted();
    const [capability, directories, history] = values;
    setCapabilities(
      capability.status === "fulfilled" ? capability.value : undefined,
    );
    setRoots(
      directories.status === "fulfilled" ? directories.value : undefined,
    );
    if (history.status === "fulfilled") {
      setJobs((current) => mergeMediaJobs(current, history.value));
      setSelectedId((current) => current ?? history.value[0]?.id);
    }
    setError(
      [
        ...new Set(
          values.flatMap((value) =>
            value.status === "rejected" ? [errorText(value.reason)] : [],
          ),
        ),
      ].join("；"),
    );
    setPollError("");
    setPollVersion((version) => version + 1);
  };
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void load(controller.signal)
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorText(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      mounted.current = false;
      controller.abort();
      operation.current?.abort();
      operation.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (!activeIds) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const media = getApplicationMediaClient();
        const updates = await Promise.all(
          activeIds.split(",").map((id) => media.get(id)),
        );
        if (disposed) return;
        setJobs((current) => mergeMediaJobs(current, updates));
        if (updates.some(isMediaJobActive)) timer = setTimeout(poll, 1000);
      } catch (reason) {
        if (!disposed)
          setPollError(
            `任务状态更新失败：${errorText(reason)}。请刷新能力与任务，重新连接。`,
          );
      }
    };
    timer = setTimeout(poll, 500);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [activeIds, pollVersion]);

  const run = async (
    label: string,
    action: (signal: AbortSignal) => Promise<void>,
  ) => {
    if (operation.current) return false;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await action(controller.signal);
      return !controller.signal.aborted;
    } catch (reason) {
      if (!controller.signal.aborted) setError(errorText(reason));
      return false;
    } finally {
      if (operation.current === controller) operation.current = undefined;
      if (mounted.current) setBusy("");
    }
  };
  const probe = (filePath: string, signal: AbortSignal) => {
    setInfo(undefined);
    return getApplicationMediaClient()
      .probe(filePath)
      .then((value) => {
        signal.throwIfAborted();
        setInfo(value);
        setPath(value.filePath);
        return value;
      });
  };
  const importFile = (file: File, target?: "image" | "audio") =>
    run("导入并探测素材", async (signal) => {
      if (!roots || !capabilities) throw new Error("请先刷新本地媒体能力。");
      setInfo(undefined);
      const saved = await importLocalMedia(
        getApplicationFileClient(),
        roots.dataPath,
        file,
        capabilities,
        signal,
      );
      signal.throwIfAborted();
      setPath(saved.filePath);
      // A committed copy remains even when decoding fails; keep its path visible.
      const value = await probe(saved.filePath, signal);
      const kind =
        target ??
        (supportsMedia(capabilities, "image", value.filePath)
          ? "image"
          : !value.video && value.audio
            ? "audio"
            : undefined);
      if (kind === "image") {
        if (
          !supportsMedia(capabilities, "image", value.filePath) ||
          !value.video
        )
          throw new Error("该素材不能用作图片，请选择宿主支持的静态图片。");
        setImage(value);
      } else if (kind === "audio") {
        if (
          !supportsMedia(capabilities, "audio", value.filePath) ||
          !value.audio
        )
          throw new Error("该素材不能用作配音，请选择宿主支持的音频文件。");
        setAudio(value);
      }
      setMessage("副本已保存到应用数据目录，并完成媒体探测。");
    });
  const compose = () =>
    run("提交合成任务", async (signal) => {
      if (!roots || !capabilities || !image)
        throw new Error("请先选择图片素材。");
      const input = localComposeInput({
        capabilities,
        dataPath: roots.dataPath,
        image,
        audio,
        duration: Number(duration),
        ...MEDIA_SIZES[size],
        fit,
        trimAudio,
        requestId: crypto.randomUUID(),
      });
      const job = await getApplicationMediaClient().compose(input);
      signal.throwIfAborted();
      setJobs((current) => mergeMediaJobs(current, [job]));
      setSelectedId(job.id);
      setPollError("");
      setPollVersion((version) => version + 1);
      setMessage("已提交本地合成任务，离开页面后仍在宿主继续处理。");
    });
  const cancel = (id: string) =>
    run("取消任务", async (signal) => {
      const job = await getApplicationMediaClient().cancel(id);
      signal.throwIfAborted();
      setJobs((current) => mergeMediaJobs(current, [job]));
      setPollError("");
      setPollVersion((version) => version + 1);
      setMessage(
        job.status === "completed"
          ? "任务已经完成，成片已保留。"
          : "已向宿主请求取消，请以任务最终状态为准。",
      );
    });
  const disabled = loading || !!busy;
  const unavailable = !capabilities?.available || !roots;
  const selected = jobs.find((job) => job.id === selectedId);
  const maxDuration = Math.min(
    EXAMPLE_MAX_DURATION,
    capabilities?.limits.duration ?? EXAMPLE_MAX_DURATION,
  );
  const accept = capabilities
    ? [...new Set(Object.values(capabilities.inputs).flat())]
        .map((extension) => `.${extension}`)
        .join(",")
    : undefined;

  return {
    capabilities,
    roots,
    loading,
    busy,
    error,
    message,
    pollError,
    path,
    info,
    image,
    audio,
    duration,
    size,
    fit,
    trimAudio,
    jobs,
    selectedId,
    selected,
    maxDuration,
    accept,
    disabled,
    unavailable,
    activeIds,
    upload,
    setPath,
    setInfo,
    setImage,
    setAudio,
    setDuration,
    setSize,
    setFit,
    setTrimAudio,
    setSelectedId,
    setMessage,
    run,
    load,
    probe,
    importFile,
    compose,
    cancel,
    stopImport: () => {
      operation.current?.abort();
      setBusy("停止导入");
      setMessage("已请求停止导入；已提交的副本保留。");
    },
  };
}
