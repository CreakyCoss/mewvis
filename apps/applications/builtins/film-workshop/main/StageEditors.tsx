import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "design-system/components/ui/dropdown-menu";
import {
  Box,
  Image,
  ImagePlus,
  Plus,
  MoreHorizontal,
  MapPin,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import {
  ASSET_KINDS,
  PROJECT_KINDS,
  blankAsset,
  removeAsset,
  type AssetKind,
  type FilmAsset,
  type FilmEpisode,
  type FilmProject,
  type FlowStep,
} from "./model";
import { EmptyState, Field } from "./components/Fields";
import { Delivery } from "./delivery";
import type { DeliveryController } from "./delivery/useDelivery";
import { Dialog } from "./components/Dialog";
import { LocalPreview, MediaPanel } from "./components/MediaPanel";
import { mediaPath } from "./media";
import { ShotEditor, type ShotEditorProps } from "./shot-editor";

type Props = ShotEditorProps & { step: FlowStep; delivery: DeliveryController };
export function StageEditor(props: Props) {
  if (props.step === "settings") return <Settings {...props} />;
  if (props.step === "script") return <Script {...props} />;
  if (props.step === "assets") return <Assets {...props} />;
  if (["storyboard", "video", "dubbing"].includes(props.step))
    return (
      <ShotEditor
        {...props}
        mode={props.step as "storyboard" | "video" | "dubbing"}
      />
    );
  return <Delivery {...props} controller={props.delivery} />;
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
  const strip = useRef<HTMLDivElement>(null);
  const items = props.project.assets.filter((a) => a.kind === kind);
  const selected = items.find((a) => a.id === selectedId) ?? items[0];
  useEffect(() => {
    const rail = strip.current;
    const active = rail?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!rail || !active) return;
    const item = active.getBoundingClientRect();
    const viewport = rail.getBoundingClientRect();
    if (item.left < viewport.left) rail.scrollLeft += item.left - viewport.left;
    else if (item.right > viewport.right)
      rail.scrollLeft += item.right - viewport.right;
  }, [selected?.id]);
  const icons = { character: UserRound, scene: MapPin, prop: Box };
  const Icon = icons[kind];
  const references = (props.project.media ?? []).filter((media) =>
    selected?.mediaIds?.includes(media.id),
  );
  const usedBy = props.project.episodes.reduce(
    (count, episode) =>
      count +
      episode.shots.filter(
        (shot) =>
          shot.sceneId === selected?.id ||
          shot.characterIds.includes(selected?.id ?? ""),
      ).length,
    0,
  );
  const add = () => {
    const asset = blankAsset(kind);
    props.edit((p) => ({ ...p, assets: [...p.assets, asset] }));
    setSelectedId(asset.id);
  };
  const update = (patch: Partial<FilmAsset>) =>
    props.edit((p) => ({
      ...p,
      assets: p.assets.map((a) =>
        a.id === selected?.id ? { ...a, ...patch } : a,
      ),
    }));
  return (
    <div className="film-assets">
      <div className="film-assets-toolbar">
        <div className="film-asset-tabs" role="group" aria-label="素材类型">
          {Object.entries(ASSET_KINDS).map(([id, label]) => {
            const KindIcon = icons[id as AssetKind];
            return (
              <button
                key={id}
                type="button"
                aria-pressed={kind === id}
                onClick={() => {
                  setKind(id as AssetKind);
                  setSelectedId("");
                }}
              >
                <KindIcon size={15} aria-hidden />
                {label}
                <span>
                  {props.project.assets.filter((a) => a.kind === id).length}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="film-primary film-asset-add"
          aria-label={`添加${ASSET_KINDS[kind]}`}
          title={`添加${ASSET_KINDS[kind]}`}
          disabled={props.project.assets.length >= 150}
          onClick={add}
        >
          <Plus size={16} />
          <span>添加{ASSET_KINDS[kind]}</span>
        </button>
      </div>
      {selected ? (
        <>
          <div
            ref={strip}
            className="film-asset-strip"
            role="group"
            aria-label="素材列表"
          >
            {items.map((asset) => {
              const cover = props.project.media?.find(
                (media) =>
                  asset.mediaIds?.includes(media.id) && media.kind === "image",
              );
              return (
                <button
                  key={asset.id}
                  type="button"
                  aria-pressed={asset.id === selected.id}
                  onClick={() => setSelectedId(asset.id)}
                >
                  <span className="film-asset-thumbnail" aria-hidden>
                    {cover && props.project.workspace ? (
                      <LocalPreview
                        filePath={mediaPath(props.project, cover)}
                      />
                    ) : (
                      <Icon size={20} />
                    )}
                  </span>
                  <span className="film-asset-summary">
                    <strong>{asset.name || "未命名"}</strong>
                    <small>{asset.description || "待补充设定"}</small>
                  </span>
                </button>
              );
            })}
          </div>
          <article
            className="film-asset-detail"
            aria-label={`${ASSET_KINDS[kind]}设定`}
          >
            <header className="film-asset-detail-header">
              <div className="film-asset-identity">
                <span>{ASSET_KINDS[kind]}设定</span>
                <Field label={`${ASSET_KINDS[kind]}名称`}>
                  <input
                    value={selected.name}
                    maxLength={120}
                    placeholder={`未命名${ASSET_KINDS[kind]}`}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                </Field>
              </div>
              <div className="film-asset-detail-actions">
                {usedBy > 0 && <span>{usedBy} 个镜头引用</span>}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="film-icon-button" aria-label="素材操作">
                      <MoreHorizontal size={17} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="film-popup">
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setRemoving(selected)}
                    >
                      <Trash2 size={15} />
                      删除{ASSET_KINDS[kind]}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>
            <div className="film-asset-detail-body">
              <section className="film-asset-definitions" aria-label="文字设定">
                <Field label="外观与设定">
                  <textarea
                    rows={3}
                    value={selected.description}
                    maxLength={12000}
                    placeholder={
                      kind === "character"
                        ? "记录外貌、性格、服装与辨识特征…"
                        : kind === "scene"
                          ? "记录空间、环境、光线与氛围…"
                          : "记录外形、材质与剧情用途…"
                    }
                    onChange={(e) => update({ description: e.target.value })}
                  />
                </Field>
                <Field label="素材图片提示词">
                  <textarea
                    rows={3}
                    value={selected.prompt}
                    maxLength={12000}
                    placeholder="描述主体、细节与画面风格，保持视觉一致…"
                    onChange={(e) => update({ prompt: e.target.value })}
                  />
                </Field>
              </section>
              <section className="film-asset-references" aria-label="参考文件">
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
                      mediaIds: selected.mediaIds?.filter(
                        (value) => value !== id,
                      ),
                    })
                  }
                />
                {!references.length && (
                  <div className="film-asset-reference-empty">
                    <ImagePlus size={24} strokeWidth={1.5} aria-hidden />
                    <p>为{ASSET_KINDS[kind]}添加视觉参考</p>
                    <span>图片、视频或文档，让创作设定更清晰。</span>
                  </div>
                )}
                <Field label="参考文件备注">
                  <input
                    value={selected.reference}
                    maxLength={1000}
                    placeholder="记录参考来源或使用说明"
                    onChange={(e) => update({ reference: e.target.value })}
                  />
                </Field>
              </section>
            </div>
          </article>
        </>
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
