import { useEffect, useMemo, useRef, useState } from "react";
import type { ApplicationChatSession } from "@isle/app-sdk/chat";
import { Chat } from "@isle/app-sdk/chat/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Code2,
  FilePlus2,
  History,
  LoaderCircle,
  Maximize2,
  Play,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api, errorText, projectContext } from "./api";
import { AppView, Busy, Empty, ErrorNotice, Modal } from "./components";
import { CodeEditor } from "./CodeEditor";
import { FileTree } from "./FileTree";
import { getVersionNumber, VersionsDialog } from "./VersionsDialog";
import { APP_ENTRY, MAIN_ENTRY, STYLE_ENTRY } from "./contracts";
import type {
  BuildArtifact,
  Diagnostic,
  ProjectDetail,
  SourceFile,
} from "./contracts";

export function Editor({
  initial,
  session,
  sessionError,
  onChange,
  home,
  retryChat,
}: {
  initial: ProjectDetail;
  session?: ApplicationChatSession;
  sessionError: string;
  onChange(project: ProjectDetail): void;
  home(): void;
  retryChat(): void;
}) {
  const [project, setProject] = useState(initial);
  const [path, setPath] = useState(
    initial.files.includes(APP_ENTRY) ? APP_ENTRY : initial.files[0],
  );
  const [source, setSource] = useState<SourceFile | null>(null);
  const [value, setValue] = useState("");
  const [artifact, setArtifact] = useState<BuildArtifact | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [runtimeError, setRuntimeError] = useState("");
  const [pending, setPending] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [viewKey, setViewKey] = useState(0);
  const artifactRef = useRef(artifact);
  artifactRef.current = artifact;
  const [modal, setModal] = useState<
    "file" | "versions" | "reload" | "delete" | null
  >(null);
  const [newPath, setNewPath] = useState("");
  const live = useRef(true);
  const action = useRef("");
  const current = useRef({ project, source, value, path });
  current.current = { project, source, value, path };
  const dirty = !!source && source.content !== value;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  function update(next: ProjectDetail) {
    current.current.project = next;
    setProject(next);
    onChange(next);
  }
  async function loadFile(name: string, force = false) {
    const file = await api.file(initial.id, name);
    if (
      !live.current ||
      current.current.path !== name ||
      (dirtyRef.current && !force)
    )
      return;
    current.current.source = file;
    current.current.value = file.content;
    dirtyRef.current = false;
    setSource(file);
    setValue(file.content);
  }
  async function saveSource(notify = false) {
    const state = current.current;
    if (!dirtyRef.current || !state.source) return state.project;
    const next = await api.write(
      initial.id,
      state.path,
      state.value,
      state.source.revision,
    );
    const file = {
      path: state.path,
      content: state.value,
      revision: next.revision,
    };
    current.current.source = file;
    dirtyRef.current = false;
    setSource(file);
    update(next);
    setArtifact(null);
    if (notify) toast.success("源码已保存。");
    return next;
  }
  async function refresh() {
    const next = await api.project(initial.id);
    if (!live.current) return;
    const previous = current.current.project;
    update(next);
    if (
      next.revision !== previous.revision ||
      current.current.source?.revision !== next.revision
    ) {
      if (dirtyRef.current)
        toast.warning("AI 已更新项目。你的本地修改仍保留，请先处理保存冲突。", {
          id: "workshop-source-conflict",
        });
      else {
        const nextPath = next.files.includes(current.current.path)
          ? current.current.path
          : next.files[0];
        if (nextPath !== current.current.path) setPath(nextPath);
        else await loadFile(nextPath);
      }
    }
    const built = await api.artifact(initial.id, "draft");
    if (live.current) {
      if (
        artifactRef.current?.id !== built?.id ||
        artifactRef.current?.sourceHash !== built?.sourceHash ||
        artifactRef.current?.createdAt !== built?.createdAt
      )
        setRuntimeError("");
      setArtifact(built);
    }
  }
  async function perform(label: string, callback: () => Promise<void>) {
    if (action.current) return;
    action.current = label;
    setPending(label);
    try {
      await callback();
    } catch (value) {
      if (live.current) toast.error(errorText(value), { duration: 5000 });
    } finally {
      action.current = "";
      if (live.current) setPending("");
    }
  }
  const build = () =>
    perform("正在构建…", async () => {
      await saveSource();
      const result = await api.build(initial.id);
      update(result.project);
      setDiagnostics(result.diagnostics);
      setRuntimeError("");
      setArtifact(result.ok ? await api.artifact(initial.id, "draft") : null);
      if (result.ok) toast.success("构建成功，预览已更新。");
      else toast.error("构建未通过，请按错误位置修复源码。");
    });
  const saveVersion = (createNew = false) =>
    perform(createNew ? "正在创建新版本…" : "正在保存版本…", async () => {
      await saveSource();
      if (runtimeError)
        throw new Error("小应用运行出错，请修复并重新构建后再保存。");
      if (!current.current.project.hasDraftBuild) {
        const built = await api.build(initial.id);
        update(built.project);
        setDiagnostics(built.diagnostics);
        if (!built.ok) throw new Error("构建失败，请先修复下面的错误。");
        setArtifact(await api.artifact(initial.id, "draft"));
      }
      const isNewVersion = createNew || !current.current.project.savedVersionId;
      const next = createNew
        ? await api.createVersion(initial.id)
        : await api.save(initial.id);
      update(next);
      setModal(null);
      toast.success(
        isNewVersion
          ? `已创建版本 ${getVersionNumber(next)}。`
          : `版本 ${getVersionNumber(next)} 已保存。`,
      );
    });
  const restoreVersion = (versionId: string) =>
    perform("正在恢复版本…", async () => {
      await saveSource();
      const next = await api.restore(
        project.id,
        versionId,
        current.current.project.revision,
      );
      update(next);
      const nextPath = next.files.includes(path) ? path : next.files[0];
      if (nextPath !== path) setPath(nextPath);
      else await loadFile(nextPath, true);
      setDiagnostics([]);
      setArtifact(await api.artifact(project.id, "draft"));
      setRuntimeError("");
      setModal(null);
      toast.success(`已恢复版本 ${getVersionNumber(next)}，草稿已更新。`);
    });
  const beforeSend = useRef<() => Promise<void>>(async () => {});
  beforeSend.current = async () => {
    if (action.current) throw new Error("请等待当前操作完成。");
    await saveSource();
    const next = await api.project(initial.id);
    update(next);
    const result = await session!.setContext({
      requestContext: projectContext(next),
    });
    if (!result.ok) throw new Error(result.error);
  };
  const guarded = useMemo(
    () =>
      session && {
        ...session,
        async send(input: Parameters<ApplicationChatSession["send"]>[0]) {
          await beforeSend.current();
          return session.send(input);
        },
      },
    [session],
  );
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setSource(null);
    void api
      .file(initial.id, path)
      .then((file) => {
        if (active) {
          current.current.source = file;
          current.current.value = file.content;
          dirtyRef.current = false;
          setSource(file);
          setValue(file.content);
        }
      })
      .catch((value) => {
        if (active) toast.error(errorText(value), { duration: 5000 });
      });
    return () => {
      active = false;
    };
  }, [initial.id, path]);
  useEffect(() => {
    void api
      .artifact(initial.id, "draft")
      .then((value) => {
        if (live.current) setArtifact(value);
      })
      .catch((value) => {
        if (live.current) toast.error(errorText(value), { duration: 5000 });
      });
  }, [initial.id]);
  useEffect(() => {
    if (!session) return;
    let wasBusy = false;
    let polling = false;
    const observe = () => {
      const snapshot = session.getSnapshot();
      const busy =
        !!snapshot.activeTaskId ||
        [
          "preparing",
          "submitting",
          "running",
          "waiting",
          "paused",
          "pausing",
          "stopping",
        ].includes(snapshot.phase);
      setAiBusy(busy);
      if (wasBusy && !busy && !action.current)
        void refresh().catch((value) => {
          if (live.current) toast.error(errorText(value), { duration: 5000 });
        });
      wasBusy = busy;
    };
    observe();
    const detach = session.subscribe(observe);
    const timer = setInterval(() => {
      if (wasBusy && !polling && !action.current) {
        polling = true;
        void refresh()
          .catch((value) => {
            if (live.current) toast.error(errorText(value), { duration: 5000 });
          })
          .finally(() => {
            polling = false;
          });
      }
    }, 1800);
    return () => {
      detach();
      clearInterval(timer);
    };
  }, [session]);
  const switchFile = (name: string) =>
    perform("正在保存源码…", async () => {
      await saveSource();
      setPath(name);
    });
  const navigate = (callback: () => void) =>
    perform("正在保存源码…", async () => {
      await saveSource();
      callback();
    });
  const disabled = !!pending || aiBusy;
  const versionNumber = getVersionNumber(project);
  const versionBlockedReason = runtimeError
    ? "请先修复预览中的运行错误，再构建和保存版本。"
    : dirty || !artifact
      ? "请先构建当前草稿，再保存或创建版本。"
      : "";
  return (
    <div className="wk-editor-shell">
      <header className="wk-header">
        <button
          className="wk-back"
          aria-label="返回应用工坊"
          onClick={() => void navigate(home)}
          disabled={!!pending}
        >
          <ArrowLeft />
          <span>应用工坊</span>
        </button>
        <span className="wk-header-divider" />
        <strong className="wk-header-name">{project.name}</strong>
        <span className="wk-saved">
          <CheckCircle2 />
          {dirty ? "源码未保存" : "源码已保存"}
        </span>
        <div className="wk-header-actions">
          <button
            className="wk-version-trigger"
            aria-label={`版本管理，${versionNumber ? `当前版本 ${versionNumber}` : "尚未保存版本"}`}
            aria-haspopup="dialog"
            aria-expanded={modal === "versions"}
            title="版本管理"
            onClick={() => setModal("versions")}
            disabled={disabled}
          >
            <History />
            <span>{versionNumber ? `版本 ${versionNumber}` : "草稿"}</span>
            <ChevronDown />
          </button>
          <button
            className="wk-button is-primary"
            disabled={disabled || !!versionBlockedReason}
            title={
              versionBlockedReason
                ? versionBlockedReason
                : versionNumber
                  ? `覆盖更新版本 ${versionNumber}`
                  : "将当前草稿保存为第一个版本"
            }
            onClick={() => void saveVersion()}
          >
            {pending === "正在保存版本…" ? (
              <LoaderCircle className="wk-spin" />
            ) : (
              <Save />
            )}
            {pending === "正在保存版本…" ? "保存中…" : "保存"}
          </button>
        </div>
      </header>
      <div className={`wk-editor ${expanded ? "is-preview-expanded" : ""}`}>
        <aside className="wk-files">
          <header>
            <h2>项目文件</h2>
            <button
              className="wk-icon-button"
              aria-label="新建源码文件"
              title="新建文件"
              disabled={disabled}
              onClick={() => {
                setNewPath("");
                setModal("file");
              }}
            >
              <FilePlus2 />
            </button>
          </header>
          <FileTree
            files={project.files}
            selected={path}
            disabled={disabled}
            select={(name) => void switchFile(name)}
          />
          <p>修改后可重新构建预览</p>
        </aside>
        <main className="wk-workspace">
          <section className="wk-source">
            <header className="wk-code-toolbar">
              <div className="wk-file-tabs">
                <button className="is-active" aria-label={`当前文件 ${path}`}>
                  <span>{path}</span>
                  {dirty && <span className="wk-dirty-dot" />}
                </button>
                {path !== STYLE_ENTRY &&
                  project.files.includes(STYLE_ENTRY) && (
                    <button
                      disabled={disabled}
                      onClick={() => void switchFile(STYLE_ENTRY)}
                    >
                      styles.css
                    </button>
                  )}
              </div>
              <div className="wk-code-actions">
                <button
                  className="wk-icon-button"
                  disabled={disabled || !dirty}
                  aria-label="保存源码"
                  title="保存源码 · ⌘/Ctrl S"
                  onClick={() =>
                    void perform("正在保存源码…", async () => {
                      await saveSource(true);
                    })
                  }
                >
                  <Save />
                </button>
                <button
                  className="wk-icon-button"
                  disabled={disabled}
                  aria-label="重新读取源码"
                  title="重新读取源码"
                  onClick={() => setModal("reload")}
                >
                  <RefreshCw />
                </button>
                <button
                  className="wk-icon-button"
                  disabled={
                    disabled ||
                    [MAIN_ENTRY, "package.json", "tsconfig.json"].includes(path)
                  }
                  aria-label="删除当前文件"
                  title="删除当前文件"
                  onClick={() => setModal("delete")}
                >
                  <Trash2 />
                </button>
                <button
                  className="wk-button is-small"
                  disabled={disabled || !source}
                  onClick={() => void build()}
                >
                  {pending === "正在构建…" ? (
                    <LoaderCircle className="wk-spin" />
                  ) : (
                    <Play />
                  )}
                  {pending === "正在构建…" ? "构建中…" : "构建预览"}
                </button>
              </div>
            </header>
            {source ? (
              <CodeEditor
                value={value}
                path={path}
                onChange={(next) => {
                  current.current.value = next;
                  dirtyRef.current = source.content !== next;
                  setValue(next);
                }}
                disabled={disabled}
                save={() =>
                  void perform("正在保存源码…", async () => {
                    await saveSource(true);
                  })
                }
                build={() => void build()}
              />
            ) : (
              <Busy text="正在读取源码…" />
            )}
          </section>
          <section className="wk-runtime">
            <header>
              <strong>运行预览</strong>
              {artifact && !dirty && !runtimeError && (
                <span className="wk-build-status">
                  <CheckCircle2 />
                  构建成功
                </span>
              )}
              {dirty && <span className="wk-muted">源码有修改</span>}
              <div>
                <button
                  className="wk-icon-button"
                  aria-label="重新运行预览"
                  title="重新运行预览"
                  disabled={!artifact}
                  onClick={() => {
                    setRuntimeError("");
                    setViewKey((key) => key + 1);
                  }}
                >
                  <RefreshCw />
                </button>
                <button
                  className="wk-icon-button"
                  aria-label={expanded ? "收起预览" : "展开预览"}
                  title={expanded ? "收起预览" : "展开预览"}
                  onClick={() => setExpanded(!expanded)}
                >
                  <Maximize2 />
                </button>
              </div>
            </header>
            {diagnostics.length > 0 ? (
              <div className="wk-diagnostics" role="alert">
                <h3>构建未通过</h3>
                {diagnostics.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => void switchFile(item.file)}
                  >
                    <strong>
                      {item.file}:{item.line}:{item.column}
                    </strong>
                    <span>{item.message}</span>
                  </button>
                ))}
              </div>
            ) : artifact ? (
              <AppView
                key={viewKey}
                projectId={project.id}
                artifact={artifact}
                onFailure={setRuntimeError}
              />
            ) : (
              <Empty
                title="构建后，在这里试用"
                action={
                  <button
                    className="wk-button"
                    disabled={disabled}
                    onClick={() => void build()}
                  >
                    <Play />
                    构建预览
                  </button>
                }
              >
                让 AI 编写代码，或直接修改上方源码。
              </Empty>
            )}
          </section>
        </main>
        <aside className="wk-assistant">
          <header>
            <h2>
              <Sparkles />
              AI 开发助手
            </h2>
            <p>当前项目 · {project.name}</p>
          </header>
          {guarded ? (
            <Chat
              session={guarded}
              viewId={`workshop:${project.id}`}
              className="wk-chat"
              composer={{ placeholder: "描述需求，或询问这段代码…" }}
            />
          ) : sessionError ? (
            <div className="wk-empty">
              <ErrorNotice>{sessionError}</ErrorNotice>
              <button className="wk-button" onClick={retryChat}>
                重新连接助手
              </button>
            </div>
          ) : (
            <Busy text="正在连接开发助手…" />
          )}
        </aside>
      </div>
      {modal === "file" && (
        <Modal
          title="新建源码文件"
          onClose={() => setModal(null)}
          busy={!!pending}
        >
          <div className="wk-modal-body">
            <label htmlFor="wk-file-name">文件名</label>
            <input
              id="wk-file-name"
              value={newPath}
              onChange={(event) => setNewPath(event.target.value)}
              placeholder="例如 src/components/Counter.tsx"
              maxLength={128}
              autoFocus
            />
            <p>路径相对于 source/，支持 JS、TS、CSS、JSON 和文本文件。</p>
          </div>
          <footer>
            <button
              className="wk-button"
              disabled={!!pending}
              onClick={() => setModal(null)}
            >
              取消
            </button>
            <button
              className="wk-button is-primary"
              disabled={!!pending || !newPath.trim()}
              onClick={() =>
                void perform("正在创建文件…", async () => {
                  await saveSource();
                  const latest = await api.project(project.id);
                  if (latest.files.includes(newPath.trim()))
                    throw new Error("文件已存在。");
                  const next = await api.write(
                    project.id,
                    newPath.trim(),
                    "",
                    latest.revision,
                  );
                  update(next);
                  setPath(newPath.trim());
                  setArtifact(null);
                  setModal(null);
                  toast.success("文件已创建。");
                })
              }
            >
              创建文件
            </button>
          </footer>
        </Modal>
      )}
      {modal === "versions" && (
        <VersionsDialog
          project={project}
          pending={pending}
          disabled={disabled}
          blockedReason={versionBlockedReason}
          onClose={() => setModal(null)}
          onSave={() => void saveVersion()}
          onCreate={() => void saveVersion(true)}
          onRestore={(id) => void restoreVersion(id)}
        />
      )}
      {(modal === "reload" || modal === "delete") && (
        <Modal
          title={modal === "reload" ? "重新读取源码" : "删除源码文件"}
          onClose={() => setModal(null)}
          busy={!!pending}
        >
          <div className="wk-modal-body">
            <p>
              {modal === "reload"
                ? "重新读取会丢弃这个文件的本地未保存修改。"
                : `将删除 ${path}，保存的历史版本仍可恢复。`}
            </p>
          </div>
          <footer>
            <button
              className="wk-button"
              disabled={!!pending}
              onClick={() => setModal(null)}
            >
              取消
            </button>
            <button
              className={`wk-button ${modal === "delete" ? "is-destructive" : "is-primary"}`}
              disabled={!!pending}
              onClick={() =>
                void perform("正在更新源码…", async () => {
                  if (modal === "reload") {
                    await loadFile(path, true);
                    update(await api.project(project.id));
                  } else {
                    if (!current.current.source)
                      throw new Error("请等待源码读取完成。");
                    const next = await api.deleteFile(
                      project.id,
                      path,
                      current.current.source.revision,
                    );
                    update(next);
                    setPath(next.files[0]);
                    setArtifact(null);
                  }
                  setModal(null);
                  toast.success(
                    modal === "delete" ? "文件已删除。" : "源码已重新读取。",
                  );
                })
              }
            >
              确认{modal === "delete" ? "删除" : "重新读取"}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
