import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Clapperboard,
  Film,
  Layers,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { FLOW_STEPS, PROJECT_KINDS, type FilmProject } from "./model";
import { resumeView, type FilmView } from "./view-state";
import { ProjectCover } from "./artwork";
import { ProjectProgress } from "./components/ProjectProgress";
import { projectProgress } from "./progress";
import creativeDesk from "./assets/creative-desk.jpg";

type Props = {
  projects: FilmProject[];
  views: Record<string, FilmView>;
  loading: boolean;
  busy: boolean;
  onOpen: (id: string, view?: FilmView) => void;
  onCreate: () => void;
  onImport: () => void;
  onExample: () => void;
  onRemove: (project: FilmProject) => void;
  children?: ReactNode;
};

function Metadata({ project }: { project: FilmProject }) {
  return (
    <p className="film-project-metadata">
      <span>{PROJECT_KINDS[project.kind]}</span>
      <span>{project.aspectRatio}</span>
      <span>
        <Layers size={15} />
        {project.episodes.length} 集
      </span>
      <span>
        <Film size={15} />
        {project.episodes.reduce(
          (sum, episode) => sum + episode.shots.length,
          0,
        )}{" "}
        镜头
      </span>
    </p>
  );
}

function updatedDate(timestamp: number) {
  const today = new Date();
  const date = new Date(timestamp);
  return date.toDateString() === today.toDateString()
    ? "今天"
    : date.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}

