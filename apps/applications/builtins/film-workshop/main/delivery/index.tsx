import { useEffect, useRef, useState } from "react";
import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "design-system/components/ui/popover";
import { FilePreview } from "@mewvis/app-sdk/files/react";
import type {
  FilePreviewMediaControls,
  FilePreviewMediaState,
} from "@mewvis/app-sdk/files";
import {
  getApplicationHost,
  writeClipboardText,
} from "@mewvis/app-sdk/browser";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  LoaderCircle,
  MoreHorizontal,
  Play,
  RefreshCw,
  Square,
  Trash2,
  Video,
} from "lucide-react";
import {
  deliveryReport,
  productionManifest,
  type FilmEpisode,
  type FilmProject,
  type FilmRender,
  type FlowStep,
} from "../model";
import { mediaPath } from "../media";
import { Dialog } from "../components/Dialog";
import { Field } from "../components/Fields";
import {
  defaultRenderOptions,
  renderDimensions,
  renderMatches,
  renderPending,
  shotSelection,
  type RenderOptions,
  type RenderSelection,
} from "./plan";
import { Timeline, timelineClips } from "./timeline";
import type { DeliveryController } from "./useDelivery";
import "./style.css";

const statusLabel = {
  preparing: "待确认",
  queued: "排队中",
  running: "合成中",
  cancelling: "停止中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已停止",
};
const phaseLabel = {
  queued: "等待合成",
  preparing: "检查与准备素材",
  rendering: "合成音画",
  saving: "保存成片",
  done: "处理完成",
};
const initialPlayback = {
  currentTime: 0,
  duration: 0,
  paused: true,
  ended: false,
};
export function Delivery({
  project,
  episode,
  controller,
  edit,
  selectedShotId,
  onSelectShot,
  onOpenStep,
}: {
  project: FilmProject;
  episode: FilmEpisode;
  controller: DeliveryController;
  edit: (update: (project: FilmProject) => FilmProject) => void;
  selectedShotId?: string;
  onSelectShot?: (id: string) => void;
  onOpenStep?: (step: FlowStep) => void;
}) {
  const [options, setOptions] = useState<RenderOptions>(defaultRenderOptions);
  const [selection, setSelection] = useState<RenderSelection>({});
  const [selectedId, setSelectedId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [removing, setRemoving] = useState<FilmRender>();
  const [manifestOpen, setManifestOpen] = useState(false);
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [checking, setChecking] = useState(false);
  const controls = useRef<FilePreviewMediaControls | null>(null);
  const [playback, setPlayback] =
    useState<FilePreviewMediaState>(initialPlayback);
  const records = (project.renders ?? [])
    .filter((r) => r.episodeId === episode.id)
    .slice()
    .reverse();
  const selected =
    records.find((r) => r.id === selectedId && r.status === "completed") ??
    records.find((r) => r.status === "completed");
  const pending = (project.renders ?? []).find(renderPending);
  const latest = records[0];
  const clips = timelineClips(project, episode, selection);
  const clip = clips.find((c) => c.shot.id === selectedShotId) ?? clips[0];
  const matches =
    !!selected && renderMatches(project, episode, selected, options, selection);
  const seekable = matches && playback.duration > 0;
  const missing = clips.filter((c) => !c.visual).length;
  const dimensions = renderDimensions(project.aspectRatio, options.resolution);
  const disabled =
    controller.busy ||
    !!missing ||
    !clips.length ||
    !project.workspace ||
    !controller.capability?.available;
  const manifest = productionManifest(project, episode);
  useEffect(() => {
    setPlayback(initialPlayback);
  }, [selected?.id]);
  const copy = async (text: string, label: string) => {
    setMessage("");
    setError("");
    try {
      await writeClipboardText(text);
      setMessage(`${label}已复制`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const updateSelection = (patch: RenderSelection[string]) => {
    if (clip)
      setSelection((p) => ({
        ...p,
        [clip.shot.id]: { ...p[clip.shot.id], ...patch },
      }));
  };
  const onPlayback = (state: FilePreviewMediaState) => {
    setPlayback(state);
    if (!matches || Math.abs(state.currentTime - playback.currentTime) < 0.01)
      return;
    const active =
      clips.find(
        (c) => state.currentTime >= c.start && state.currentTime < c.end,
      ) ?? clips.at(-1);
    if (active && active.shot.id !== selectedShotId)
      onSelectShot?.(active.shot.id);
  };
  const start = (mode: FilmRender["mode"]) => {
    setSelectedId("");
    setMessage("");
    setError("");
    void controller.start(episode.id, mode, options, selection);
  };
  const check = () => {
    setChecking(true);
    setError("");
    void getApplicationHost()
      .executeTool<ReturnType<typeof deliveryReport>>("film_check_delivery", {
        project,
        episodeId: episode.id,
      })
      .then(({ value }) =>
        setMessage(
          value.ready
            ? "制作计划检查通过。"
            : `发现 ${value.issues.length} 项待完善内容。`,
        ),
      )
      .catch((reason) => setError(String(reason)))
      .finally(() => setChecking(false));
  };
  return (
    <div className="film-delivery">
      <header className="film-delivery-heading">
        <h2>预览导出</h2>
        <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
          <PopoverTrigger asChild>
            <button aria-label="合成记录" className="film-render-version">
              {selected
                ? `${selected.mode === "preview" ? "预览" : "成片"} v${records.length - records.indexOf(selected)}`
                : "历史版本"}
              <ChevronDown size={13} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="film-delivery-popup film-render-history"
            aria-label="合成记录"
          >
            <h3>
              合成记录 <small>{records.length}</small>
            </h3>
            {!records.length && (
              <p className="film-muted">生成的预览与成片会保存在这里。</p>
            )}
            {records.map((render, index) => (
              <article key={render.id}>
                <button
                  className="film-render-history-choice"
                  disabled={render.status !== "completed"}
                  aria-pressed={selected?.id === render.id}
                  onClick={() => {
                    setSelectedId(render.id);
                    setHistoryOpen(false);
                  }}
                >
                  <strong>
                    {render.mode === "preview" ? "预览" : "成片"} v
                    {records.length - index}
                    <span className={`film-render-status is-${render.status}`}>
                      {statusLabel[render.status]}
                    </span>
                    {selected?.id === render.id && <Check size={13} />}
                  </strong>
                  <small>
                    {new Date(render.createdAt).toLocaleString()} ·{" "}
                    {render.input.width} × {render.input.height} ·{" "}
                    {render.input.fps} fps
                  </small>
                  {render.error && (
                    <small className="film-error">{render.error}</small>
                  )}
                </button>
                {!renderPending(render) && (
                  <button
                    className="film-icon-button"
                    aria-label={`移除合成记录 ${render.id}`}
                    onClick={() => {
                      setHistoryOpen(false);
                      setRemoving(render);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </article>
            ))}
          </PopoverContent>
        </Popover>
        {selected && (
          <span
            className={`film-render-freshness ${matches ? "" : "is-stale"}`}
          >
            {matches ? "与当前时间轴一致" : "预览待更新"}
          </span>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="film-icon-button film-delivery-more"
              aria-label="更多交付操作"
            >
              <MoreHorizontal size={17} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="film-delivery-popup film-render-menu"
          >
            <button onClick={() => setManifestOpen(true)}>
              <FileText size={14} />
              制作清单与项目数据
            </button>
            {selected && (
              <button
                onClick={() =>
                  void copy(
                    mediaPath(project, { path: selected.input.outputFilePath }),
                    "文件路径",
                  )
                }
              >
                <Copy size={14} />
                复制当前文件路径
              </button>
            )}
          </PopoverContent>
        </Popover>
      </header>
      <div className="film-delivery-viewer">
        <section className="film-render-player" aria-label="成片预览">
          {selected ? (
            <FilePreview
              key={selected.id}
              filePath={mediaPath(project, {
                path: selected.input.outputFilePath,
              })}
              onMediaReady={(value) => {
                controls.current = value;
              }}
              onMediaStateChange={onPlayback}
            />
          ) : (
            <div className="film-render-placeholder">
              <Video size={30} />
              <strong>预览本集成片</strong>
              <p>选择画面与配音后，生成合成预览。</p>
            </div>
          )}
        </section>
        <aside className="film-render-inspector" aria-label="当前片段属性">
          {clip ? (
            <>
              <header>
                <span>镜头 {String(clip.index + 1).padStart(2, "0")}</span>
                <div>
                  <button
                    className="film-icon-button"
                    aria-label="上一个片段"
                    disabled={clip.index === 0}
                    onClick={() =>
                      onSelectShot?.(clips[clip.index - 1].shot.id)
                    }
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    className="film-icon-button"
                    aria-label="下一个片段"
                    disabled={clip.index === clips.length - 1}
                    onClick={() =>
                      onSelectShot?.(clips[clip.index + 1].shot.id)
                    }
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </header>
              <h3>{clip.shot.title}</h3>
              <Field label={`第 ${clip.index + 1} 镜画面`}>
                <NativeSelect
                  value={shotSelection(clip.shot, selection).visualId}
                  onChange={(e) =>
                    updateSelection({ visualId: e.target.value })
                  }
                >
                  <NativeSelectOption value="">
                    请选择画面素材
                  </NativeSelectOption>
                  {project.media
                    ?.filter(
                      (m) =>
                        clip.shot.mediaIds?.includes(m.id) &&
                        ["image", "video"].includes(m.kind),
                    )
                    .map((m) => (
                      <NativeSelectOption key={m.id} value={m.id}>
                        {m.kind === "image" ? "图片" : "视频"} · {m.name}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
              </Field>
              <Field label={`第 ${clip.index + 1} 镜配音`}>
                <NativeSelect
                  value={shotSelection(clip.shot, selection).audioId}
                  onChange={(e) => updateSelection({ audioId: e.target.value })}
                >
                  <NativeSelectOption value="">
                    不使用独立配音
                  </NativeSelectOption>
                  {project.media
                    ?.filter(
                      (m) =>
                        clip.shot.mediaIds?.includes(m.id) &&
                        m.kind === "audio",
                    )
                    .map((m) => (
                      <NativeSelectOption key={m.id} value={m.id}>
                        {m.name}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
              </Field>
              <label className="film-render-check">
                <input
                  type="checkbox"
                  checked={
                    selection[clip.shot.id]?.keepAudio ?? options.keepAudio
                  }
                  disabled={clip.visual?.kind !== "video" || !!clip.audio}
                  onChange={(e) =>
                    updateSelection({ keepAudio: e.target.checked })
                  }
                />
                保留视频原声
              </label>
              {!!clip.audio && (
                <small className="film-muted">独立配音将替代视频原声。</small>
              )}
              <footer>
                <span>
                  时长 <b>{clip.shot.duration} 秒</b>
                </span>
                <button onClick={() => onOpenStep?.("storyboard")}>
                  编辑分镜
                  <ArrowRight size={13} />
                </button>
              </footer>
            </>
          ) : (
            <p className="film-muted">添加分镜后，在这里调整片段素材。</p>
          )}
        </aside>
      </div>
      <Timeline
        project={project}
        clips={clips}
        selectedId={clip?.shot.id}
        currentTime={playback.currentTime}
        playing={!playback.paused}
        seekable={seekable}
        onSelect={(id) => onSelectShot?.(id)}
        onSeek={(time) => controls.current?.seek(time)}
        onPlay={() => {
          if (!playback.paused) controls.current?.pause();
          else
            void controls.current
              ?.play()
              .catch((reason) => setError(String(reason)));
        }}
      />
      <div className="film-render-bottom">
        {(controller.error ||
          error ||
          (latest?.status === "failed" && latest.error)) && (
          <p className="film-error" role="alert">
            {controller.error || error || latest?.error}
          </p>
        )}
        {message && (
          <p className="film-success" role="status">
            {message}
          </p>
        )}
        {!project.workspace && (
          <p className="film-muted">请先在顶部选择工作目录。</p>
        )}
        {(!controller.capability?.available || controller.capabilityError) && (
          <p className="film-muted" role="status">
            {controller.capabilityError ||
              controller.capability?.reason ||
              "正在检测宿主合成能力…"}
            <button
              aria-label="重新检测合成能力"
              className="film-icon-button"
              onClick={() => void controller.checkCapability()}
            >
              <RefreshCw size={12} />
            </button>
          </p>
        )}
        {pending && (
          <div className="film-render-progress" role="status">
            <div>
              <strong>
                {pending.episodeTitle} ·{" "}
                {pending.mode === "preview" ? "预览" : "成片"}
              </strong>
              <span>
                {pending.status === "preparing"
                  ? controller.starting
                    ? "提交任务…"
                    : "任务待确认"
                  : phaseLabel[
                      controller.jobs[pending.id]?.phase ?? "queued"
                    ]}{" "}
                {Math.floor((controller.jobs[pending.id]?.progress ?? 0) * 100)}
                %
              </span>
            </div>
            <progress
              max={1}
              value={controller.jobs[pending.id]?.progress ?? 0}
              aria-label="合成进度"
            />
            {pending.jobId ? (
              <button
                className="film-generation-stop"
                disabled={
                  controller.cancelling === pending.id ||
                  pending.status === "cancelling"
                }
                onClick={() => void controller.cancel(pending)}
              >
                <Square size={13} />
                {pending.status === "cancelling" ? "停止中…" : "停止合成"}
              </button>
            ) : (
              !controller.starting && (
                <button onClick={() => void controller.resume(pending)}>
                  确认任务
                </button>
              )
            )}
            {controller.errors[pending.id] && (
              <p className="film-error">
                {controller.errors[pending.id]}{" "}
                <button onClick={() => void controller.resume(pending)}>
                  重新连接
                </button>
              </p>
            )}
          </div>
        )}
        <div className="film-render-actions">
          <Popover>
            <PopoverTrigger asChild>
              <button aria-label="导出设置">
                {options.resolution}p · {options.fps} fps
                <ChevronDown size={13} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              className="film-delivery-popup film-render-settings"
              aria-label="导出设置"
            >
              <h3>导出设置</h3>
              <div>
                <Field label="导出清晰度">
                  <NativeSelect
                    value={options.resolution}
                    onChange={(e) =>
                      setOptions((p) => ({
                        ...p,
                        resolution: Number(e.target.value) as 720 | 1080,
                      }))
                    }
                  >
                    <NativeSelectOption value={720}>720p</NativeSelectOption>
                    <NativeSelectOption value={1080}>1080p</NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field label="帧率">
                  <NativeSelect
                    value={options.fps}
                    onChange={(e) =>
                      setOptions((p) => ({
                        ...p,
                        fps: Number(e.target.value) as 24 | 30,
                      }))
                    }
                  >
                    <NativeSelectOption value={24}>24 fps</NativeSelectOption>
                    <NativeSelectOption value={30}>30 fps</NativeSelectOption>
                  </NativeSelect>
                </Field>
              </div>
              <Field label="画面适配">
                <NativeSelect
                  value={options.fit}
                  onChange={(e) =>
                    setOptions((p) => ({
                      ...p,
                      fit: e.target.value as RenderOptions["fit"],
                    }))
                  }
                >
                  <NativeSelectOption value="contain">
                    完整显示 · 留边
                  </NativeSelectOption>
                  <NativeSelectOption value="cover">
                    铺满画面 · 裁切
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
              <label className="film-render-check">
                <input
                  type="checkbox"
                  checked={options.freeze}
                  onChange={(e) =>
                    setOptions((p) => ({ ...p, freeze: e.target.checked }))
                  }
                />
                视频不足时定格末帧
              </label>
              <label className="film-render-check">
                <input
                  type="checkbox"
                  checked={options.trimAudio}
                  onChange={(e) =>
                    setOptions((p) => ({ ...p, trimAudio: e.target.checked }))
                  }
                />
                允许裁剪过长配音
              </label>
              <small>
                成片 {dimensions.width} × {dimensions.height} · MP4
                <br />
                预览使用 360p，设置更改后需重新合成。
              </small>
              {project.workspace && (
                <small className="film-render-path">
                  保存到 {project.workspace.directory}/exports/
                </small>
              )}
            </PopoverContent>
          </Popover>
          <span className={missing ? "film-muted" : "film-render-readiness"}>
            {missing
              ? `${missing} 个镜头待选画面`
              : `${clips.length} 个镜头已准备`}
          </span>
          <div>
            <button disabled={disabled} onClick={() => start("export")}>
              <Download size={15} />
              导出成片
            </button>
            <button
              className="film-primary"
              disabled={disabled}
              onClick={() => start("preview")}
            >
              {controller.starting ? (
                <LoaderCircle size={15} className="film-spin" />
              ) : (
                <Play size={15} />
              )}
              生成预览
            </button>
          </div>
        </div>
      </div>
      {manifestOpen && (
        <Dialog
          title="制作清单与项目数据"
          onClose={() => setManifestOpen(false)}
        >
          <div className="film-section-toolbar">
            <h3>制作计划</h3>
            <button disabled={checking} onClick={check}>
              <FileText size={14} />
              检查制作计划
            </button>
          </div>
          <pre className="film-manifest" tabIndex={0}>
            {manifest}
          </pre>
          <footer>
            <button onClick={() => void copy(manifest, "制作清单")}>
              <Copy size={14} />
              复制制作清单
            </button>
            <button
              onClick={() => void copy(JSON.stringify(project), "项目 JSON")}
            >
              <Copy size={14} />
              复制项目 JSON
            </button>
          </footer>
          {message && <p role="status">{message}</p>}
          {error && (
            <p className="film-error" role="alert">
              {error}
            </p>
          )}
        </Dialog>
      )}
      {removing && (
        <Dialog title="移除合成记录" onClose={() => setRemoving(undefined)}>
          <p>
            移除此条{removing.mode === "preview" ? "预览" : "导出"}
            记录？成片文件仍保留在项目工作目录中。
          </p>
          <footer>
            <button onClick={() => setRemoving(undefined)}>取消</button>
            <button
              className="film-danger"
              onClick={() => {
                edit((p) => ({
                  ...p,
                  renders: p.renders?.filter((r) => r.id !== removing.id),
                }));
                setRemoving(undefined);
              }}
            >
              确认移除
            </button>
          </footer>
        </Dialog>
      )}
    </div>
  );
}
