import { Code2, MoreHorizontal, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
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
  previewLoading: boolean;
  previewError: string;
  retry(): void;
}) {
  const [menu, setMenu] = useState("");
  const project = projects.find((value) => value.id === selectedId);
  const updatedLabel =
    project &&
    new Date(project.updatedAt).toDateString() === new Date().toDateString()
      ? "今天更新"
      : project
        ? `${new Date(project.updatedAt).toLocaleDateString()} 更新`
        : "";
  if (loading && !projects.length) return <Busy text="正在加载小应用…" />;
  if (!projects.length)
    return (
      <Empty
        title="从第一个小应用开始"
        action={
          <button className="wk-button is-primary" onClick={create}>
            <Plus />
            新建小应用
          </button>
        }
      >
        先创建项目，再进入编辑页让 AI 帮你开发。
      </Empty>
    );
  return (
    <div className="wk-home">
      <aside className="wk-library" aria-label="小应用列表">
        <div className="wk-library-heading">
          <h1>我的小应用</h1>
          <p>选择一个小应用，开始使用或继续开发。</p>
        </div>
        <div className="wk-project-list">
          {projects.map((item) => (
            <div
              className={`wk-project-row ${item.id === selectedId ? "is-selected" : ""}`}
              key={item.id}
            >
              <button
                className="wk-project-select"
                aria-pressed={item.id === selectedId}
                onClick={() => {
                  setMenu("");
                  select(item.id);
                }}
              >
                <ProjectIcon name={item.name} />
                <span className="wk-project-text">
                  <strong>{item.name}</strong>
                  <span className="wk-description">
                    {item.description || "还没有应用说明"}
                  </span>
                  <Status project={item} />
                </span>
              </button>
              <div className="wk-project-menu">
                <button
                  className="wk-icon-button"
                  aria-label={`管理 ${item.name}`}
                  aria-expanded={menu === item.id}
                  onClick={() => setMenu(menu === item.id ? "" : item.id)}
                >
                  <MoreHorizontal />
                </button>
                {menu === item.id && (
                  <div
                    className="wk-menu"
                    role="menu"
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setMenu("");
                    }}
                  >
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenu("");
                        remove(item);
                      }}
                    >
                      <Trash2 />
                      删除小应用
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </aside>
      <section className="wk-home-detail" aria-label="所选小应用">
        {project && (
          <>
            <header className="wk-detail-header">
              <ProjectIcon name={project.name} large />
              <div className="wk-detail-title">
                <h2>{project.name}</h2>
                <p>{project.description || "进入编辑页，完善你的小应用。"}</p>
                <div className="wk-detail-meta">
                  <Status project={project} />
                  <span className="wk-updated">{updatedLabel}</span>
                </div>
              </div>
              <div className="wk-detail-actions">
                {project.savedVersionId && !project.error && (
                  <button
                    className="wk-button is-accent"
                    onClick={() => use(project)}
                  >
                    <Play />
                    使用
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
              </div>
            </header>
            <div className="wk-preview-label">界面预览</div>
            <div className="wk-home-preview">
              {previewLoading ? (
                <Busy text="正在加载界面预览…" />
              ) : previewError || project.error ? (
                <div className="wk-empty">
                  <ErrorNotice>{previewError || project.error}</ErrorNotice>
                  <button className="wk-button" onClick={retry}>
                    重新加载
                  </button>
                </div>
              ) : artifact ? (
                <AppView
                  key={project.id}
                  projectId={project.id}
                  artifact={artifact}
                  passive
                />
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
            <p className="wk-home-footnote">小应用在应用工坊中运行。</p>
          </>
        )}
      </section>
    </div>
  );
}
