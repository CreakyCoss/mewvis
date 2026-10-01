import { Code2, LayoutGrid, Play, Plus, Trash2 } from "lucide-react";
import {
  AppView,
  Busy,
  Empty,
  ErrorNotice,
  ProjectIcon,
  Status,
} from "./components";
import type { BuildArtifact, ProjectSummary } from "./contracts";

export function Home({
  projects,
  selectedId,
  select,
  create,
  develop,
  use,
  remove,
  artifact,
  loading,
  busy,
  previewLoading,
  previewError,
  retry,
}: {
  projects: ProjectSummary[];
  selectedId: string;
  select(id: string): void;
  create(): void;
  develop(project: ProjectSummary): void;
  use(project: ProjectSummary): void;
  remove(project: ProjectSummary): void;
  artifact: BuildArtifact | null;
  loading: boolean;
  busy: boolean;
  previewLoading: boolean;
  previewError: string;
  retry(): void;
}) {
  const project = projects.find((value) => value.id === selectedId);
  const updatedLabel =
    project &&
    new Date(project.updatedAt).toDateString() === new Date().toDateString()
      ? "今天更新"
      : project
        ? `${new Date(project.updatedAt).toLocaleDateString()} 更新`
        : "";
  return (
    <div className="wk-home">
      <aside className="wk-library" aria-label="小应用列表">
        <header className="wk-library-header">
          <h1 className="wk-brand">
            <LayoutGrid />
            应用工坊
          </h1>
          <button
            className="wk-button is-primary"
            disabled={busy}
            onClick={create}
          >
            <Plus />
            新建小应用
          </button>
        </header>
        <div className="wk-project-list">
          {projects.map((item) => (
            <div
              className={`wk-project-row ${item.id === selectedId ? "is-selected" : ""}`}
              key={item.id}
            >
              <button
                className="wk-project-select"
                aria-pressed={item.id === selectedId}
                onClick={() => select(item.id)}
              >
                <ProjectIcon name={item.name} />
                <span className="wk-project-text">
                  <span className="wk-project-heading">
                    <strong title={item.name}>{item.name}</strong>
                    <Status project={item} />
                  </span>
                  <span className="wk-description">
                    {item.description || "还没有应用说明"}
                  </span>
                </span>
              </button>
            </div>
          ))}
        </div>
      </aside>
      <section className="wk-home-detail" aria-label="所选小应用">
        {loading && !projects.length ? (
          <Busy text="正在加载小应用…" />
        ) : !projects.length ? (
          <Empty
            title="从第一个小应用开始"
            action={
              <button
                className="wk-button is-primary"
                disabled={busy}
                onClick={create}
              >
                <Plus />
                新建小应用
              </button>
            }
          >
            先创建项目，再进入编辑页让 AI 帮你开发。
          </Empty>
        ) : project && (
          <>
            <header className="wk-detail-header">
              <ProjectIcon name={project.name} large />
              <div className="wk-detail-title">
                <div className="wk-detail-heading">
                  <h2>{project.name}</h2>
                  <Status project={project} />
                  <span className="wk-updated">{updatedLabel}</span>
                </div>
                <p>{project.description || "进入编辑页，完善你的小应用。"}</p>
              </div>
              <div className="wk-detail-actions">
                {project.savedVersionId && !project.error && (
                  <button
                    className="wk-button is-primary"
                    onClick={() => use(project)}
                  >
                    <Play />
                    运行
                  </button>
                )}
                <button
                  className="wk-button"
                  onClick={() => develop(project)}
                  disabled={!!project.error}
                >
                  <Code2 />
                  继续开发
                </button>
                <button
                  className="wk-button wk-delete-button"
                  aria-label={`删除 ${project.name}`}
                  onClick={() => remove(project)}
                >
                  <Trash2 />
                  删除
                </button>
              </div>
            </header>
            <div
              className="wk-home-preview"
              role="region"
              aria-label="应用界面预览"
            >
              {previewLoading ? (
                <Busy text="正在加载界面预览…" />
              ) : previewError || project.error ? (
                <div className="wk-empty">
                  <ErrorNotice>{previewError || project.error}</ErrorNotice>
                  <button className="wk-button" onClick={retry}>
                    重新加载
                  </button>
                </div>
              ) : artifact?.projectId === project.id ? (
                <AppView
                  key={project.id}
                  projectId={project.id}
                  artifact={artifact}
                  passive
                />
              ) : project.savedVersionId ? (
                <Busy text="正在加载界面预览…" />
              ) : (
                <Empty
                  title="项目已创建，等待你的想法"
                  action={
                    <button
                      className="wk-button is-accent"
                      onClick={() => develop(project)}
                    >
                      <Code2 />
                      开始开发
                    </button>
                  }
                >
                  进入编辑页生成代码，构建并保存后，就可以在这里打开使用。
                </Empty>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
