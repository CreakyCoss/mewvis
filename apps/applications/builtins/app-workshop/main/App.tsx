import { useCallback, useEffect, useRef, useState } from "react";
import type { ApplicationChatSession } from "@isle/app-sdk/chat";
import { getApplicationDataClient } from "@isle/app-sdk/data";
import { LayoutGrid, Plus } from "lucide-react";
import { api, closeProjectSessions, developerSession, errorText } from "./api";
import { ErrorNotice, Modal } from "./components";
import { Home } from "./Home";
import { Editor } from "./Editor";
import { UseView } from "./UseView";
import type { BuildArtifact, ProjectDetail, ProjectSummary } from "./contracts";
import "./styles.css";

export default function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState<"home" | "develop" | "use">("home");
  const [detail, setDetail] = useState<ProjectDetail>();
  const [artifact, setArtifact] = useState<BuildArtifact | null>(null);
  const [session, setSession] = useState<ApplicationChatSession>();
  const [sessionError, setSessionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [removing, setRemoving] = useState<ProjectSummary | null>(null);
  const [reload, setReload] = useState(0);
  const epoch = useRef(0);
  const action = useRef(false);
  const selected = projects.find((project) => project.id === selectedId);
  const refresh = useCallback(async () => {
    const items = await api.list();
    setProjects(items);
    setSelectedId((id) =>
      items.some((item) => item.id === id) ? id : (items[0]?.id ?? ""),
    );
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([
      api.list(),
      getApplicationDataClient().storage.getItem<string>("workshop:selection"),
    ])
      .then(([items, saved]) => {
        if (!active) return;
        setProjects(items);
        setSelectedId(
          items.some((item) => item.id === saved)
            ? saved!
            : (items[0]?.id ?? ""),
        );
      })
      .catch((value) => {
        if (active) setError(errorText(value));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      ++epoch.current;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setArtifact(null);
    setPreviewError("");
    if (
      !selectedId ||
      mode === "develop" ||
      !selected?.savedVersionId ||
      selected.error
    ) {
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    void api
      .artifact(selectedId, "saved")
      .then((value) => {
        if (active) setArtifact(value);
      })
      .catch((value) => {
        if (active) setPreviewError(errorText(value));
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId, selected?.savedVersionId, selected?.error, mode, reload]);
  async function perform(label: string, callback: () => Promise<void>) {
    if (action.current) return;
    action.current = true;
    setPending(label);
    setError("");
    try {
      await callback();
    } catch (value) {
      setError(errorText(value));
    } finally {
      action.current = false;
      setPending("");
    }
  }
  function select(id: string) {
    setSelectedId(id);
    void getApplicationDataClient()
      .storage.setItem("workshop:selection", id)
      .catch((value) => setError(`选择保存失败：${errorText(value)}`));
  }
  const update = useCallback((project: ProjectDetail) => {
    setDetail(project);
    setProjects((values) =>
      values.map((item) => (item.id === project.id ? project : item)),
    );
  }, []);
  async function connect(project: ProjectDetail) {
    const token = ++epoch.current;
    setSession(undefined);
    setSessionError("");
    try {
      const value = await developerSession(project);
      if (epoch.current === token) setSession(value);
    } catch (value) {
      if (epoch.current === token) setSessionError(errorText(value));
    }
  }
  function develop(project: ProjectSummary) {
    void perform("正在打开编辑页…", async () => {
      const value = await api.project(project.id);
      select(project.id);
      update(value);
      setMode("develop");
      void connect(value);
    });
  }
  function home() {
    ++epoch.current;
    setMode("home");
    setError("");
    void perform("正在刷新小应用…", refresh);
  }
  function use(project: ProjectSummary) {
    if (project.savedVersionId && !project.error) {
      ++epoch.current;
      select(project.id);
      setMode("use");
      setError("");
    }
  }
  function openCreate() {
    setError("");
    setName("");
    setDescription("");
    setCreateOpen(true);
  }
  const createProject = () =>
    perform("正在创建小应用…", async () => {
      if (!name.trim()) return;
      const project = await api.create(name.trim(), description.trim());
      setProjects((items) => [project, ...items]);
      select(project.id);
      setDetail(project);
      setCreateOpen(false);
      setMode("develop");
      void connect(project);
    });
  return (
    <div className={`wk-shell ${mode === "use" ? "is-using" : ""}`}>
      {mode === "use" ? (
        <UseView
          project={selected}
          artifact={artifact}
          loading={previewLoading}
          error={previewError || error}
          home={home}
          retry={() => setReload((value) => value + 1)}
        />
      ) : mode === "develop" && detail ? (
        <Editor
          key={detail.id}
          initial={detail}
          session={session}
          sessionError={sessionError}
          onChange={update}
          home={home}
          use={() => use(detail)}
          retryChat={() => void connect(detail)}
        />
      ) : (
        <>
          <header className="wk-header">
            <h1 className="wk-brand">
              <LayoutGrid />
              应用工坊
            </h1>
            <div className="wk-header-actions">
              <button
                className="wk-button is-primary"
                disabled={!!pending}
                onClick={() => openCreate()}
              >
                <Plus />
                新建小应用
              </button>
            </div>
          </header>
          {error && (
            <div className="wk-top-error">
              <ErrorNotice>{error}</ErrorNotice>
              {!projects.length && (
                <button
                  className="wk-button"
                  onClick={() => void perform("正在重新加载…", refresh)}
                >
                  重新加载
                </button>
              )}
            </div>
          )}
          {pending && (
            <div className="wk-progress" role="status">
              {pending}
            </div>
          )}
          <Home
            projects={projects}
            selectedId={selectedId}
            select={select}
            create={openCreate}
            develop={develop}
            use={use}
            remove={(project) => {
              setError("");
              setRemoving(project);
            }}
            artifact={artifact}
            loading={loading}
            previewLoading={previewLoading}
            previewError={previewError}
            retry={() => {
              setReload((value) => value + 1);
              void perform("正在重新加载…", refresh);
            }}
          />
        </>
      )}
      {createOpen && (
        <Modal
          title="新建小应用"
          onClose={() => setCreateOpen(false)}
          busy={!!pending}
        >
          <div className="wk-modal-body">
            <label htmlFor="wk-project-name">应用名称</label>
            <input
              id="wk-project-name"
              autoFocus
              value={name}
              maxLength={80}
              placeholder="例如：专注计时器"
              disabled={!!pending}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.nativeEvent.isComposing &&
                  name.trim()
                )
                  void createProject();
              }}
            />
            <label htmlFor="wk-project-description">
              应用说明 <span className="wk-muted">选填</span>
            </label>
            <textarea
              id="wk-project-description"
              value={description}
              maxLength={500}
              placeholder="简单描述这个小应用要做什么"
              disabled={!!pending}
              onChange={(event) => setDescription(event.target.value)}
            />
            <p>创建后进入编辑页，与 AI 一起开发小应用。</p>
            {error && <ErrorNotice>{error}</ErrorNotice>}
          </div>
          <footer>
            <button
              className="wk-button"
              disabled={!!pending}
              onClick={() => setCreateOpen(false)}
            >
              取消
            </button>
            <button
              className="wk-button is-primary"
              disabled={!!pending || !name.trim()}
              onClick={() => void createProject()}
            >
              {pending ? "正在创建…" : "创建并进入开发"}
            </button>
          </footer>
        </Modal>
      )}
      {removing && (
        <Modal
          title="删除小应用"
          onClose={() => setRemoving(null)}
          busy={!!pending}
        >
          <div className="wk-modal-body">
            <p>
              删除「{removing.name}
              」后，源码、保存的版本和项目中的聊天记录将一起删除。
            </p>
            <p>默认工作区和共享工作区无法删除。</p>
            {error && <ErrorNotice>{error}</ErrorNotice>}
          </div>
          <footer>
            <button
              className="wk-button"
              disabled={!!pending}
              onClick={() => setRemoving(null)}
            >
              取消
            </button>
            <button
              className="wk-button is-destructive"
              disabled={!!pending}
              onClick={() =>
                void perform("正在删除小应用…", async () => {
                  await closeProjectSessions(removing.id);
                  await api.remove(removing.id);
                  const storage = getApplicationDataClient().storage;
                  for (const key of await storage.keys())
                    if (key.startsWith(`mini:${removing.id}:`))
                      await storage.removeItem(key);
                  setRemoving(null);
                  await refresh();
                })
              }
            >
              确认删除
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
