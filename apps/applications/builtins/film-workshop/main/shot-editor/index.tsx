import { useState } from "react";
import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "design-system/components/ui/dropdown-menu";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import {
  FLOW_STEPS,
  moveShot,
  type FilmEpisode,
  type FilmGeneration,
  type FilmMedia,
  type FilmProject,
  type FilmShot,
  type FlowStep,
} from "../model";
import { GENERATION_TYPES } from "../media";
import { Dialog } from "../components/Dialog";
import { EmptyState, Field } from "../components/Fields";
import { GenerationControls } from "./controls";
import { ShotMedia } from "./media";
import { MediaVersions } from "./versions";
import "./style.css";

export type ShotEditorProps = {
  project: FilmProject;
  episode: FilmEpisode;
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
type Mode = "storyboard" | "video" | "dubbing";

export function ShotEditor(props: ShotEditorProps & { mode: Mode }) {
  const { project, episode, mode } = props;
  const [tab, setTab] = useState<"creation" | "shot">("creation");
  const [removing, setRemoving] = useState<FilmShot>();
  const shot =
    episode.shots.find((s) => s.id === props.selectedShotId) ??
    episode.shots.at(-1);
  if (!shot)
    return (
      <EmptyState
        title="把剧本拆成镜头"
        text="从左侧目录添加镜头，记录画面、时长、景别和素材引用。"
      />
    );
  const index = episode.shots.findIndex((s) => s.id === shot.id);
  const purpose =
    mode === "storyboard"
      ? "image-generation"
      : mode === "video"
        ? "video-generation"
        : "speech";
  const type = GENERATION_TYPES[purpose];
  const versions =
    project.media?.filter(
      (media) => shot.mediaIds?.includes(media.id) && media.kind === type.kind,
    ) ?? [];
  const selected = versions.find((media) => media.id === shot[type.field]);
  const stepIndex = FLOW_STEPS.findIndex((step) => step.id === mode);
  const title = FLOW_STEPS[stepIndex].title;
  const characters = project.assets.filter(
    (asset) => asset.kind === "character",
  );
  const scenes = project.assets.filter((asset) => asset.kind === "scene");
  const changeEpisode = (update: (value: FilmEpisode) => FilmEpisode) =>
    props.edit((current) => ({
      ...current,
      episodes: current.episodes.map((value) =>
        value.id === episode.id ? update(value) : value,
      ),
    }));
  const changeShot = (update: (value: FilmShot) => FilmShot) =>
    changeEpisode((current) => ({
      ...current,
      shots: current.shots.map((value) =>
        value.id === shot.id ? update(value) : value,
      ),
    }));
  const patch = (value: Partial<FilmShot>) =>
    changeShot((current) => ({ ...current, ...value }));
  const attach = (media: FilmMedia) =>
    props.edit((current) => {
      if (
        !current.episodes
          .find((value) => value.id === episode.id)
          ?.shots.some((value) => value.id === shot.id)
      )
        return current;
      return {
        ...current,
        media: [...(current.media ?? []), media],
        episodes: current.episodes.map((value) =>
          value.id !== episode.id
            ? value
            : {
                ...value,
                shots: value.shots.map((item) =>
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
      };
    });
  const referenceField =
    mode === "storyboard"
      ? "imageReference"
      : mode === "video"
        ? "videoReference"
        : "audioReference";
  const referenceLabel =
    mode === "storyboard"
      ? "分镜图片文件备注"
      : `镜头 ${index + 1} ${mode === "video" ? "视频" : "音频"}文件备注`;
  return (
    <article className="film-shot-editor" data-mode={mode}>
      <header className="film-shot-editor-heading">
        <h2>{title}</h2>
        <MediaVersions
          key={`${shot.id}:${purpose}`}
          label={type.label}
          versions={versions}
          selected={selected}
          onSelect={(id) => patch({ [type.field]: id })}
          onDetach={(id) =>
            changeShot((value) => ({
              ...value,
              mediaIds: value.mediaIds?.filter((item) => item !== id),
              ...(value[type.field] === id ? { [type.field]: undefined } : {}),
            }))
          }
        />
        <span className="film-shot-editor-context" title={shot.title}>
          镜头 {String(index + 1).padStart(2, "0")}{" "}
          <span>/ {episode.shots.length}</span>
          <b>{shot.title || "未命名镜头"}</b>
        </span>
        <div className="film-shot-navigation">
          <button
            className="film-icon-button"
            aria-label="上一个镜头"
            disabled={index === 0}
            onClick={() => props.onSelectShot?.(episode.shots[index - 1].id)}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="film-icon-button"
            aria-label="下一个镜头"
            disabled={index === episode.shots.length - 1}
            onClick={() => props.onSelectShot?.(episode.shots[index + 1].id)}
          >
            <ChevronRight size={16} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="film-icon-button" aria-label="镜头操作">
                <MoreHorizontal size={17} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="film-popup">
              <DropdownMenuItem
                aria-label={`上移镜头 ${index + 1}`}
                disabled={index === 0}
                onSelect={() =>
                  changeEpisode((value) => moveShot(value, shot.id, -1))
                }
              >
                <ArrowUp size={15} />
                上移镜头
              </DropdownMenuItem>
              <DropdownMenuItem
                aria-label={`下移镜头 ${index + 1}`}
                disabled={index === episode.shots.length - 1}
                onSelect={() =>
                  changeEpisode((value) => moveShot(value, shot.id, 1))
                }
              >
                <ArrowDown size={15} />
                下移镜头
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setRemoving(shot)}
              >
                <Trash2 size={15} />
                删除镜头
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <div className="film-shot-editor-layout">
        <ShotMedia
          key={`${shot.id}:${purpose}`}
          project={project}
          shot={shot}
          purpose={purpose}
          onImport={attach}
          selected={selected}
        />
        <aside className="film-shot-inspector" aria-label="镜头参数">
          <div
            className="film-shot-inspector-tabs"
            role="tablist"
            aria-label="参数分类"
          >
            {(
              [
                ["creation", "创作参数"],
                ["shot", "镜头信息"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                id={`film-shot-tab-${value}`}
                role="tab"
                aria-selected={tab === value}
                aria-controls="film-shot-parameters"
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            className="film-shot-inspector-body"
            role="tabpanel"
            id="film-shot-parameters"
            aria-labelledby={`film-shot-tab-${tab}`}
          >
            {tab === "creation" ? (
              <>
                {mode === "storyboard" ? (
                  <>
                    <Field label="画面内容">
                      <textarea
                        rows={3}
                        maxLength={12000}
                        value={shot.description}
                        onChange={(event) =>
                          patch({ description: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="分镜图片提示词">
                      <textarea
                        rows={5}
                        maxLength={12000}
                        value={shot.imagePrompt}
                        placeholder="画面风格、人物、构图与光线…"
                        onChange={(event) =>
                          patch({ imagePrompt: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="台词">
                      <textarea
                        rows={3}
                        maxLength={12000}
                        value={shot.dialogue}
                        placeholder="这个镜头中角色说了什么？"
                        onChange={(event) =>
                          patch({ dialogue: event.target.value })
                        }
                      />
                    </Field>
                  </>
                ) : mode === "video" ? (
                  <>
                    <Field label={`镜头 ${index + 1} 视频提示词`}>
                      <textarea
                        rows={6}
                        maxLength={12000}
                        value={shot.videoPrompt}
                        placeholder="描述镜头运动、人物动作与画面变化…"
                        onChange={(event) =>
                          patch({ videoPrompt: event.target.value })
                        }
                      />
                    </Field>
                    <div className="film-shot-source">
                      <span>画面内容</span>
                      <p>{shot.description || "画面内容待补充"}</p>
                    </div>
                    <p className="film-shot-input-hint">
                      {shot.imageMediaId
                        ? "使用当前分镜图片作为首帧。"
                        : "未选择分镜图片，使用文字生成视频。"}
                    </p>
                    <button
                      className="film-shot-edit-link"
                      onClick={() => props.onOpenStep?.("storyboard")}
                    >
                      编辑分镜与首帧
                      <ArrowRight size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <Field label={`镜头 ${index + 1} 说话角色`}>
                      <NativeSelect
                        value={shot.speakerId}
                        onChange={(event) =>
                          patch({ speakerId: event.target.value })
                        }
                      >
                        <NativeSelectOption value="">
                          未指定角色
                        </NativeSelectOption>
                        {characters.map((asset) => (
                          <NativeSelectOption key={asset.id} value={asset.id}>
                            {asset.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label={`镜头 ${index + 1} 音色备注`}>
                      <input
                        value={shot.voice}
                        maxLength={1000}
                        placeholder="音色、语气与朗读节奏"
                        onChange={(event) =>
                          patch({ voice: event.target.value })
                        }
                      />
                    </Field>
                    <Field label={`镜头 ${index + 1} 台词`}>
                      <textarea
                        rows={4}
                        maxLength={12000}
                        value={shot.dialogue}
                        readOnly
                        placeholder="此镜头暂无台词"
                        aria-describedby={`dialogue-source-${shot.id}`}
                      />
                    </Field>
                    <div
                      className="film-shot-dialogue-source"
                      id={`dialogue-source-${shot.id}`}
                    >
                      <span>
                        {shot.dialogue.trim()
                          ? "沿用分镜台词，原样朗读。"
                          : "没有台词时，生成前由助手询问。"}
                      </span>
                      <button onClick={() => props.onOpenStep?.("storyboard")}>
                        {shot.dialogue.trim() ? "编辑台词" : "填写台词"}
                        <ArrowRight size={12} />
                      </button>
                    </div>
                    <Field label={`镜头 ${index + 1} 声音设计`}>
                      <textarea
                        rows={2}
                        maxLength={12000}
                        value={shot.sound}
                        onChange={(event) =>
                          patch({ sound: event.target.value })
                        }
                      />
                    </Field>
                  </>
                )}
              </>
            ) : (
              <>
                <Field label="镜头名称">
                  <input
                    value={shot.title}
                    maxLength={120}
                    onChange={(event) => patch({ title: event.target.value })}
                  />
                </Field>
                <div className="film-shot-camera-fields">
                  <Field label="景别">
                    <NativeSelect
                      value={shot.framing}
                      onChange={(event) =>
                        patch({ framing: event.target.value })
                      }
                    >
                      {["远景", "全景", "中景", "近景", "特写"].map((value) => (
                        <NativeSelectOption key={value}>
                          {value}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="时长（秒）">
                    <input
                      type="number"
                      min={0.5}
                      max={120}
                      step={0.5}
                      value={shot.duration}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (
                          Number.isFinite(value) &&
                          value >= 0.5 &&
                          value <= 120
                        )
                          patch({ duration: value });
                      }}
                    />
                  </Field>
                </div>
                <Field label="运镜">
                  <input
                    value={shot.camera}
                    maxLength={120}
                    onChange={(event) => patch({ camera: event.target.value })}
                  />
                </Field>
                <Field label="场景">
                  <NativeSelect
                    value={shot.sceneId}
                    onChange={(event) => patch({ sceneId: event.target.value })}
                  >
                    <NativeSelectOption value="">未指定场景</NativeSelectOption>
                    {scenes.map((asset) => (
                      <NativeSelectOption key={asset.id} value={asset.id}>
                        {asset.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <fieldset className="film-shot-characters">
                  <legend>出镜角色</legend>
                  {characters.length ? (
                    characters.map((asset) => (
                      <label key={asset.id}>
                        <input
                          type="checkbox"
                          checked={shot.characterIds.includes(asset.id)}
                          onChange={(event) =>
                            changeShot((value) => ({
                              ...value,
                              characterIds: event.target.checked
                                ? [
                                    ...new Set([
                                      ...value.characterIds,
                                      asset.id,
                                    ]),
                                  ]
                                : value.characterIds.filter(
                                    (id) => id !== asset.id,
                                  ),
                            }))
                          }
                        />
                        {asset.name}
                      </label>
                    ))
                  ) : (
                    <p className="film-muted">先到素材准备添加角色。</p>
                  )}
                </fieldset>
                <Field label={referenceLabel}>
                  <input
                    maxLength={1000}
                    value={shot[referenceField]}
                    onChange={(event) =>
                      patch({ [referenceField]: event.target.value })
                    }
                  />
                </Field>
              </>
            )}
          </div>
          <div className="film-shot-inspector-actions">
            <GenerationControls {...props} shot={shot} purpose={purpose} />
          </div>
        </aside>
      </div>
      <footer className="film-shot-editor-footer">
        <button
          className="film-shot-step-link"
          aria-label={`上一步：${FLOW_STEPS[stepIndex - 1].title}`}
          title={`上一步：${FLOW_STEPS[stepIndex - 1].title}`}
          onClick={() => props.onOpenStep?.(FLOW_STEPS[stepIndex - 1].id)}
        >
          <ArrowLeft size={15} />
          上一步：{FLOW_STEPS[stepIndex - 1].title}
        </button>
        <span>
          {shot.framing} · {shot.duration} 秒 · {project.aspectRatio}
        </span>
        <button
          className="film-shot-step-link"
          onClick={() => props.onOpenStep?.(FLOW_STEPS[stepIndex + 1].id)}
        >
          下一步：{FLOW_STEPS[stepIndex + 1].title}
          <ArrowRight size={13} />
        </button>
      </footer>
      {removing && (
        <Dialog title="删除镜头" onClose={() => setRemoving(undefined)}>
          <p>删除「{removing.title}」及其提示词、配音计划和文件备注？</p>
          <footer>
            <button onClick={() => setRemoving(undefined)}>取消</button>
            <button
              className="film-danger"
              onClick={() => {
                changeEpisode((value) => ({
                  ...value,
                  shots: value.shots.filter((item) => item.id !== removing.id),
                }));
                setRemoving(undefined);
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
