import { useState } from "react";
import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { FilePreview } from "@mewvis/app-sdk/files/react";
import {
  getApplicationHost,
  writeClipboardText,
} from "@mewvis/app-sdk/browser";
import {
  Copy,
  Download,
  FileText,
  LoaderCircle,
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
import { EmptyState, Field } from "../components/Fields";
import {
  defaultRenderOptions,
  renderDimensions,
  renderPending,
  shotSelection,
  type RenderOptions,
  type RenderSelection,
} from "./plan";
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
const seconds = (value: number) => Number(value.toFixed(2));
export function Delivery({
  project,
  episode,
  controller,
  edit,
  onSelectShot,
  onOpenStep,
}: {
  project: FilmProject;
  episode: FilmEpisode;
  controller: DeliveryController;
  edit: (update: (project: FilmProject) => FilmProject) => void;
  onSelectShot?: (id: string) => void;
  onOpenStep?: (step: FlowStep) => void;
}) {
  const [options, setOptions] = useState<RenderOptions>(defaultRenderOptions);
  const [selection, setSelection] = useState<RenderSelection>({});
  const [selectedId, setSelectedId] = useState("");
  const [removing, setRemoving] = useState<FilmRender>();
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [checking, setChecking] = useState(false);
  const records = (project.renders ?? [])
    .filter((r) => r.episodeId === episode.id)
    .slice()
    .reverse();
  const selected =
    records.find((r) => r.id === selectedId && r.status === "completed") ??
    records.find((r) => r.status === "completed");
  const pending = (project.renders ?? []).find(renderPending);
  const report = deliveryReport(project, episode),
    manifest = productionManifest(project, episode);
  const missing = episode.shots.filter(
    (shot) =>
      !project.media?.some(
        (m) =>
          m.id === shotSelection(shot, selection).visualId &&
          shot.mediaIds?.includes(m.id) &&
          ["image", "video"].includes(m.kind),
      ),
  ).length;
  const dimensions = renderDimensions(project.aspectRatio, options.resolution);
  const copy = async (text: string, label: string) => {
    setMessage("");
    setError("");
    try {
      await writeClipboardText(text);
      setMessage(`${label}已复制`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  let time = 0;
  return (
    <div className="film-delivery">
      <section className="film-render-player" aria-label="成片预览">
        {selected ? (
          <FilePreview
            key={selected.id}
            style={{ height: "clamp(200px, 28vw, 320px)" }}
            filePath={mediaPath(project, {
              path: selected.input.outputFilePath,
            })}
          />
        ) : (
          <div className="film-render-placeholder">
            <Video size={30} />
            <strong>预览本集成片</strong>
            <p>选择画面与配音，生成可播放的合成预览。</p>
          </div>
        )}
        {selected && (
          <footer>
            <span>
              {selected.episodeTitle} ·{" "}
              {selected.mode === "preview" ? "预览" : "成片"} ·{" "}
              {selected.input.width} × {selected.input.height}
            </span>
            <button
              onClick={() =>
                void copy(
                  mediaPath(project, { path: selected.input.outputFilePath }),
                  "文件路径",
                )
              }
            >
              <Copy size={13} />
              复制路径
            </button>
          </footer>
        )}
      </section>
      <section className="film-render-plan" aria-label="合成设置">
        <header className="film-section-toolbar">
          <div>
            <h3>本集时间轴</h3>
            <p className="film-muted">
              {episode.shots.length} 个镜头 · {seconds(report.duration)} 秒 ·{" "}
              {project.aspectRatio}
            </p>
          </div>
          <button onClick={() => onOpenStep?.("storyboard")}>编辑分镜</button>
        </header>
        <div className="film-render-timeline" aria-label="合成时间轴">
          {episode.shots.map((shot, index) => {
            const start = time;
            time += shot.duration;
            const value = shotSelection(shot, selection);
            const media =
              project.media?.filter((m) => shot.mediaIds?.includes(m.id)) ?? [];
            return (
              <article key={shot.id}>
                <div className="film-render-shot">
                  <span className="film-shot-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <button
                      className="film-render-shot-title"
                      onClick={() => {
                        onSelectShot?.(shot.id);
                        onOpenStep?.("storyboard");
                      }}
                    >
                      {shot.title}
                    </button>
                    <small>
                      {seconds(start)}–{seconds(time)} 秒 · {shot.duration} 秒
                    </small>
                  </div>
                </div>
                <Field label={`第 ${index + 1} 镜画面`}>
                  <NativeSelect
                    value={value.visualId}
                    onChange={(e) =>
                      setSelection((p) => ({
                        ...p,
                        [shot.id]: { ...p[shot.id], visualId: e.target.value },
                      }))
                    }
                  >
                    <NativeSelectOption value="">
                      选择画面素材
                    </NativeSelectOption>
                    {media
                      .filter((m) => m.kind === "image" || m.kind === "video")
                      .map((m) => (
                        <NativeSelectOption key={m.id} value={m.id}>
                          {m.kind === "image" ? "图片" : "视频"} · {m.name}
                        </NativeSelectOption>
                      ))}
                  </NativeSelect>
                </Field>
                <Field label={`第 ${index + 1} 镜配音`}>
                  <NativeSelect
                    value={value.audioId}
                    onChange={(e) =>
                      setSelection((p) => ({
                        ...p,
                        [shot.id]: { ...p[shot.id], audioId: e.target.value },
                      }))
                    }
                  >
                    <NativeSelectOption value="">
                      不使用独立配音
                    </NativeSelectOption>
                    {media
                      .filter((m) => m.kind === "audio")
                      .map((m) => (
                        <NativeSelectOption key={m.id} value={m.id}>
                          {m.name}
                        </NativeSelectOption>
                      ))}
                  </NativeSelect>
                </Field>
              </article>
            );
          })}
        </div>
        {!episode.shots.length && (
          <EmptyState
            title="先准备分镜"
            text="添加镜头并导入或生成画面素材后，即可合成预览。"
          />
        )}
        <div className="film-render-settings">
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
        </div>
        <div className="film-render-options">
          <label>
            <input
              type="checkbox"
              checked={options.keepAudio}
              onChange={(e) =>
                setOptions((p) => ({ ...p, keepAudio: e.target.checked }))
              }
            />
            无配音时保留视频原声
          </label>
          <label>
            <input
              type="checkbox"
              checked={options.freeze}
              onChange={(e) =>
                setOptions((p) => ({ ...p, freeze: e.target.checked }))
              }
            />
            视频不足时定格末帧
          </label>
          <label>
            <input
              type="checkbox"
              checked={options.trimAudio}
              onChange={(e) =>
                setOptions((p) => ({ ...p, trimAudio: e.target.checked }))
              }
            />
            允许裁剪过长配音
          </label>
        </div>
        <div className="film-render-submit">
          <p>
            {missing
              ? `${missing} 个镜头尚未选择画面`
              : `${episode.shots.length} 个镜头已选择画面`}
            <small>
              预览使用 360p，成片 {dimensions.width} × {dimensions.height} · MP4
            </small>
          </p>
          <div>
            <button
              disabled={
                controller.busy ||
                !!missing ||
                !episode.shots.length ||
                !project.workspace ||
                !controller.capability?.available
              }
              onClick={() => {
                setSelectedId("");
                void controller.start(
                  episode.id,
                  "preview",
                  options,
                  selection,
                );
              }}
            >
              <Play size={15} />
              生成预览
            </button>
            <button
              className="film-primary"
              disabled={
                controller.busy ||
                !!missing ||
                !episode.shots.length ||
                !project.workspace ||
                !controller.capability?.available
              }
              onClick={() => {
                setSelectedId("");
                void controller.start(episode.id, "export", options, selection);
              }}
            >
              {controller.starting ? (
                <LoaderCircle className="film-spin" size={15} />
              ) : (
                <Download size={15} />
              )}
              导出成片
            </button>
          </div>
        </div>
        {!project.workspace && (
          <p className="film-muted">请先在顶部选择工作目录。</p>
        )}
        {project.workspace && (
          <p className="film-render-path">
            保存到 {project.workspace.directory}/exports/
          </p>
        )}
        {(!controller.capability?.available || controller.capabilityError) && (
          <p className="film-muted" role="status">
            {controller.capabilityError ||
              controller.capability?.reason ||
              "正在检测宿主合成能力…"}
            <button
              onClick={() => void controller.checkCapability()}
              aria-label="重新检测合成能力"
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
                    ? "提交合成任务…"
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
        {controller.error && (
          <p className="film-error" role="alert">
            {controller.error}
          </p>
        )}
      </section>
      {!!records.length && (
        <section className="film-render-history" aria-label="合成记录">
          <h3>
            合成记录 <small>{records.length}</small>
          </h3>
          {records.map((render) => (
            <article key={render.id}>
              <div>
                <strong>
                  {render.mode === "preview" ? "合成预览" : "导出成片"}
                </strong>
                <small>
                  {new Date(render.createdAt).toLocaleString()} ·{" "}
                  {render.input.width} × {render.input.height} ·{" "}
                  {render.input.fps} fps
                  {render.size
                    ? ` · ${(render.size / 1048576).toFixed(1)} MB`
                    : ""}
                </small>
                {render.error && render.status === "failed" && (
                  <p className="film-error">{render.error}</p>
                )}
              </div>
              <span className={`film-render-status is-${render.status}`}>
                {statusLabel[render.status]}
              </span>
              {render.status === "completed" && (
                <button
                  aria-pressed={selected?.id === render.id}
                  onClick={() => setSelectedId(render.id)}
                >
                  <Play size={13} />
                  {selected?.id === render.id ? "正在预览" : "预览"}
                </button>
              )}
              {!renderPending(render) && (
                <button
                  className="film-icon-button"
                  aria-label={`移除合成记录 ${render.id}`}
                  onClick={() => setRemoving(render)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </article>
          ))}
        </section>
      )}
      <details className="film-render-manifest">
        <summary>制作清单与项目数据</summary>
        <div className="film-section-toolbar">
          <h3>制作计划</h3>
          <button
            disabled={checking}
            onClick={() => {
              setChecking(true);
              setError("");
              void getApplicationHost()
                .executeTool<ReturnType<typeof deliveryReport>>(
                  "film_check_delivery",
                  { project, episodeId: episode.id },
                )
                .then(({ value }) =>
                  setMessage(
                    value.ready
                      ? "制作计划检查通过。"
                      : `发现 ${value.issues.length} 项待完善内容。`,
                  ),
                )
                .catch((error) => setError(String(error)))
                .finally(() => setChecking(false));
            }}
          >
            <FileText size={14} />
            检查制作计划
          </button>
        </div>
        <pre className="film-manifest" tabIndex={0}>
          {manifest}
        </pre>
        <div className="film-actions">
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
        </div>
      </details>
      {message && (
        <p className="film-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="film-error" role="alert">
          {error}
        </p>
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
