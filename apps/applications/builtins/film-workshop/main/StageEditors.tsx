import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "design-system/components/ui/dropdown-menu";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  CircleCheck,
  Copy,
  FileText,
  Image,
  LoaderCircle,
  Plus,
  MoreHorizontal,
  Square,
  Trash2,
  Upload,
  Video,
  Volume2,
} from "lucide-react";
import {
  getApplicationHost,
  writeClipboardText,
} from "@mewvis/app-sdk/browser";
import {
  ASSET_KINDS,
  PROJECT_KINDS,
  blankAsset,
  blankShot,
  deliveryReport,
  moveShot,
  productionManifest,
  removeAsset,
  type AssetKind,
  type FilmAsset,
  type FilmEpisode,
  type FilmProject,
  type FilmGeneration,
  type FilmShot,
  type FlowStep,
} from "./model";
import { MEDIA_CAPABILITIES } from "./capabilities";
import { CapabilityNotice, EmptyState, Field } from "./components/Fields";
import { Dialog } from "./components/Dialog";
import { ShotArtwork } from "./artwork";
import { MediaPanel } from "./components/MediaPanel";
import { GENERATION_TYPES } from "./media";

type Props = {
  project: FilmProject;
  episode: FilmEpisode;
  step: FlowStep;
  selectedShotId?: string;
  onSelectShot?: (id: string) => void;
  onOpenStep?: (step: FlowStep) => void;
  edit: (update: (project: FilmProject) => FilmProject) => void;
  generate?: (
    episodeId: string,
    shotId: string,
    purpose?: FilmGeneration["purpose"],
  ) => Promise<void>;
  generationBusy?: boolean;
  stopGeneration?: (jobId?: string) => Promise<void>;
  generationStarting?: boolean;
  generationStopping?: boolean;
};
export function StageEditor(props: Props) {
  if (props.step === "settings") return <Settings {...props} />;
  if (props.step === "script") return <Script {...props} />;
  if (props.step === "assets") return <Assets {...props} />;
  if (props.step === "storyboard") return <Storyboard {...props} />;
  if (props.step === "video") return <MediaPlan {...props} mode="video" />;
  if (props.step === "dubbing") return <MediaPlan {...props} mode="dubbing" />;
  return <Delivery {...props} />;
}
function updateEpisode(
  props: Props,
  update: (episode: FilmEpisode) => FilmEpisode,
) {
  props.edit((p) => ({
    ...p,
    episodes: p.episodes.map((e) =>
      e.id === props.episode.id ? update(e) : e,
    ),
  }));
}
function updateShot(props: Props, id: string, patch: Partial<FilmShot>) {
  updateEpisode(props, (e) => ({
    ...e,
    shots: e.shots.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  }));
}
function Settings({ project, edit }: Props) {
  return (
    <div className="film-form film-settings">
      <div className="film-field-grid">
        <Field label="项目名称">
          <input
            value={project.title}
            maxLength={120}
            onChange={(e) => edit((p) => ({ ...p, title: e.target.value }))}
          />
        </Field>
        <Field label="创作方向">
          <NativeSelect
            className="w-full"
            value={project.kind}
            onChange={(e) =>
              edit((p) => ({
                ...p,
                kind: e.target.value as FilmProject["kind"],
              }))
            }
          >
            {Object.entries(PROJECT_KINDS).map(([key, label]) => (
              <NativeSelectOption key={key} value={key}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label="画面比例">
        <NativeSelect
          className="w-full"
          value={project.aspectRatio}
          onChange={(e) =>
            edit((p) => ({
              ...p,
              aspectRatio: e.target.value as FilmProject["aspectRatio"],
            }))
          }
        >
          <NativeSelectOption>16:9</NativeSelectOption>
          <NativeSelectOption>9:16</NativeSelectOption>
          <NativeSelectOption>1:1</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field label="故事梗概">
        <textarea
          rows={6}
          value={project.synopsis}
          maxLength={12000}
          placeholder="这是谁的故事？发生了什么，最终改变了什么？"
          onChange={(e) => edit((p) => ({ ...p, synopsis: e.target.value }))}
        />
      </Field>
      <Field
        label="视觉风格"
        hint="统一描述画风、色彩、光线与时代背景，后续镜头沿用这一设定。"
      >
        <textarea
          rows={3}
          value={project.style}
          maxLength={1000}
          placeholder="例如：手绘电影质感，雨夜蓝色与台灯暖色对比"
          onChange={(e) => edit((p) => ({ ...p, style: e.target.value }))}
        />
      </Field>
      <div className="film-note">
        <strong>从一个镜头开始</strong>
        <p>
          先完成一小段剧本、一个角色和一个场景，再整理分镜。各步骤可以随时返回修改。
        </p>
      </div>
      {project.workspace && (
        <Field label="工作目录">
          <input
            readOnly
            value={project.workspace.directory}
            title={project.workspace.directory}
          />
        </Field>
      )}
    </div>
  );
}
function Script(props: Props) {
  const { episode } = props;
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [imported, setImported] = useState<{ name: string; text: string }>();
  return (
    <div className="film-script-editor">
      <div className="film-section-toolbar">
        <span>{episode.script.length.toLocaleString()} 字符</span>
        <button onClick={() => input.current?.click()}>
          <Upload size={16} />
          导入剧本
        </button>
      </div>
      <input
        ref={input}
        className="film-visually-hidden"
        type="file"
        accept=".txt,.md,text/plain,text/markdown"
        aria-label="上传 TXT 或 Markdown 剧本"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setError("");
          if (file.size > 150 * 1024) {
            setError("剧本文件超过 150 KiB，请拆分为多个分集。");
            return;
          }
          void file
            .text()
            .then((text) => {
              if (text.length > 80000 || text.includes("\u0000"))
                throw new Error("请导入不超过 80000 字符的 UTF-8 文本剧本。");
              if (episode.script.trim()) setImported({ name: file.name, text });
              else updateEpisode(props, (e) => ({ ...e, script: text }));
            })
            .catch((error: unknown) =>
              setError(error instanceof Error ? error.message : String(error)),
            );
        }}
      />
      {error && (
        <p className="film-error" role="alert">
          {error}
        </p>
      )}
      <Field label="分集名称">
        <input
          value={episode.title}
          maxLength={120}
          onChange={(event) =>
            updateEpisode(props, (e) => ({ ...e, title: event.target.value }))
          }
        />
      </Field>
      <Field label="本集剧本">
        <textarea
          className="film-script-text"
          value={episode.script}
          maxLength={80000}
          placeholder="内景 / 外景 · 场景 · 时间\n\n画面、动作与对白…"
          onChange={(event) =>
            updateEpisode(props, (e) => ({ ...e, script: event.target.value }))
          }
        />
      </Field>
      {imported && (
        <Dialog title="导入剧本" onClose={() => setImported(undefined)}>
          <p>将「{imported.name}」追加到现有剧本，还是替换当前内容？</p>
          {episode.script.length + imported.text.length + 2 > 80000 && (
            <p className="film-error">
              追加后超过 80000 字符，请选择替换或先拆分剧本。
            </p>
          )}
          <footer>
            <button onClick={() => setImported(undefined)}>取消</button>
            <button
              disabled={
                episode.script.length + imported.text.length + 2 > 80000
              }
              onClick={() => {
                updateEpisode(props, (e) => ({
                  ...e,
                  script: `${e.script}\n\n${imported.text}`,
                }));
                setImported(undefined);
              }}
            >
              追加
            </button>
            <button
              className="film-primary"
              onClick={() => {
                updateEpisode(props, (e) => ({ ...e, script: imported.text }));
                setImported(undefined);
              }}
            >
              替换
            </button>
          </footer>
        </Dialog>
      )}
    </div>
  );
}
function Assets(props: Props) {
  const [kind, setKind] = useState<AssetKind>("character");
  const [selectedId, setSelectedId] = useState("");
  const [removing, setRemoving] = useState<FilmAsset>();
  const items = props.project.assets.filter((a) => a.kind === kind);
  const selected = items.find((a) => a.id === selectedId) ?? items[0];
  const update = (patch: Partial<FilmAsset>) =>
    props.edit((p) => ({
      ...p,
      assets: p.assets.map((a) =>
        a.id === selected?.id ? { ...a, ...patch } : a,
      ),
    }));
  return (
    <div className="film-assets">
      <div className="film-section-toolbar">
        <div className="film-segmented" aria-label="素材类型">
          {Object.entries(ASSET_KINDS).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={kind === id}
              onClick={() => {
                setKind(id as AssetKind);
                setSelectedId("");
              }}
            >
              {label}
              <span>
                {props.project.assets.filter((a) => a.kind === id).length}
              </span>
            </button>
          ))}
        </div>
        <button
          className="film-primary"
          disabled={props.project.assets.length >= 150}
          onClick={() => {
            const asset = blankAsset(kind);
            props.edit((p) => ({ ...p, assets: [...p.assets, asset] }));
            setSelectedId(asset.id);
          }}
        >
          <Plus size={16} />
          添加{ASSET_KINDS[kind]}
        </button>
      </div>
      {selected ? (
        <div className="film-split-editor">
          <div className="film-item-list" aria-label="素材列表">
            {items.map((a) => (
              <button
                key={a.id}
                aria-pressed={a.id === selected.id}
                onClick={() => setSelectedId(a.id)}
              >
                <span className="film-avatar">{a.name.slice(0, 1)}</span>
                <span>
                  <strong>{a.name || "未命名"}</strong>
                  <small>{a.description || "补充形象与设定"}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="film-form">
            <div className="film-editor-heading">
              <h3>{ASSET_KINDS[kind]}设定</h3>
              <button
                className="film-icon-button film-danger"
                aria-label={`删除${ASSET_KINDS[kind]}`}
                onClick={() => setRemoving(selected)}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <Field label={`${ASSET_KINDS[kind]}名称`}>
              <input
                value={selected.name}
                maxLength={120}
                onChange={(e) => update({ name: e.target.value })}
              />
            </Field>
            <Field label="外观与设定">
              <textarea
                rows={5}
                value={selected.description}
                maxLength={12000}
                placeholder="描述辨识特征、服装、环境或用途…"
                onChange={(e) => update({ description: e.target.value })}
              />
            </Field>
            <Field label="素材图片提示词">
              <textarea
                rows={4}
                value={selected.prompt}
                maxLength={12000}
                onChange={(e) => update({ prompt: e.target.value })}
              />
            </Field>
            <Field label="参考文件备注">
              <input
                value={selected.reference}
                maxLength={1000}
                onChange={(e) => update({ reference: e.target.value })}
              />
            </Field>
            <MediaPanel
              project={props.project}
              ids={selected.mediaIds ?? []}
              onImport={(media) =>
                props.edit((project) => ({
                  ...project,
                  media: [...(project.media ?? []), media],
                  assets: project.assets.map((asset) =>
                    asset.id === selected.id
                      ? {
                          ...asset,
                          mediaIds: [...(asset.mediaIds ?? []), media.id],
                        }
                      : asset,
                  ),
                }))
              }
              onDetach={(id) =>
                update({
                  mediaIds: selected.mediaIds?.filter((value) => value !== id),
                })
              }
            />
          </div>
        </div>
      ) : (
        <EmptyState
          title={`建立${ASSET_KINDS[kind]}素材`}
          text="素材在整个项目中共享，分镜可以引用同一角色和场景，保持设定一致。"
        />
      )}
      {removing && (
        <Dialog
          title={`删除${ASSET_KINDS[removing.kind]}`}
          onClose={() => setRemoving(undefined)}
        >
          <p>
            删除「{removing.name}
            」会同时解除分镜中的相关引用，保留镜头内容和台词。
          </p>
          <footer>
            <button onClick={() => setRemoving(undefined)}>取消</button>
            <button
              className="film-danger"
              onClick={() => {
                props.edit((p) => removeAsset(p, removing.id));
                setRemoving(undefined);
              }}
            >
              确认删除
            </button>
          </footer>
        </Dialog>
      )}
    </div>
  );
}
function Storyboard(props: Props) {
  const [removing, setRemoving] = useState(false);
  const shot =
    props.episode.shots.find((s) => s.id === props.selectedShotId) ??
    props.episode.shots.at(-1);
  const index = shot
    ? props.episode.shots.findIndex((s) => s.id === shot.id)
    : -1;
  const scenes = props.project.assets.filter((a) => a.kind === "scene");
  const characters = props.project.assets.filter((a) => a.kind === "character");
  const patch = (value: Partial<FilmShot>) => {
    if (shot) updateShot(props, shot.id, value);
  };
  if (!shot)
    return (
      <EmptyState
        title="把剧本拆成镜头"
        text="从左侧目录添加镜头，记录画面、时长、景别和素材引用。"
      />
    );
  const references = props.project.assets.filter(
    (a) => a.id === shot.sceneId || shot.characterIds.includes(a.id),
  );
  return (
    <article className="film-focused-shot">
      <header className="film-focused-heading">
        <div>
          <span>镜头 {String(index + 1).padStart(2, "0")}</span>
          <h3>{shot.title || "未命名镜头"}</h3>
          <p>
            {references.map((a) => a.name).join(" · ") || "尚未关联角色与场景"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="film-icon-button" aria-label="镜头操作">
              <MoreHorizontal size={18} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="film-popup">
            <DropdownMenuItem
              aria-label={`上移镜头 ${index + 1}`}
              disabled={index === 0}
              onSelect={() =>
                updateEpisode(props, (e) => moveShot(e, shot.id, -1))
              }
            >
              <ArrowUp size={16} />
              上移镜头
            </DropdownMenuItem>
            <DropdownMenuItem
              aria-label={`下移镜头 ${index + 1}`}
              disabled={index === props.episode.shots.length - 1}
              onSelect={() =>
                updateEpisode(props, (e) => moveShot(e, shot.id, 1))
              }
            >
              <ArrowDown size={16} />
              下移镜头
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setRemoving(true)}
            >
              <Trash2 size={16} />
              删除镜头
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div
        className="film-shot-preview"
        style={{ aspectRatio: props.project.aspectRatio.replace(":", " / ") }}
      >
        <ShotArtwork project={props.project} shot={shot} />
      </div>
      <div className="film-focused-fields">
        <Field label="画面内容">
          <textarea
            rows={2}
            maxLength={12000}
            value={shot.description}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </Field>
        <div className="film-focused-camera">
          <Field label="景别">
            <NativeSelect
              className="w-full"
              value={shot.framing}
              onChange={(e) => patch({ framing: e.target.value })}
            >
              {["远景", "全景", "中景", "近景", "特写"].map((v) => (
                <NativeSelectOption key={v}>{v}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label="运镜">
            <input
              value={shot.camera}
              maxLength={120}
              onChange={(e) => patch({ camera: e.target.value })}
            />
          </Field>
          <Field label="时长（秒）">
            <input
              type="number"
              min={0.5}
              max={120}
              step={0.5}
              value={shot.duration}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value) && value >= 0.5 && value <= 120)
                  patch({ duration: value });
              }}
            />
          </Field>
        </div>
        <Field label="台词">
          <textarea
            rows={2}
            maxLength={12000}
            value={shot.dialogue}
            placeholder="这个镜头中角色说了什么？"
            onChange={(e) => patch({ dialogue: e.target.value })}
          />
        </Field>
        <details className="film-focused-options">
          <summary>名称、场景与角色</summary>
          <div className="film-field-grid">
            <Field label="镜头名称">
              <input
                maxLength={120}
                value={shot.title}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </Field>
            <Field label="场景">
              <NativeSelect
                className="w-full"
                value={shot.sceneId}
                onChange={(e) => patch({ sceneId: e.target.value })}
              >
                <NativeSelectOption value="">未指定场景</NativeSelectOption>
                {scenes.map((a) => (
                  <NativeSelectOption key={a.id} value={a.id}>
                    {a.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <fieldset className="film-character-options">
            <legend>出镜角色</legend>
            {characters.length ? (
              characters.map((a) => (
                <label key={a.id}>
                  <input
                    type="checkbox"
                    checked={shot.characterIds.includes(a.id)}
                    onChange={(e) =>
                      patch({
                        characterIds: e.target.checked
                          ? [...shot.characterIds, a.id]
                          : shot.characterIds.filter((id) => id !== a.id),
                      })
                    }
                  />
                  {a.name}
                </label>
              ))
            ) : (
              <p>先到素材准备添加角色。</p>
            )}
          </fieldset>
        </details>
        <section className="film-image-generation">
          <Field label="分镜图片提示词">
            <textarea
              rows={3}
              maxLength={12000}
              value={shot.imagePrompt}
              onChange={(e) => patch({ imagePrompt: e.target.value })}
            />
          </Field>
          <Field label="分镜图片文件备注">
            <input
              maxLength={1000}
              value={shot.imageReference}
              onChange={(e) => patch({ imageReference: e.target.value })}
            />
          </Field>
          <GenerationControls
            {...props}
            shot={shot}
            purpose="image-generation"
          />
          <ShotMediaPanel {...props} shot={shot} purpose="image-generation" />
        </section>
      </div>
      {removing && (
        <Dialog title="删除镜头" onClose={() => setRemoving(false)}>
          <p>删除「{shot.title}」及其提示词、配音计划和文件备注？</p>
          <footer>
            <button onClick={() => setRemoving(false)}>取消</button>
            <button
              className="film-danger"
              onClick={() => {
                updateEpisode(props, (e) => ({
                  ...e,
                  shots: e.shots.filter((s) => s.id !== shot.id),
                }));
                setRemoving(false);
              }}
            >
              确认删除
            </button>
          </footer>
        </Dialog>
      )}
    </article>
  );
}
function GenerationControls(
  props: Props & { shot: FilmShot; purpose: FilmGeneration["purpose"] },
) {
  const { shot, purpose } = props;
  const type = GENERATION_TYPES[purpose];
  const job = props.project.generations
    ?.filter(
      (job) =>
        job.episodeId === props.episode.id &&
        job.shotId === shot.id &&
        (job.purpose ?? "image-generation") === purpose,
    )
    .at(-1);
  const running = !!job && ["preparing", "running"].includes(job.status);
  const status = running
    ? props.generationStopping
      ? "正在停止…"
      : job.status === "preparing"
        ? "准备中…"
        : "生成中…"
    : props.generationBusy
      ? "其他任务进行中"
      : job?.status === "completed"
        ? "已保存"
        : job?.status === "failed"
          ? "生成失败"
          : job?.status === "stopped"
            ? "已停止"
            : "";
  const tone = running || props.generationBusy ? "running" : job?.status;
  const StatusIcon =
    tone === "running"
      ? LoaderCircle
      : tone === "completed"
        ? CircleCheck
        : tone === "failed"
          ? CircleAlert
          : Square;
  const GenerateIcon =
    purpose === "video-generation"
      ? Video
      : purpose === "speech"
        ? Volume2
        : Image;
  const label = purpose === "video-generation" ? "视频片段" : type.label;
  const canStop = running && !!props.stopGeneration;
  return (
    <div
      className="film-generation-controls"
      role="group"
      aria-label={`${type.label}生成操作`}
    >
      <button
        type="button"
        className={`film-generation-trigger${canStop ? " film-generation-stop" : " film-primary"}`}
        disabled={
          canStop
            ? props.generationStarting || props.generationStopping
            : !props.generate ||
              !props.project.workspace ||
              props.generationBusy
        }
        onClick={() => {
          if (canStop) void props.stopGeneration?.(job?.id);
          else void props.generate?.(props.episode.id, shot.id, purpose);
        }}
      >
        {canStop ? (
          <Square size={13} aria-hidden />
        ) : (
          <GenerateIcon size={15} aria-hidden />
        )}
        {canStop
          ? props.generationStopping
            ? "停止中…"
            : "停止生成"
          : `生成${label}`}
      </button>
      <div className="film-generation-feedback">
        <span
          className="film-generation-status"
          data-state={tone}
          role="status"
        >
          {status && (
            <>
              <StatusIcon size={14} aria-hidden />
              {status}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
function ShotMediaPanel(
  props: Props & { shot: FilmShot; purpose: FilmGeneration["purpose"] },
) {
  const { shot } = props;
  const type = GENERATION_TYPES[props.purpose];
  return (
    <MediaPanel
      project={props.project}
      kind={type.kind}
      ids={shot.mediaIds ?? []}
      activeId={shot[type.field]}
      onImport={(media) =>
        props.edit((project) => ({
          ...project,
          media: [...(project.media ?? []), media],
          episodes: project.episodes.map((episode) =>
            episode.id !== props.episode.id
              ? episode
              : {
                  ...episode,
                  shots: episode.shots.map((item) =>
                    item.id !== shot.id
                      ? item
                      : {
                          ...item,
                          mediaIds: [...(item.mediaIds ?? []), media.id],
                          [type.field]: media.id,
                        },
                  ),
                },
          ),
        }))
      }
      onSelect={(id) => updateShot(props, shot.id, { [type.field]: id })}
      onDetach={(id) =>
        updateShot(props, shot.id, {
          mediaIds: shot.mediaIds?.filter((value) => value !== id),
          ...(shot[type.field] === id ? { [type.field]: undefined } : {}),
        })
      }
    />
  );
}
function MediaPlan(props: Props & { mode: "video" | "dubbing" }) {
  const video = props.mode === "video",
    characters = props.project.assets.filter((a) => a.kind === "character");
  return (
    <div className="film-media-plan">
      {props.project.kind === "comic" && (
        <p className="film-muted">
          静态漫画可以跳过视频与配音，直接整理制作清单。
        </p>
      )}
      {props.episode.shots.length ? (
        props.episode.shots
          .filter(
            (shot) =>
              shot.id ===
              (props.selectedShotId || props.episode.shots.at(-1)?.id),
          )
          .map((shot) => {
            const index = props.episode.shots.findIndex(
              (s) => s.id === shot.id,
            );
            return (
              <article className="film-plan-card" key={shot.id}>
                <header>
                  <span className="film-shot-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3>{shot.title}</h3>
                    <p>
                      {shot.framing} · {shot.duration} 秒
                    </p>
                  </div>
                  <span className="film-tag">
                    {video ? "镜头视频" : "角色配音"}
                  </span>
                </header>
                {video ? (
                  <>
                    <p className="film-shot-description">
                      {shot.description || "画面内容待补充"}
                    </p>
                    <Field label={`镜头 ${index + 1} 视频提示词`}>
                      <textarea
                        rows={3}
                        value={shot.videoPrompt}
                        maxLength={12000}
                        onChange={(e) =>
                          updateShot(props, shot.id, {
                            videoPrompt: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label={`镜头 ${index + 1} 视频文件备注`}>
                      <input
                        value={shot.videoReference}
                        maxLength={1000}
                        onChange={(e) =>
                          updateShot(props, shot.id, {
                            videoReference: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <p className="film-muted">
                      {shot.imageMediaId
                        ? "使用当前分镜图片作为首帧生成视频。"
                        : "未选择分镜图片，将使用文字生成视频。"}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="film-field-grid">
                      <Field label={`镜头 ${index + 1} 说话角色`}>
                        <NativeSelect
                          className="w-full"
                          value={shot.speakerId}
                          onChange={(e) =>
                            updateShot(props, shot.id, {
                              speakerId: e.target.value,
                            })
                          }
                        >
                          <NativeSelectOption value="">
                            未指定角色
                          </NativeSelectOption>
                          {characters.map((a) => (
                            <NativeSelectOption key={a.id} value={a.id}>
                              {a.name}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field label={`镜头 ${index + 1} 音色备注`}>
                        <input
                          value={shot.voice}
                          maxLength={1000}
                          onChange={(e) =>
                            updateShot(props, shot.id, {
                              voice: e.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                    <Field label={`镜头 ${index + 1} 台词`}>
                      <textarea
                        rows={3}
                        value={shot.dialogue}
                        maxLength={12000}
                        readOnly
                        placeholder="此镜头暂无台词"
                        aria-describedby={`dialogue-source-${shot.id}`}
                      />
                    </Field>
                    <p
                      className="film-dialogue-source"
                      id={`dialogue-source-${shot.id}`}
                    >
                      {shot.dialogue.trim()
                        ? "台词沿用分镜设计。"
                        : "当前镜头没有台词，可填写台词，或点击生成由助手询问。"}
                      {props.onOpenStep && (
                        <button
                          type="button"
                          className="film-text-button"
                          onClick={() => props.onOpenStep?.("storyboard")}
                        >
                          {shot.dialogue.trim() ? "编辑台词" : "填写台词"}
                        </button>
                      )}
                    </p>
                    <Field label={`镜头 ${index + 1} 声音设计`}>
                      <input
                        value={shot.sound}
                        maxLength={12000}
                        onChange={(e) =>
                          updateShot(props, shot.id, { sound: e.target.value })
                        }
                      />
                    </Field>
                    <Field label={`镜头 ${index + 1} 音频文件备注`}>
                      <input
                        value={shot.audioReference}
                        maxLength={1000}
                        onChange={(e) =>
                          updateShot(props, shot.id, {
                            audioReference: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <p className="film-muted">
                      台词原样朗读；音色备注用于选择模型支持的音色。背景音乐和音画合成后续接入。
                    </p>
                  </>
                )}
                <GenerationControls
                  {...props}
                  shot={shot}
                  purpose={video ? "video-generation" : "speech"}
                />
                <ShotMediaPanel
                  {...props}
                  shot={shot}
                  purpose={video ? "video-generation" : "speech"}
                />
              </article>
            );
          })
      ) : (
        <EmptyState
          title="先准备分镜"
          text="分镜创建后，可以在这里逐镜头编辑生成提示词与配音计划。"
        />
      )}
    </div>
  );
}
function Delivery({ project, episode }: Props) {
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const report = deliveryReport(project, episode),
    manifest = productionManifest(project, episode);
  const copy = async (text: string, label: string) => {
    setError("");
    setMessage("");
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
      <div className="film-delivery-summary">
        <div>
          <span>预计时长</span>
          <strong>
            {report.duration}
            <small> 秒</small>
          </strong>
        </div>
        <div>
          <span>镜头总数</span>
          <strong>{report.shots}</strong>
        </div>
        <div>
          <span>制作计划</span>
          <strong className="film-summary-label">
            {report.ready ? "已准备" : "待完善"}
          </strong>
        </div>
      </div>
      <CapabilityNotice text={MEDIA_CAPABILITIES.preview.reason} />
      <div className="film-timeline" aria-label="制作时间轴">
        {episode.shots.map((shot, index) => {
          const start = time;
          time += shot.duration;
          return (
            <div className="film-timeline-shot" key={shot.id}>
              <span>
                {start}–{time}s
              </span>
              <div>
                <span className="film-shot-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3>{shot.title}</h3>
                <p>{shot.description || "画面内容待补充"}</p>
                <small>{shot.dialogue || "无台词"}</small>
              </div>
            </div>
          );
        })}
      </div>
      {!episode.shots.length && (
        <EmptyState
          title="时间轴等待第一个镜头"
          text="添加分镜后，按镜头顺序展示画面、台词和预计时长。"
        />
      )}
      {report.issues.length > 0 && (
        <section className="film-note">
          <h3>待完善的内容</h3>
          <ul>
            {report.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="film-section-toolbar">
        <h3>制作清单</h3>
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError("");
            setMessage("");
            void getApplicationHost()
              .executeTool<ReturnType<typeof deliveryReport>>(
                "film_check_delivery",
                { project, episodeId: episode.id },
              )
              .then(({ value }) =>
                setMessage(
                  value.ready
                    ? "制作计划检查通过；此检查不校验媒体内容或成片。"
                    : `发现 ${value.issues.length} 项待完善内容。`,
                ),
              )
              .catch((error: unknown) =>
                setError(
                  error instanceof Error ? error.message : String(error),
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          <FileText size={16} />
          {busy ? "检查中…" : "检查制作计划"}
        </button>
      </div>
      <pre className="film-manifest" tabIndex={0}>
        {manifest}
      </pre>
      <div className="film-actions">
        <button onClick={() => void copy(manifest, "制作清单")}>
          <Copy size={16} />
          复制制作清单
        </button>
        <button onClick={() => void copy(JSON.stringify(project), "项目 JSON")}>
          <Copy size={16} />
          复制项目 JSON
        </button>
        <button disabled>导出成片</button>
      </div>
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
      <CapabilityNotice text={MEDIA_CAPABILITIES.compose.reason} />
    </div>
  );
}