export function Library(props: Props) {
  const [query, setQuery] = useState("");
  const summaries = useMemo(
    () =>
      new Map(
        props.projects.map((project) => [project.id, projectProgress(project)]),
      ),
    [props.projects],
  );
  const recent = props.projects[0];
  const recentView = recent
    ? resumeView(recent, props.views[recent.id])
    : undefined;
  const recentEpisode =
    recent &&
    recent.episodes.find((episode) => episode.id === recentView!.episodeId)!;
  const stepIndex = recentView
    ? FLOW_STEPS.findIndex((step) => step.id === recentView.step)
    : 0;
  const episodeIndex =
    recent?.episodes.findIndex(
      (episode) => episode.id === recentView?.episodeId,
    ) ?? 0;
  const episodeLabel =
    recentEpisode &&
    (/^第\s*\d+\s*集$/.test(recentEpisode.title)
      ? `第 ${episodeIndex + 1} 集`
      : `第 ${episodeIndex + 1} 集 · ${recentEpisode.title}`);
  const shotIndex =
    recentEpisode?.shots.findIndex((shot) => shot.id === recentView?.shotId) ??
    -1;
  const sharedStep =
    recentView?.step === "settings" || recentView?.step === "assets";
  const other = props.projects.slice(1);
  const matches = props.projects.filter((project) =>
    `${project.title} ${project.synopsis}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const rows = query.trim() ? matches : other;
  return (
    <>
      <header className="film-library-header">
        <div className="film-library-brand">
          <Clapperboard size={29} />
          <h1>影视工坊</h1>
          <span>作品库</span>
        </div>
        <div className="film-actions">
          <button
            className="film-text-button"
            disabled={props.busy || props.loading}
            onClick={props.onImport}
          >
            <Upload size={17} />
            导入项目
          </button>
          <button
            className="film-primary"
            disabled={props.busy || props.loading}
            onClick={props.onCreate}
          >
            <Plus size={18} />
            新建项目
          </button>
        </div>
      </header>
      <div className="film-library-content">
        {props.children}
        {props.loading ? (
          <p className="film-connecting" role="status">
            正在加载作品库…
          </p>
        ) : recent ? (
          <>
            <div className="film-library-intro">
              <h2>继续创作</h2>
              <p>接着把故事变成画面。</p>
            </div>
            <article className="film-recent-project film-project-card">
              <div className="film-recent-main">
                <button
                  className="film-cover-open"
                  aria-label={`打开项目 ${recent.title}`}
                  disabled={props.busy}
                  onClick={() => props.onOpen(recent.id)}
                >
                  <ProjectCover project={recent} />
                </button>
                <div className="film-recent-details">
                  <div className="film-recent-label">
                    <span>最近创作</span>
                    <button
                      className="film-icon-button film-danger"
                      aria-label={`删除项目 ${recent.title}`}
                      disabled={props.busy}
                      onClick={() => props.onRemove(recent)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <h3>{recent.title}</h3>
                  <p className="film-project-synopsis">
                    {recent.synopsis || "故事正在酝酿，从项目设定开始下一步。"}
                  </p>
                  <Metadata project={recent} />
                  <div className="film-resume-line">
                    <span>
                      上次编辑：
                      {!sharedStep && (
                        <>
                          {episodeLabel} ·{" "}
                          {recentView?.step !== "script" && shotIndex >= 0 && (
                            <>
                              镜头 {String(shotIndex + 1).padStart(2, "0")}{" "}
                              ·{" "}
                            </>
                          )}
                        </>
                      )}
                      {FLOW_STEPS[stepIndex].title}
                    </span>
                    <button
                      className="film-primary film-project-open"
                      disabled={props.busy}
                      onClick={() => props.onOpen(recent.id)}
                    >
                      <span className="film-visually-hidden">
                        {recent.title} ·{" "}
                      </span>
                      继续{FLOW_STEPS[stepIndex].title}
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
              <ProjectProgress
                summary={summaries.get(recent.id)!}
                comic={recent.kind === "comic"}
                busy={props.busy}
                onOpenEpisode={(episodeId, step) => {
                  const episode = recent.episodes.find(
                    (item) => item.id === episodeId,
                  )!;
                  const shot =
                    step === "dubbing"
                      ? episode.shots.find((item) => item.dialogue.trim())
                      : episode.shots[0];
                  props.onOpen(
                    recent.id,
                    resumeView(recent, {
                      episodeId,
                      step,
                      shotId: shot?.id,
                    }),
                  );
                }}
              />
            </article>
            <section className="film-library-projects" aria-label="作品库">
              <div className="film-library-toolbar">
                <h2>{query.trim() ? "搜索结果" : "其他作品"}</h2>
                <label className="film-search">
                  <Search size={17} />
                  <input
                    aria-label="搜索项目"
                    placeholder="搜索作品…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
              </div>
              {rows.length ? (
                <div className="film-project-rows">
                  {rows.map((project) => {
                    const summary = summaries.get(project.id)!;
                    return (
                      <article
                        key={project.id}
                        className="film-project-row film-project-card"
                      >
                        <button
                          className="film-project-open"
                          disabled={props.busy}
                          onClick={() => props.onOpen(project.id)}
                        >
                          <ProjectCover project={project} />
                          <div>
                            <h3>{project.title}</h3>
                            <p className="film-project-synopsis">
                              {project.synopsis ||
                                "给故事补充梗概，继续下一步。"}
                            </p>
                            <Metadata project={project} />
                          </div>
                          <span className="film-row-status">
                            {summary.exports
                              ? `${project.kind === "comic" ? "已有导出" : "有成片"} ${summary.exports} / ${summary.episodes.length} 集`
                              : summary.state}
                          </span>
                          <span className="film-row-date">
                            更新于 {updatedDate(project.updatedAt)}
                          </span>
                          <ArrowRight size={19} />
                        </button>
                        <button
                          className="film-icon-button film-danger"
                          aria-label={`删除项目 ${project.title}`}
                          disabled={props.busy}
                          onClick={() => props.onRemove(project)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="film-library-empty-list">
                  {query.trim()
                    ? "没有匹配的作品，试试其他名称或故事关键词。"
                    : "其他作品会显示在这里。"}
                </p>
              )}
            </section>
          </>
        ) : (
          <section className="film-library-empty">
            <img src={creativeDesk} alt="" />
            <div>
              <h2>开始你的第一部作品</h2>
              <p>给故事一个名字，从项目设定走进完整的七步创作流程。</p>
              <button
                className="film-primary"
                disabled={props.busy}
                onClick={props.onCreate}
              >
                <Plus size={17} />
                创建第一个项目
              </button>
            </div>
          </section>
        )}
        <footer className="film-library-help">
          <Clapperboard size={21} />
          <span>第一次使用？打开示例项目，看看完整的七步流程。</span>
          <button
            className="film-text-button"
            disabled={props.busy || props.loading}
            onClick={props.onExample}
          >
            <Sparkles size={15} />
            打开示例项目
            <ArrowRight size={16} />
          </button>
        </footer>
      </div>
    </>
  );
}
