import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  Clapperboard,
  FolderOpen,
  Maximize2,
  MoreHorizontal,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "design-system/components/ui/dropdown-menu";
import { getApplicationHost } from "@mewvis/app-sdk/browser";
import {
  FLOW_STEPS,
  PROJECT_KINDS,
  blankEpisode,
  blankShot,
  stageStatus,
  type FilmProject,
  type FlowStep,
} from "./model";
import { useEditor, type FilmRepository } from "./useEditor";
import type { FilmView } from "./view-state";
import { Dialog } from "./components/Dialog";
import { Field } from "./components/Fields";
import { StepRail } from "./components/StepRail";
import { AssistantResizer } from "./components/AssistantResizer";
import { ShotArtwork } from "./artwork";
import { StageEditor } from "./StageEditors";
import { Assistant } from "./Assistant";
import { ReferencePanel } from "./ReferencePanel";
import { useGeneration } from "./useGeneration";

export function Workbench({
  initial,
  initialView,
  repository,
  onSaved,
  onView,
  onBack,
}: {
  initial: FilmProject;
  initialView: FilmView;
  repository: FilmRepository;
  onSaved: (project: FilmProject) => void;
  onView: (view: FilmView) => void;
  onBack: () => void;
}) {
  const editor = useEditor(initial, repository, onSaved),
    { project, edit } = editor;
  const generation = useGeneration(editor);
  const [attaching, setAttaching] = useState(false);
  const [episodeId, setEpisodeId] = useState(initialView.episodeId);
  const [step, setStep] = useState<FlowStep>(initialView.step),
    [shotId, setShotId] = useState(initialView.shotId);
  const [panel, setPanel] = useState<"assistant" | "reference" | null>(
    "assistant",
  );
  const [mobilePanel, setMobilePanel] = useState(false);
  const [assistantWidth, setAssistantWidth] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const assistantRef = useRef<HTMLDivElement>(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [expandedEpisodeId, setExpandedEpisodeId] = useState<string | null>(
    initialView.episodeId,
  );
  const [focused, setFocused] = useState(false);
  const [compactScreen, setCompactScreen] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  const [adding, setAdding] = useState(false),
    [removing, setRemoving] = useState(false);
  const [episodeTitle, setEpisodeTitle] = useState(""),
    [leaving, setLeaving] = useState(false),
    [viewError, setViewError] = useState("");
  const chooseWorkspace = async () => {
    if (attaching) return;
    setAttaching(true);
    setViewError("");
    try {
      await editor.flush();
      const attached = await repository.attach(editor.current.current);
      if (attached) {
        edit(() => attached);
        await editor.flush();
      }
    } catch (reason) {
      setViewError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setAttaching(false);
    }
  };
  const episode =
    project.episodes.find((e) => e.id === episodeId) ?? project.episodes[0];
  useEffect(() => setExpandedEpisodeId(episode.id), [episode.id]);
  const shot =
    episode.shots.find((s) => s.id === shotId) ?? episode.shots.at(-1);
  const stepIndex = FLOW_STEPS.findIndex((s) => s.id === step);
  const view = { episodeId: episode.id, step, shotId: shot?.id ?? "" };
  const currentView = useRef(view),
    onViewRef = useRef(onView);
  currentView.current = view;
  onViewRef.current = onView;
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const change = () => setCompactScreen(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const next = currentView.current;
    onViewRef.current(next);
    const timer = setTimeout(() => {
      void repository
        .saveView(project.id, next)
        .then(() => setViewError(""))
        .catch(() =>
          setViewError("上次创作位置保存失败，返回作品库时会重试。"),
        );
    }, 120);
    return () => clearTimeout(timer);
  }, [episode.id, step, shot?.id, project.id, repository]);
  const openStep = (value: FlowStep) => {
    setStep(value);
    setDirectoryOpen(false);
  };
  const createEpisode = () => {
    if (!episodeTitle.trim() || project.episodes.length >= 50) return;
    const next = blankEpisode(episodeTitle.trim());
    edit((p) => ({ ...p, episodes: [...p.episodes, next] }));
    setEpisodeId(next.id);
    setShotId("");
    setAdding(false);
    openStep("script");
  };
  const back = async () => {
    setLeaving(true);
    try {
      await editor.flush();
      await repository.saveView(project.id, currentView.current);
      onBack();
    } catch (error) {
      setViewError(error instanceof Error ? error.message : String(error));
      setLeaving(false);
    }
  };
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    const header = getApplicationHost().header;
    if (!header) return;
    void header.set({ title: "影视工坊", backLabel: "作品库" }).catch(() => {});
    const unsubscribe = header.subscribe(() => {
      void backRef.current();
    });
    return () => {
      unsubscribe();
      void header.set(null).catch(() => {});
    };
  }, []);
  const selectPanel = (value: "assistant" | "reference") => {
    if (compactScreen) {
      setPanel(value);
      setMobilePanel(panel === value ? !mobilePanel : true);
    } else setPanel(panel === value ? null : value);
  };
  const addShot = () => {
    if (episode.shots.length >= 200) return;
    const next = blankShot(episode.shots.length + 1);
    edit((p) => ({
      ...p,
      episodes: p.episodes.map((e) =>
        e.id === episode.id ? { ...e, shots: [...e.shots, next] } : e,
      ),
    }));
    setShotId(next.id);
    openStep("storyboard");
  };
  const closePanel = () =>
    compactScreen ? setMobilePanel(false) : setPanel(null);
  const showAssistant = () => {
    setPanel("assistant");
    setMobilePanel(true);
    setFocused(false);
  };
  useEffect(() => {
    if (generation.error) showAssistant();
  }, [generation.error]);
  const scopedShot = ["storyboard", "video", "dubbing"].includes(step);
  const selectedNumber = shot
    ? episode.shots.findIndex((s) => s.id === shot.id) + 1
    : 0;
  return (
    <main
      className={`film-app film-workbench film-studio ${panel ? "has-panel" : ""} ${panel === "assistant" ? "has-assistant" : ""} ${mobilePanel ? "panel-mobile-open" : ""} ${directoryOpen ? "directory-mobile-open" : ""} ${focused ? "is-focused" : ""}`}
      style={
        assistantWidth === null
          ? undefined
          : ({
              "--film-assistant-width": `${assistantWidth}px`,
            } as CSSProperties)
      }
    >
      <header className="film-workbench-header">
        <div className="film-project-heading">
          <button
            className="film-icon-button"
            aria-label="返回作品库"
            disabled={leaving}
            onClick={() => void back()}
          >
            <ChevronLeft size={18} />
          </button>
          <Clapperboard className="film-header-mark" size={24} />
          <h1 title={project.title}>{project.title || "未命名项目"}</h1>
        </div>
        <label className="film-context-menu film-current-episode">
          <NativeSelect
            aria-label="当前分集"
            value={episode.id}
            onChange={(e) => {
              setEpisodeId(e.target.value);
              setShotId("");
            }}
          >
            {project.episodes.map((e, index) => (
              <NativeSelectOption key={e.id} value={e.id}>
                第{index + 1}集 · {e.title || "未命名分集"}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <div className="film-workbench-actions">
          <span
            className={`film-save-status is-${editor.status}`}
            role="status"
          >
            {editor.status === "saved" ? (
              <>
                <Check size={14} />
                已保存
              </>
            ) : editor.status === "saving" ? (
              "保存中…"
            ) : editor.status === "error" ? (
              "保存失败"
            ) : (
              "未保存"
            )}
          </span>
          <button
            className="film-icon-button"
            aria-label="保存"
            title="保存"
            disabled={editor.status === "saving" || leaving}
            onClick={() => void editor.save().catch(() => {})}
          >
            <Save size={16} />
          </button>
          <button
            className="film-focus-toggle"
            aria-label="专注模式"
            aria-pressed={focused}
            onClick={() => setFocused(!focused)}
          >
            <Maximize2 size={16} />
            <span>{focused ? "退出专注" : "专注"}</span>
          </button>
          <button
            className="film-icon-button film-directory-toggle"
            aria-label="镜头目录"
            aria-expanded={directoryOpen}
            onClick={() => setDirectoryOpen(!directoryOpen)}
          >
            <FolderOpen size={18} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="film-icon-button" aria-label="更多项目操作">
                <MoreHorizontal size={18} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="film-popup">
              <DropdownMenuItem
                disabled={project.episodes.length >= 50}
                onSelect={() => {
                  setEpisodeTitle(`第 ${project.episodes.length + 1} 集`);
                  setAdding(true);
                }}
              >
                <Plus size={16} />
                添加分集
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={project.episodes.length <= 1}
                onSelect={() => setRemoving(true)}
                variant="destructive"
              >
                <Trash2 size={16} />
                删除当前分集
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {(editor.error || viewError) && (
        <div className="film-save-error" role="alert">
          {editor.error || viewError}{" "}
          {editor.error && "更改仍在当前页面，请修正后重新保存。"}
        </div>
      )}
      {!project.workspace && (
        <div className="film-workspace-notice">
          <span>选择工作目录，开始导入素材和生成媒体。</span>
          <button disabled={attaching} onClick={() => void chooseWorkspace()}>
            {attaching ? "准备中…" : "选择工作目录"}
          </button>
        </div>
      )}
      <div className="film-workbench-body" ref={bodyRef}>
        {directoryOpen && (
          <button
            className="film-drawer-scrim"
            aria-label="关闭镜头目录"
            onClick={() => setDirectoryOpen(false)}
          />
        )}
        <aside className="film-shot-directory" aria-label="分集与镜头目录">
          <header>
            <strong>分镜</strong>
            <button
              className="film-directory-add"
              aria-label="添加镜头"
              disabled={episode.shots.length >= 200}
              onClick={addShot}
            >
              <Plus size={18} />
            </button>
            <button
              className="film-icon-button film-directory-close"
              aria-label="收起镜头目录"
              onClick={() => setDirectoryOpen(false)}
            >
              <X size={16} />
            </button>
          </header>
          <div className="film-directory-list">
            {project.episodes.map((item, episodeIndex) => (
              <details key={item.id} open={item.id === expandedEpisodeId}>
                <summary
                  onClick={(event) => {
                    event.preventDefault();
                    setExpandedEpisodeId((current) =>
                      current === item.id ? null : item.id,
                    );
                    setEpisodeId(item.id);
                    if (item.id !== episode.id) setShotId("");
                  }}
                >
                  <ChevronDown size={14} />
                  <span>
                    第{episodeIndex + 1}集 · {item.title}
                  </span>
                </summary>
                {item.shots.length ? (
                  item.shots.map((s, index) => (
                    <button
                      key={s.id}
                      className={`film-shot-select film-directory-shot ${item.id === episode.id && s.id === shot?.id ? "is-selected" : ""}`}
                      aria-pressed={item.id === episode.id && s.id === shot?.id}
                      onClick={() => {
                        setEpisodeId(item.id);
                        setShotId(s.id);
                        if (!scopedShot) openStep("storyboard");
                        setDirectoryOpen(false);
                      }}
                    >
                      <ShotArtwork project={project} shot={s} />
                      <span>
                        <strong>
                          {String(index + 1).padStart(2, "0")} {s.title}
                        </strong>
                        <small>
                          {s.framing} · {s.duration}秒
                        </small>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="film-directory-empty">还没有镜头</p>
                )}
              </details>
            ))}
          </div>
          <footer>
            {episode.shots.length} 个镜头 ·{" "}
            {episode.shots.reduce((sum, s) => sum + s.duration, 0)} 秒
          </footer>
        </aside>
        <section className="film-workspace" aria-label="创作工作区">
          <div className="film-step-navigation">
            <StepRail
              id="film-seven-steps"
              className="film-seven-steps"
              label="七步创作流程"
              activeKey={step}
            >
              {FLOW_STEPS.map((item, index) => {
                const status = stageStatus(project, episode, item.id);
                return (
                  <button
                    key={item.id}
                    className={`film-step-button ${step === item.id ? "is-active" : ""}`}
                    aria-current={step === item.id ? "step" : undefined}
                    title={`${item.description} · ${status === "ready" ? "内容已准备" : status === "blocked" ? "待接入" : status === "draft" ? "待完善" : "待准备"}`}
                    onClick={() => openStep(item.id)}
                  >
                    <span className="film-step-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <strong>{item.title}</strong>
                  </button>
                );
              })}
            </StepRail>
          </div>
          <section
            className="film-stage-area"
            aria-label={FLOW_STEPS[stepIndex].title}
          >
            <h2
              className={
                step === "storyboard"
                  ? "film-visually-hidden"
                  : "film-stage-title"
              }
            >
              {FLOW_STEPS[stepIndex].title}
            </h2>
            {step !== "storyboard" && (
              <p className="film-stage-intro">
                {FLOW_STEPS[stepIndex].description}
                <span>
                  {["settings", "assets"].includes(step)
                    ? `${PROJECT_KINDS[project.kind]} · 项目共享`
                    : episode.title}
                </span>
              </p>
            )}
            <StageEditor
              key={`${episode.id}:${step}`}
              project={project}
              episode={episode}
              step={step}
              edit={edit}
              selectedShotId={shot?.id}
              onSelectShot={setShotId}
              generate={generation.generate}
              generationBusy={generation.busy}
              stopGeneration={generation.stop}
              generationStarting={generation.starting}
              generationStopping={generation.stopping}
              onShowAssistant={showAssistant}
            />
          </section>
          <footer className="film-stage-footer">
            <button
              disabled={stepIndex === 0}
              onClick={() => openStep(FLOW_STEPS[stepIndex - 1].id)}
            >
              <ArrowLeft size={16} />
              {stepIndex === 0
                ? "创作起点"
                : `上一步：${FLOW_STEPS[stepIndex - 1].title}`}
            </button>
            <span>
              {scopedShot && shot
                ? `第 ${selectedNumber} / ${episode.shots.length} 镜 · ${shot.duration} 秒`
                : `${episode.shots.length} 个镜头 · ${episode.shots.reduce((sum, s) => sum + s.duration, 0)} 秒`}
            </span>
            {stepIndex < FLOW_STEPS.length - 1 ? (
              <button
                className="film-primary"
                onClick={() => openStep(FLOW_STEPS[stepIndex + 1].id)}
              >
                下一步：{FLOW_STEPS[stepIndex + 1].title}
                <ArrowRight size={16} />
              </button>
            ) : (
              <button onClick={() => void back()} disabled={leaving}>
                返回作品库
                <ArrowRight size={16} />
              </button>
            )}
          </footer>
        </section>
        {panel === "assistant" && !focused && !compactScreen && (
          <AssistantResizer
            containerRef={bodyRef}
            panelRef={assistantRef}
            onResize={setAssistantWidth}
          />
        )}
        {
          <div
            id="film-assistant-panel"
            ref={assistantRef}
            className="film-side-panel"
            hidden={panel !== "assistant" || focused}
          >
            <Assistant
              key={episode.id}
              editor={editor}
              project={project}
              episode={episode}
              step={step}
              selectedShotId={shot?.id}
              generationError={generation.error}
              onReconnectGeneration={
                generation.busy ? generation.retry : undefined
              }
            />
          </div>
        }
        {panel === "reference" && (
          <div className="film-side-panel" hidden={focused}>
            <ReferencePanel
              project={project}
              episode={episode}
              shot={shot}
              onClose={closePanel}
              onOpenStep={(next) => {
                openStep(next);
                if (compactScreen) setMobilePanel(false);
              }}
            />
          </div>
        )}
        <nav className="film-tool-rail" aria-label="辅助工具">
          <button
            className={
              panel === "assistant" && (!compactScreen || mobilePanel)
                ? "is-active"
                : ""
            }
            aria-label="创作助手"
            aria-pressed={
              panel === "assistant" && (!compactScreen || mobilePanel)
            }
            onClick={() => selectPanel("assistant")}
          >
            <Sparkles size={20} />
            <span>助手</span>
          </button>
          <button
            className={
              panel === "reference" && (!compactScreen || mobilePanel)
                ? "is-active"
                : ""
            }
            aria-label="参考资料"
            aria-pressed={
              panel === "reference" && (!compactScreen || mobilePanel)
            }
            onClick={() => selectPanel("reference")}
          >
            <BookOpen size={20} />
            <span>参考</span>
          </button>
        </nav>
      </div>
      {adding && (
        <Dialog title="添加分集" onClose={() => setAdding(false)}>
          <div className="film-dialog-form">
            <Field label="分集名称">
              <input
                autoFocus
                required
                maxLength={120}
                value={episodeTitle}
                onChange={(e) => setEpisodeTitle(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    createEpisode();
                  }
                }}
              />
            </Field>
            <footer>
              <button type="button" onClick={() => setAdding(false)}>
                取消
              </button>
              <button
                type="button"
                className="film-primary"
                disabled={!episodeTitle.trim()}
                onClick={createEpisode}
              >
                创建分集
              </button>
            </footer>
          </div>
        </Dialog>
      )}
      {removing && (
        <Dialog title="删除分集" onClose={() => setRemoving(false)}>
          <p>
            删除「{episode.title}
            」的剧本、镜头与配音计划？项目素材和历史助手会话会保留。
          </p>
          <footer>
            <button onClick={() => setRemoving(false)}>取消</button>
            <button
              className="film-danger"
              onClick={() => {
                const next = project.episodes.filter(
                  (e) => e.id !== episode.id,
                );
                if (!next.length) return;
                edit((p) => ({ ...p, episodes: next }));
                setEpisodeId(next[0].id);
                setRemoving(false);
              }}
            >
              确认删除
            </button>
          </footer>
        </Dialog>
      )}
    </main>
  );
}
