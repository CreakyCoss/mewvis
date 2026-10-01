import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { ApplicationChatSession } from "@isle/app-sdk/chat";
import { toast } from "sonner";
import {
  ChevronDown,
  Code2,
  Columns2,
  GripVertical,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api, errorText, projectContext } from "./api";
import {
  ApplicationHeader,
  AppView,
  Busy,
  Empty,
  ErrorNotice,
  Modal,
} from "./components";
import { CodeEditor } from "./CodeEditor";
import { FileTree } from "./FileTree";
import { WorkshopChat } from "./WorkshopChat";
import { getVersionNumber, VersionsDialog } from "./VersionsDialog";
import { APP_ENTRY, MAIN_ENTRY, STYLE_ENTRY } from "./contracts";
import type {
  BuildArtifact,
  Diagnostic,
  ProjectDetail,
  SourceFile,
} from "./contracts";

const workspaceLayouts = [
  { value: "both", label: "同时显示", icon: Columns2 },
  { value: "code", label: "仅代码", icon: Code2 },
  { value: "preview", label: "仅预览", icon: Monitor },
] as const;
type WorkspaceLayout = (typeof workspaceLayouts)[number]["value"];

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
  const [pending, setPending] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [layoutMode, setLayoutMode] = useState<WorkspaceLayout>("preview");
  const [filesExpanded, setFilesExpanded] = useState(true);
  const [codeRatio, setCodeRatio] = useState(64);
  const [resizing, setResizing] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
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
      ...state.source,
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
    if (live.current) setArtifact(built);
  }
  async function perform(label: string, callback: () => Promise<void>) {
    if (action.current) return;
    action.current = label;
    setPending(label);
    try {
      await callback();
    } catch (value) {
      if (live.current) toast.error(errorText(value), { duration: 3000 });
    } finally {
      action.current = "";
      if (live.current) setPending("");
    }
  }
  async function rebuildPreview() {
    await saveSource();
    const result = await api.build(initial.id);
    update(result.project);
    setDiagnostics(result.diagnostics);
    setArtifact(result.ok ? await api.artifact(initial.id, "draft") : null);
    return result.ok;
  }
  const build = () =>
    perform("正在构建…", async () => {
      if (await rebuildPreview()) toast.success("应用预览已更新。");
      else
        toast.error("构建未通过，请按错误位置修复源码。", { duration: 3000 });
    });
  const saveVersion = (createNew = false) =>
    perform(createNew ? "正在创建新版本…" : "正在保存版本…", async () => {
      if (!(await rebuildPreview()))
        throw new Error("预览更新失败，版本未保存。请先修复下面的错误。");
      const isNewVersion = createNew || !current.current.project.savedVersionId;
      const next = createNew
        ? await api.createVersion(initial.id)
        : await api.save(initial.id);
      const file = current.current.source;
      if (file?.revision === next.revision) {
        const savedFile = { ...file, savedContent: file.content };
        current.current.source = savedFile;
        setSource(savedFile);
      }
      update(next);
      if (!createNew) setModal(null);
      toast.success(
        isNewVersion
          ? `已创建版本 ${getVersionNumber(next)}。`
          : `版本 ${getVersionNumber(next)} 已保存。`,
      );
    });
  const restoreVersion = (versionId: string) =>
    perform("正在更新内容…", async () => {
      const restoringCurrent =
        versionId === current.current.project.savedVersionId;
      const next = await api.restore(
        project.id,
        versionId,
        current.current.project.revision,
      );
      dirtyRef.current = false;
      update(next);
      const nextPath = next.files.includes(path) ? path : next.files[0];
      if (nextPath !== path) {
        setSource(null);
        setPath(nextPath);
      } else await loadFile(nextPath, true);
      setDiagnostics([]);
      setArtifact(await api.artifact(project.id, "draft"));
      setModal(null);
      toast.success(
        restoringCurrent
          ? `内容已还原到版本 ${getVersionNumber(next)}。`
          : `已切换到版本 ${getVersionNumber(next)}，内容已更新。`,
      );
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
        if (active) toast.error(errorText(value), { duration: 3000 });
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
        if (live.current) toast.error(errorText(value), { duration: 3000 });
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
          if (live.current) toast.error(errorText(value), { duration: 3000 });
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
            if (live.current) toast.error(errorText(value), { duration: 3000 });
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
  const hasUnsavedChanges =
    !project.savedVersionId ||
    (source?.path === path && source.revision === project.revision
      ? project.changedFiles.some((name) => name !== path) ||
        value !== source.savedContent
      : project.changedFiles.length > 0 || dirty);
  return (
    <div className="wk-editor-shell">
      <ApplicationHeader
        name={project.name}
        home={() => void navigate(home)}
        disabled={!!pending}
      />
      <div
        className={`wk-editor is-layout-${layoutMode} ${expanded ? "is-preview-expanded" : ""}`}
      >
        <main className="wk-workspace">
          <header className="wk-preview-header" aria-label="应用预览操作">
            <div className="wk-preview-context">
              <strong className="wk-preview-title">
                <Monitor aria-hidden="true" />
                <span>应用预览</span>
              </strong>
            </div>
            <div className="wk-preview-actions">
              <div
                className="wk-preview-tools"
                role="group"
                aria-label="版本、更新与保存"
              >
                <button
                  className="wk-version-trigger"
                  aria-label={`版本管理，${versionNumber ? `当前版本 ${versionNumber}` : "尚未保存版本"}`}
                  aria-haspopup="dialog"
                  aria-expanded={modal === "versions"}
                  title="版本管理"
                  onClick={() => setModal("versions")}
                  disabled={disabled}
                >
                  <span>{versionNumber ? `V${versionNumber}` : "版本"}</span>
                  <ChevronDown aria-hidden="true" />
                </button>
                <button
                  className="wk-button wk-preview-refresh"
                  aria-label={pending === "正在构建…" ? "更新中…" : "更新预览"}
                  title="更新应用预览"
                  disabled={disabled || !source}
                  onClick={() => void build()}
                >
                  <RefreshCw
                    className={pending === "正在构建…" ? "wk-spin" : ""}
                    aria-hidden="true"
                  />
                </button>
                <button
                  className="wk-button wk-preview-save"
                  aria-label={
                    pending === "正在保存版本…" ? "保存中…" : "保存版本"
                  }
                  disabled={disabled || !hasUnsavedChanges}
                  title={
                    !hasUnsavedChanges
                      ? "内容无变更"
                      : versionNumber
                        ? `更新预览并保存版本 ${versionNumber}`
                        : "更新预览并保存第一个版本"
                  }
                  onClick={() => void saveVersion()}
                >
                  {pending === "正在保存版本…" ? (
                    <LoaderCircle className="wk-spin" aria-hidden="true" />
                  ) : (
                    <Save aria-hidden="true" />
                  )}
                </button>
              </div>
              <div
                className="wk-layout-switch"
                role="group"
                aria-label="工作区显示方式"
              >
                {workspaceLayouts.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={label}
                    title={label}
                    aria-pressed={
                      expanded ? value === "preview" : layoutMode === value
                    }
                    aria-controls="wk-workspace-content"
                    onClick={() => {
                      setExpanded(false);
                      setLayoutMode(value);
                    }}
                  >
                    <Icon aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          </header>
          <div
            id="wk-workspace-content"
            className={`wk-workspace-content ${resizing ? "is-resizing" : ""}`}
            ref={workspaceRef}
            style={{ "--wk-code-width": `${codeRatio}%` } as CSSProperties}
          >
            <section
              id="wk-code-workspace"
              className={`wk-code-workspace ${filesExpanded ? "is-files-expanded" : ""}`}
            >
              <aside
                id="wk-project-files"
                className="wk-files"
                aria-label="项目文件"
              >
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
                    <Plus aria-hidden="true" />
                  </button>
                </header>
                <FileTree
                  files={project.files}
                  selected={path}
                  disabled={disabled}
                  select={(name) => void switchFile(name)}
                />
                <p>修改后可保存并更新预览</p>
              </aside>
              <section className="wk-source">
                <header className="wk-code-toolbar">
                  <button
                    type="button"
                    className="wk-icon-button wk-file-toggle"
                    aria-label={filesExpanded ? "折叠文件树" : "展开文件树"}
                    title={filesExpanded ? "折叠文件树" : "展开文件树"}
                    aria-expanded={filesExpanded}
                    aria-controls="wk-project-files"
                    onClick={() => setFilesExpanded(!filesExpanded)}
                  >
                    {filesExpanded ? (
                      <PanelLeftClose aria-hidden="true" />
                    ) : (
                      <PanelLeftOpen aria-hidden="true" />
                    )}
                  </button>
                  <div className="wk-file-tabs">
                    <button
                      className="is-active"
                      aria-label={`当前文件 ${path}`}
                    >
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
                        [MAIN_ENTRY, "package.json", "tsconfig.json"].includes(
                          path,
                        )
                      }
                      aria-label="删除当前文件"
                      title="删除当前文件"
                      onClick={() => setModal("delete")}
                    >
                      <Trash2 />
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
            </section>
            <div
              className="wk-workspace-resizer"
              role="separator"
              aria-label="调整代码与预览宽度"
              aria-orientation="vertical"
              aria-valuemin={40}
              aria-valuemax={75}
              aria-valuenow={Math.round(codeRatio)}
              tabIndex={0}
              onPointerDown={(event) => {
                if (event.button !== 0 || !event.isPrimary) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                setResizing(true);
              }}
              onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId))
                  return;
                const rect = workspaceRef.current?.getBoundingClientRect();
                if (rect && rect.width > 6) {
                  const ratio =
                    ((event.clientX - rect.left) / rect.width) * 100;
                  setCodeRatio(Math.max(40, Math.min(75, ratio)));
                }
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
                setResizing(false);
              }}
              onLostPointerCapture={() => setResizing(false)}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowLeft"
                    ? codeRatio - 5
                    : event.key === "ArrowRight"
                      ? codeRatio + 5
                      : event.key === "Home"
                        ? 40
                        : event.key === "End"
                          ? 75
                          : null;
                if (next !== null) {
                  event.preventDefault();
                  setCodeRatio(Math.max(40, Math.min(75, next)));
                }
              }}
            >
              <GripVertical aria-hidden="true" />
            </div>
            <section className="wk-runtime">
              <div className="wk-runtime-surface">
                {diagnostics.length > 0 ? (
                  <div className="wk-diagnostics" role="alert">
                    <h3>应用预览未能生成</h3>
                    <p>把这些问题告诉 AI，继续修复应用。</p>
                    {diagnostics.map((item, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setExpanded(false);
                          setLayoutMode((mode) =>
                            mode === "preview" ? "both" : mode,
                          );
                          void switchFile(item.file);
                        }}
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
                    projectId={project.id}
                    artifact={artifact}
                  />
                ) : (
                  <Empty
                    title={
                      aiBusy ? "AI 正在生成你的应用" : "描述想法，生成你的应用"
                    }
                    icon={
                      <Sparkles className="wk-empty-icon" aria-hidden="true" />
                    }
                  >
                    {aiBusy
                      ? "预览准备好后，就可以在这里直接试用。"
                      : "告诉 AI 你想做什么，生成后在这里直接试用。"}
                  </Empty>
                )}
                <button
                  className="wk-icon-button wk-preview-expand"
                  aria-label={expanded ? "收起预览" : "展开预览"}
                  title={expanded ? "收起预览" : "展开预览"}
                  aria-pressed={expanded}
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? (
                    <Minimize2 aria-hidden="true" />
                  ) : (
                    <Maximize2 aria-hidden="true" />
                  )}
                </button>
              </div>
            </section>
          </div>
        </main>
        <aside className="wk-assistant" aria-label="AI 应用创作">
          <header>
            <h2>
              <Sparkles aria-hidden="true" />
              AI 应用创作
            </h2>
            <p>说出想法，让 AI 帮你做成应用</p>
          </header>
          {guarded ? (
            <WorkshopChat
              session={guarded}
              projectId={project.id}
              name={project.name}
            />
          ) : sessionError ? (
            <div className="wk-empty">
              <ErrorNotice>{sessionError}</ErrorNotice>
              <button className="wk-button" onClick={retryChat}>
                重新连接助手
              </button>
            </div>
          ) : (
            <Busy text="正在连接 AI…" />
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
          hasUnsavedChanges={hasUnsavedChanges}
          onClose={() => setModal(null)}
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
