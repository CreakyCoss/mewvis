import { useEffect, useState } from "react";
import { getApplicationDataClient } from "@mewvis/app-sdk/data";
import { getApplicationFileClient } from "@mewvis/app-sdk/files";
import { FolderOpen, FolderPlus, Plus } from "lucide-react";
import Editor, { Modal } from "./Editor";
import {
  createRepository,
  errorText,
  type Project,
  type ProjectEntry,
} from "./repository";
import "./styles.css";

export default function App() {
  const [repository] = useState(() =>
    createRepository(
      getApplicationDataClient().workspaces,
      getApplicationFileClient(),
    ),
  );
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("正在加载工作区…");
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<ProjectEntry | null>(null);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const refresh = async () => {
    setEntries(await repository.list());
    setLoaded(true);
  };

  useEffect(() => {
    let active = true;
    repository
      .list()
      .then((items) => {
        if (active) {
          setEntries(items);
          setLoaded(true);
        }
      })
      .catch((error) => {
        if (active) setError(errorText(error));
      })
      .finally(() => {
        if (active) setBusy("");
      });
    return () => {
      active = false;
    };
  }, [repository]);

  async function run(label: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy("");
    }
  }

  function startCreate() {
    setError("");
    setName("");
    setParent("");
    setCreating(true);
  }
  const openWorkspace = () =>
    run("正在打开工作区…", async () => {
      const directory = await repository.selectDirectory();
      if (!directory) return;
      const opened = await repository.attach(directory);
      if (opened) setProject(opened);
    });
  const empty = loaded && entries.length === 0;

  if (project)
    return (
      <Editor
        key={project.workspace.id}
        project={project}
        repository={repository}
        onBack={() => {
          setProject(null);
          void refresh().catch((error) => setError(errorText(error)));
        }}
      />
    );

  return (
    <main className="ds-library">
      <header className="ds-library-header">
        <div className="ds-brand">
          <span className="ds-brand-mark" aria-hidden="true">
            ◧
          </span>
          <h1>设计画布</h1>
        </div>
        <div className="ds-library-actions">
          <button
            disabled={!!busy}
            onClick={() => void run("正在刷新…", refresh)}
          >
            刷新列表
          </button>
          <button disabled={!!busy} onClick={() => void openWorkspace()}>
            打开工作区
          </button>
          <button
            className={empty ? undefined : "ds-primary"}
            disabled={!!busy}
            onClick={startCreate}
          >
            新增工作区
          </button>
        </div>
      </header>
      <section
        className={`ds-library-content${empty ? " is-empty" : ""}`}
        aria-busy={!!busy}
      >
        {empty && (
          <section
            className="ds-empty-workspace"
            aria-labelledby="empty-workspace-title"
          >
            <div className="ds-empty-art" aria-hidden="true">
              <div className="ds-empty-art-back" />
              <div className="ds-empty-art-canvas">
                <i />
                <b />
                <span />
              </div>
              <div className="ds-empty-art-badge">
                <FolderPlus size={22} strokeWidth={1.75} />
              </div>
            </div>
            <h2 id="empty-workspace-title">还没有设计工作区</h2>
            <p>新建一份设计，或打开已有工作区。</p>
            <div className="ds-empty-actions">
              <button
                className="ds-primary"
                disabled={!!busy}
                onClick={startCreate}
              >
                <Plus size={17} strokeWidth={1.8} aria-hidden="true" />
                新增工作区
              </button>
              <button disabled={!!busy} onClick={() => void openWorkspace()}>
                <FolderOpen size={17} strokeWidth={1.8} aria-hidden="true" />
                打开工作区
              </button>
            </div>
          </section>
        )}
        {entries.length > 0 && (
          <div className="ds-projects">
            {entries.map((entry) => (
              <article className="ds-project" key={entry.workspace.id}>
                <div className="ds-project-art" aria-hidden="true">
                  <span>◧</span>
                  <i />
                </div>
                <h2>{entry.title || "未命名设计"}</h2>
                <p className="ds-project-path" title={entry.workspace.path}>
                  {entry.workspace.path}
                </p>
                {entry.error ? (
                  <p className="ds-project-error">{entry.error}</p>
                ) : (
                  <p className="ds-project-date">
                    最近保存 {new Date(entry.modifiedAt).toLocaleString()}
                  </p>
                )}
                <div className="ds-project-actions">
                  <button
                    className="ds-primary"
                    disabled={!!busy}
                    onClick={() =>
                      void run("正在打开设计…", async () =>
                        setProject(await repository.open(entry.workspace.id)),
                      )
                    }
                  >
                    打开设计
                  </button>
                  <button
                    disabled={!!busy}
                    onClick={() => {
                      setError("");
                      setRemoving(entry);
                    }}
                  >
                    移除
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {error && !creating && !removing && (
        <Modal title="操作失败" close={() => setError("")}>
          <p role="alert">{error}</p>
          <button className="ds-primary" onClick={() => setError("")}>
            关闭
          </button>
        </Modal>
      )}
      {creating && (
        <Modal
          title="新增工作区"
          close={() => {
            if (!busy) setCreating(false);
          }}
        >
          <div
            className="ds-workspace-form"
            role="form"
            aria-label="新增工作区"
          >
            <label className="ds-field">
              <span>设计名称</span>
              <input
                aria-label="设计名称"
                autoFocus
                required
                maxLength={80}
                value={name}
                disabled={!!busy}
                placeholder="例如：秋日活动海报"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="ds-field">
              <span>工作区父目录</span>
              <div className="ds-directory-picker">
                <input
                  aria-label="工作区父目录"
                  value={parent}
                  readOnly
                  placeholder="请选择保存位置"
                />
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() =>
                    void run("正在选择目录…", async () => {
                      const selected = await repository.selectDirectory();
                      if (selected) setParent(selected);
                    })
                  }
                >
                  选择目录
                </button>
              </div>
            </label>
            <p className="ds-help">将在所选目录中创建独立的设计文件夹。</p>
            {error && (
              <p role="alert" className="ds-project-error">
                {error}
              </p>
            )}
            <div className="ds-form-actions">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => setCreating(false)}
              >
                取消
              </button>
              <button
                className="ds-primary"
                disabled={!!busy || !name.trim() || !parent}
                type="button"
                onClick={() =>
                  void run("正在创建工作区…", async () => {
                    const created = await repository.create(name, parent);
                    if (created) {
                      setCreating(false);
                      setProject(created);
                    }
                  })
                }
              >
                {busy || "创建并开始设计"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {removing && (
        <Modal
          title="移除工作区"
          close={() => {
            if (!busy) setRemoving(null);
          }}
        >
          <p>
            从列表移除「{removing.title}
            」？目录中的设计、素材和导出文件会保留，之后可通过「打开工作区」重新添加。
          </p>
          {error && (
            <p role="alert" className="ds-project-error">
              {error}
            </p>
          )}
          <div className="ds-form-actions">
            <button disabled={!!busy} onClick={() => setRemoving(null)}>
              取消
            </button>
            <button
              className="ds-primary"
              disabled={!!busy}
              onClick={() =>
                void run("正在移除…", async () => {
                  await repository.remove(removing.workspace.id);
                  setRemoving(null);
                  await refresh();
                })
              }
            >
              移除工作区
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
