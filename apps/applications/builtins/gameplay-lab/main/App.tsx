import { RulesEditor } from "./RulesEditor";
import { duplicateDefinition, removeDefinition } from "./definitions";
import { historyRepository } from "./history";
import {
  newTrial,
  newExperiment,
  nextSample,
  experimentRows,
  restoreLog,
  type Trial,
  type Experiment,
  type Sample,
} from "./records";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Copy,
  FileText,
  FolderOpen,
  Settings2,
  Flag,
  FlaskConical,
  GitBranch,
  History,
  Info,
  Layers3,
  LayoutGrid,
  Play,
  Plus,
  Save,
  Square,
  X,
} from "lucide-react";
import { Graph, kindNames } from "./Graph";
import { ApplicationForm } from "./Form";
import { ProjectLibrary } from "./ProjectLibrary";
import { ProjectCreateForm, ProjectSettings } from "./ProjectForms";
import appIcon from "../assets/icon-sandbox.png";
import { Inspector } from "./Inspector";
import { copy, uid, validateModel, type Model, type NodeKind } from "./model";
import { type TemplateId } from "./fixtures";
import {
  actor,
  actionReason,
  choose,
  current,
  policyNames,
  step,
  type Policy,
} from "./engine";
import {
  initialWorkspace,
  loadWorkspace,
  saveWorkspace,
  projectRepository,
  type Project,
  type Workspace,
} from "./storage";
import "./styles.css";

type View =
  | "library"
  | "model"
  | "rules"
  | "strategy"
  | "runs"
  | "versions"
  | "run"
  | "settings";
const nav = [
  { id: "model", name: "模型", icon: Boxes },
  { id: "rules", name: "规则与集合", icon: Settings2 },
  { id: "strategy", name: "策略与场景", icon: FileText },
  { id: "runs", name: "实验记录", icon: History },
  { id: "versions", name: "版本", icon: Layers3 },
  { id: "settings", name: "项目设置", icon: Settings2 },
] as const;
const number = (v: string, minimum = 0) =>
  Math.min(1_000_000, Math.max(minimum, Math.round(Number(v) || 0)));

function Modal({
  title,
  close,
  children,
  busy = false,
}: {
  title: string;
  close(): void;
  children: ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    ref.current
      ?.querySelector<HTMLInputElement | HTMLSelectElement>("input, select")
      ?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className="lab-modal"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else close();
      }}
      aria-labelledby="lab-dialog-title"
    >
      <header>
        <h2 id="lab-dialog-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="关闭弹窗"
          onClick={close}
          disabled={busy}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

const emptyProject: Project = {
  id: "",
  workspaceId: "",
  path: "",
  templateId: null,
  createdAt: "",
  versions: [],
  model: {
    format: "gameplay-model-v1",
    id: "empty",
    name: "",
    description: "",
    fields: [],
    capabilities: [],
    actions: [],
    goals: [],
    collections: [],
    flow: { actionsPerTurn: 2, maxRounds: 15, income: [] },
  },
};

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const [ready, setReady] = useState(false),
    [saveStatus, setSaveStatus] = useState("正在加载");
  const [view, setView] = useState<View>("library"),
    [selected, setSelected] = useState("study"),
    [list, setList] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [modal, setModal] = useState<
    "project" | "definition" | "version" | "help" | null
  >(null);
  const [label, setLabel] = useState(""),
    [kind, setKind] = useState<NodeKind>("state");
  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState<Policy>("goal"),
    [seed, setSeed] = useState(42),
    [players, setPlayers] = useState(1);
  const [trials, setTrials] = useState<Trial[]>([]),
    [activeTrial, setActiveTrial] = useState("");
  const [cursor, setCursor] = useState(-1),
    [cards, setCards] = useState<string[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]),
    [progress, setProgress] = useState("");
  const [previewTrial, setPreviewTrial] = useState<Trial | null>(null);
  const [historyReady, setHistoryReady] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);
  const mainRef = useRef<HTMLElement>(null);
  const experimentRunning = useRef(false);
  const cancelled = useRef(false),
    saveSequence = useRef(0);
  const project =
    workspace.projects.find((p) => p.id === workspace.active) ?? emptyProject;
  const model = project.model;
  const issues = useMemo(
    () => (project.id ? validateModel(model) : []),
    [model, project.id],
  );
  const trial = previewTrial ?? trials.find((t) => t.id === activeTrial);
  const run = trial?.run,
    state = run ? current(run) : null;
  const entry = run
    ? run.entries[
        cursor >= 0
          ? Math.min(cursor, run.entries.length - 1)
          : run.entries.length - 1
      ]
    : null;

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [view, workspace.active]);

  useEffect(() => {
    if (!project.id) return;
    let active = true;
    setHistoryReady("");
    setHistoryError("");
    setPreviewTrial(null);
    setActiveTrial("");
    void historyRepository()
      .list(project)
      .then((result) => {
        if (!active) return;
        setTrials((ts) => [
          ...ts.filter((t) => t.projectId !== project.id),
          ...result.trials,
        ]);
        setExperiments((es) => [
          ...es.filter((e) => e.projectId !== project.id),
          ...result.experiments,
        ]);
        setHistoryError(result.errors.join("；"));
        setHistoryReady(project.id);
      })
      .catch((cause) => {
        if (active)
          setHistoryError(
            `记录加载失败：${cause instanceof Error ? cause.message : String(cause)}`,
          );
      });
    return () => {
      active = false;
    };
  }, [project.id, project.path, historyRevision]);

  useEffect(() => {
    const query = matchMedia("(max-width: 600px)");
    const fit = () => {
      if (query.matches) setList(true);
    };
    fit();
    query.addEventListener("change", fit);
    return () => query.removeEventListener("change", fit);
  }, []);

  useEffect(() => {
    let active = true;
    void loadWorkspace()
      .then((value) => {
        if (active) {
          setWorkspace(value);
          setReady(true);
          setSaveStatus("已保存");
        }
      })
      .catch((e) => {
        if (active) {
          setError(String(e.message));
          setSaveStatus("加载失败");
        }
      });
    return () => {
      active = false;
      cancelled.current = true;
    };
  }, []);
  useEffect(() => {
    if (!ready || !project.id || busy) return;
    if (validateModel(project.model, true).length) {
      setSaveStatus("结构待修复");
      return;
    }
    const sequence = ++saveSequence.current;
    setSaveStatus("保存中");
    const timer = setTimeout(() => {
      void saveWorkspace({ ...workspace, projects: [project] })
        .then(() => {
          if (sequence === saveSequence.current) setSaveStatus("已保存");
        })
        .catch((e) => {
          setSaveStatus("保存失败");
          setError(String(e.message));
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [project, ready, busy]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!state || !run) return;
    const next = choose(run, "goal");
    setCards(next.cards ?? []);
  }, [run?.entries.length, activeTrial]);

  function update(change: (m: Model) => void) {
    setWorkspace((w) => ({
      ...w,
      projects: w.projects.map((p) => {
        if (p.id !== w.active) return p;
        const model = copy(p.model);
        change(model);
        return { ...p, model };
      }),
    }));
  }
  function duplicate(id: string) {
    try {
      const next = copy(model),
        selectedId = duplicateDefinition(next, id);
      update((m) => Object.assign(m, next));
      setSelected(selectedId);
      setNotice("已复制定义，引用保持指向原定义。");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  function remove(id: string) {
    try {
      const next = copy(model);
      removeDefinition(next, id);
      update((m) => Object.assign(m, next));
      setSelected(next.actions[0]?.id ?? next.fields[0]?.id ?? "");
      setNotice("定义已删除。");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function selectProject(id: string) {
    const pending = workspace.projects.find((item) => item.id === id);
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      if (project.id)
        await saveWorkspace({ ...workspace, projects: [project] });
      const value = await projectRepository().reload(pending);
      setWorkspace((w) => ({
        ...w,
        active: id,
        projects: w.projects.map((item) => (item.id === id ? value : item)),
      }));
      setSelected(
        value.model.actions[0]?.id ?? value.model.fields[0]?.id ?? "",
      );
      setHistoryRevision((n) => n + 1);
      setView("model");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  function acceptProject(value: Project) {
    setWorkspace((w) => ({
      ...w,
      active: value.id,
      projects: [...w.projects.filter((p) => p.id !== value.id), value],
    }));
    setSelected(value.model.actions[0]?.id ?? value.model.fields[0]?.id ?? "");
    setHistoryRevision((n) => n + 1);
    setView("model");
    setModal(null);
    setError("");
  }
  async function openProject() {
    setBusy(true);
    setError("");
    try {
      if (project.id)
        await saveWorkspace({ ...workspace, projects: [project] });
      const value = await projectRepository().open();
      if (value) acceptProject(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function reloadProject() {
    setBusy(true);
    try {
      await projectRepository()
        .flush()
        .catch(() => {});
      const value = await projectRepository().reload(project);
      setWorkspace((w) => ({
        ...w,
        projects: w.projects.map((p) => (p.id === value.id ? value : p)),
      }));
      setError("");
      setHistoryRevision((n) => n + 1);
      setNotice("已从项目 JSON 重新读取。");
    } finally {
      setBusy(false);
    }
  }
  async function resetProject(templateId: TemplateId) {
    setBusy(true);
    try {
      const result = await projectRepository().reset(project, templateId);
      setWorkspace((w) => ({
        ...w,
        projects: w.projects.map((p) =>
          p.id === project.id ? result.project : p,
        ),
      }));
      setSelected(
        result.project.model.actions[0]?.id ??
          result.project.model.fields[0]?.id ??
          "",
      );
      setError("");
      setNotice(`模板已应用，原规则备份于 ${result.backup}`);
    } finally {
      setBusy(false);
    }
  }
  function inspect(id: string) {
    setSelected(id);
    if (matchMedia("(max-width: 1100px)").matches) {
      requestAnimationFrame(() =>
        document
          .querySelector(".lab-inspector")
          ?.scrollIntoView({ block: "start" }),
      );
    }
  }
  async function begin() {
    if (busy || historyReady !== project.id) return;
    setBusy(true);
    try {
      const trial = newTrial(project.id, model, seed, players);
      await saveWorkspace({ ...workspace, projects: [project] });
      await historyRepository().save(project, trial);
      setTrials((ts) => [trial, ...ts]);
      setPreviewTrial(null);
      setActiveTrial(trial.id);
      setCursor(-1);
      setView("run");
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function execute(action: string, automatic = false) {
    if (!run || !trial || previewTrial || busy) return;
    setBusy(true);
    try {
      const next = {
        ...trial,
        run: step(run, automatic ? choose(run, policy) : { action, cards }),
        drivers: [...trial.drivers, automatic ? policy : ("manual" as const)],
        updatedAt: new Date().toISOString(),
      };
      await historyRepository().save(project, next);
      setTrials((ts) => ts.map((t) => (t.id === next.id ? next : t)));
      setCursor(-1);
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function addDefinition(event: React.FormEvent) {
    event.preventDefault();
    const name = label.trim();
    if (!name) return;
    if ((kind === "action" || kind === "goal") && !model.fields.length) {
      setError("先添加一个状态，再定义行动或目标。");
      return;
    }
    const group =
      kind === "state"
        ? model.fields
        : kind === "capability"
          ? model.capabilities
          : kind === "action"
            ? model.actions
            : model.goals;
    if (group.length >= 80) {
      setError("同类定义最多 80 项。");
      return;
    }
    const id = uid(kind);
    update((m) => {
      if (kind === "state")
        m.fields.push({ id, name, description: "", initial: 0, role: "stock" });
      if (kind === "capability")
        m.capabilities.push({ id, name, description: "", initial: false });
      if (kind === "action")
        m.actions.push({
          id,
          name,
          description: "",
          costs: [],
          requires: [],
          effects: [{ type: "add", field: m.fields[0].id, value: 1 }],
        });
      if (kind === "goal")
        m.goals.push({
          id,
          name,
          description: "",
          field: m.fields[0].id,
          threshold: 100,
        });
    });
    setSelected(id);
    setModal(null);
  }
  function saveVersion(event: React.FormEvent) {
    event.preventDefault();
    if (issues.length) {
      setError("修复模型问题后再保存版本。");
      return;
    }
    if (project.versions.length >= 10) {
      setError("首版每个项目最多 10 个版本。");
      return;
    }
    setWorkspace((w) => ({
      ...w,
      projects: w.projects.map((p) =>
        p.id === w.active
          ? {
              ...p,
              versions: [
                ...p.versions,
                {
                  id: uid("version"),
                  name: label.trim() || `版本 ${p.versions.length + 1}`,
                  model: copy(p.model),
                  createdAt: new Date().toISOString(),
                },
              ],
            }
          : p,
      ),
    }));
    setModal(null);
    setNotice("模型版本已保存，后续编辑不会覆盖它。");
  }
  async function experiment(existing?: Experiment) {
    if (experimentRunning.current || historyReady !== project.id) return;
    if (!existing && issues.length) {
      setError("请先修复模型问题。");
      return;
    }
    experimentRunning.current = true;
    cancelled.current = false;
    const location = copy(project);
    let result = existing
      ? { ...copy(existing), status: "running" as const }
      : newExperiment(project.id, model, seed, players, policy);
    const display = (value: Experiment) =>
      setExperiments((es) => [value, ...es.filter((e) => e.id !== value.id)]);
    try {
      if (!existing)
        await saveWorkspace({ ...workspace, projects: [location] });
      await historyRepository().save(location, result);
      display(result);
      setView("runs");
      while (!cancelled.current) {
        setProgress(
          `${result.samples.length}/${result.count * result.policies.length} 局`,
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (cancelled.current) break;
        const sample = nextSample(result);
        if (!sample) break;
        const next = {
          ...result,
          samples: [...result.samples, sample],
          updatedAt: new Date().toISOString(),
        };
        await historyRepository().save(location, next);
        result = next;
        display(result);
      }
      result = {
        ...result,
        status:
          result.samples.length === result.count * result.policies.length
            ? "completed"
            : "cancelled",
        updatedAt: new Date().toISOString(),
      };
      await historyRepository().save(location, result);
      display(result);
    } catch (cause) {
      display({ ...result, status: "interrupted" });
      setError(`实验已暂停，已写入的样本仍可查看。${(cause as Error).message}`);
    } finally {
      setProgress("");
      experimentRunning.current = false;
    }
  }
  function previewSample(experiment: Experiment, sample: Sample) {
    try {
      const run = restoreLog(
        experiment.model,
        sample.seed,
        experiment.players,
        sample.log,
      );
      setPreviewTrial({
        id: `${experiment.id}-${sample.policy}-${sample.index}`,
        projectId: experiment.projectId,
        createdAt: experiment.createdAt,
        updatedAt: experiment.updatedAt,
        drivers: [],
        run,
      });
      setCursor(0);
      setView("run");
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return (
    <div className={`lab-app${view === "library" ? " library-home" : ""}`}>
      <header className="lab-header">
        <div className="lab-brand">
          <img
            className="lab-brand-icon"
            src={appIcon}
            width={32}
            height={32}
            alt=""
            draggable={false}
          />
          <strong>游戏沙盘</strong>
        </div>
        {view !== "library" && (
          <div className="lab-breadcrumb">
            <span>项目</span>
            <span>/</span>
            <strong>{model.name}</strong>
          </div>
        )}
        {view !== "library" && (
          <span className="save-status" role="status">
            <i />
            草稿 · {saveStatus}
          </span>
        )}
        <div className="header-actions">
          <button
            className="button"
            aria-label="使用指南"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={17} />
            <span>使用指南</span>
          </button>
          {view !== "library" && (
            <button
              className="button primary"
              disabled={
                !ready || busy || !!issues.length || historyReady !== project.id
              }
              onClick={begin}
            >
              <Play size={17} />
              试运行
            </button>
          )}
        </div>
      </header>
      <div className="lab-shell">
        {view !== "library" && (
          <aside className="lab-sidebar">
            <button
              className="back-button"
              disabled={busy}
              onClick={() => setView("library")}
            >
              <ArrowLeft size={17} />
              返回项目库
            </button>
            <button
              className="project-name"
              disabled={busy}
              onClick={() => setView("library")}
            >
              <span className="project-symbol">
                <Boxes size={18} />
              </span>
              <strong>{model.name}</strong>
            </button>
            <nav aria-label="项目导航">
              <button
                className="library-nav"
                disabled={busy}
                aria-label="项目库"
                onClick={() => setView("library")}
              >
                <LayoutGrid size={16} />
                项目库
              </button>
              {nav.map((item) => (
                <button
                  key={item.id}
                  disabled={busy}
                  className={
                    view === item.id || (view === "run" && item.id === "model")
                      ? "active"
                      : ""
                  }
                  onClick={() => setView(item.id)}
                >
                  <item.icon size={16} />
                  {item.name}
                </button>
              ))}
            </nav>
            <div className="stage-label">
              <FlaskConical size={17} />
              <span>
                当前阶段：<strong>核心验证</strong>
              </span>
            </div>
          </aside>
        )}
        <main ref={mainRef} className={`lab-main view-${view}`} inert={busy}>
          {project.id &&
            historyError &&
            historyReady !== project.id &&
            view !== "runs" && (
              <div className="error-banner" role="alert">
                {historyError}
                <button className="text-button" onClick={() => setView("runs")}>
                  查看与重新加载记录
                </button>
              </div>
            )}
          {error && (
            <div className="error-banner" role="alert">
              <Info size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="关闭错误"
                onClick={() => setError("")}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {!ready && (
            <div className="notice-banner">
              {error
                ? "加载未完成，原数据不会被覆盖。可刷新重试。"
                : "正在读取项目…"}
            </div>
          )}
          {notice && (
            <div className="notice-banner" role="status">
              <Check size={17} />
              {notice}
            </div>
          )}
          {view === "model" && (
            <div className="model-layout">
              <section className="model-workspace">
                <header className="workspace-heading">
                  <div>
                    <h1>核心模型</h1>
                    <p>查看规则如何影响状态与目标。</p>
                  </div>
                  <div className="workspace-tools">
                    <div className="view-toggle" aria-label="模型视图">
                      <button
                        aria-pressed={list}
                        className={list ? "active" : ""}
                        onClick={() => setList(true)}
                      >
                        定义
                      </button>
                      <button
                        aria-pressed={!list}
                        className={!list ? "active" : ""}
                        onClick={() => setList(false)}
                      >
                        关系
                      </button>
                    </div>
                    <button
                      className="button"
                      onClick={() => {
                        setLabel("");
                        setKind("state");
                        setModal("definition");
                      }}
                    >
                      <Plus size={17} />
                      添加定义
                    </button>
                  </div>
                </header>
                <Graph
                  model={model}
                  selected={selected}
                  select={inspect}
                  list={list}
                />
                {issues.length > 0 && (
                  <div className="validation-errors" role="alert">
                    {issues.slice(0, 5).map((i, n) => (
                      <p key={n}>
                        {i.path}：{i.message}
                      </p>
                    ))}
                  </div>
                )}
              </section>
              <Inspector
                model={model}
                selected={selected}
                select={inspect}
                update={update}
                duplicate={duplicate}
                remove={remove}
              />
            </div>
          )}
          {view === "library" && (
            <ProjectLibrary
              projects={workspace.projects}
              ready={ready && !busy}
              errors={workspace.errors}
              attach={() => void openProject()}
              create={() => {
                setLabel("");
                setModal("project");
              }}
              open={(id) => void selectProject(id)}
            />
          )}
          {view === "settings" && project.id && (
            <ProjectSettings
              key={project.id + ":" + project.templateId}
              project={project}
              busy={busy}
              rename={(name) =>
                update((m) => {
                  m.name = name;
                })
              }
              reload={reloadProject}
              reset={resetProject}
            />
          )}
          {view === "rules" && (
            <RulesEditor
              model={model}
              update={update}
              duplicate={duplicate}
              remove={remove}
            />
          )}
          {view === "strategy" && (
            <section className="page-content">
              <div className="page-heading">
                <div>
                  <h1>策略与场景</h1>
                  <p>保持规则相同，比较不同的选择与初始条件。</p>
                </div>
              </div>
              <div className="settings-grid">
                <section className="settings-section">
                  <h2>决策策略</h2>
                  {(Object.keys(policyNames) as Policy[]).map((p) => (
                    <label
                      className={`policy-option ${policy === p ? "selected" : ""}`}
                      key={p}
                    >
                      <input
                        type="radio"
                        name="policy"
                        checked={policy === p}
                        onChange={() => setPolicy(p)}
                      />
                      <span>
                        <strong>{policyNames[p]}</strong>
                        <small>
                          {p === "goal"
                            ? "优先推进目标；组合计分时选择当前得分最高的组合。"
                            : p === "growth"
                              ? "先提升有限的产出或倍率，再推进目标。"
                              : "按种子选择可执行行动，用于建立简单基线。"}
                        </small>
                      </span>
                    </label>
                  ))}
                  <p className="hint">
                    这些是可运行的样例策略，不代表最优策略。
                  </p>
                </section>
                <section className="settings-section">
                  <h2>运行场景</h2>
                  <label className="form-field">
                    随机种子
                    <input
                      type="number"
                      min="0"
                      max="4294967295"
                      value={seed}
                      onChange={(e) =>
                        setSeed(
                          Math.max(
                            0,
                            Math.min(
                              0xffffffff,
                              Math.round(Number(e.target.value) || 0),
                            ),
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="form-field">
                    参与者
                    <select
                      value={players}
                      onChange={(e) => setPlayers(Number(e.target.value))}
                    >
                      <option value="1">1 位 · 单人目标</option>
                      <option value="2">2 位 · 轮流竞争</option>
                    </select>
                  </label>
                  <p className="hint">
                    行动数、轮数和周期结算在“规则与集合”中编辑。
                  </p>
                </section>
              </div>
              <button
                className="button primary"
                disabled={
                  !ready ||
                  busy ||
                  !!issues.length ||
                  historyReady !== project.id
                }
                onClick={begin}
              >
                <Play size={17} />
                用此配置试运行
              </button>
            </section>
          )}
          {view === "run" && run && entry && (
            <section className="page-content run-page">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    基于独立规则快照 · {run.model.name}
                  </div>
                  <h1>
                    试运行{" "}
                    <span className="round-pill">
                      第 {entry.state.round} 轮
                    </span>
                  </h1>
                  <p>
                    {actor(entry.state).name} · 剩余 {entry.state.remaining}{" "}
                    次行动 · 种子 {run.seed}
                  </p>
                </div>
                <button className="button" onClick={() => setView("model")}>
                  <ArrowLeft size={17} />
                  返回模型
                </button>
              </div>
              {JSON.stringify(run.model) !== JSON.stringify(model) && (
                <div className="notice-banner">
                  <GitBranch size={17} />
                  草稿已改变，本局仍使用开始时的规则。点击顶部“试运行”可建立新快照。
                </div>
              )}
              <div className="run-grid">
                <section>
                  <h2>当前状态</h2>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>状态</th>
                        {entry.state.players.map((p) => (
                          <th key={p.id}>{p.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {run.model.fields.map((f) => (
                        <tr key={f.id}>
                          <td>{f.name}</td>
                          {entry.state.players.map((p) => (
                            <td key={p.id}>{p.values[f.id]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <h2 className="section-gap">目标进度</h2>
                  {run.model.goals.map((g) => (
                    <div className="goal-row" key={g.id}>
                      <div>
                        <Flag size={17} />
                        <strong>{g.name}</strong>
                      </div>
                      {entry.state.players.map((p) => (
                        <p key={p.id}>
                          {p.name}：{p.values[g.field]} / {g.threshold}
                        </p>
                      ))}
                    </div>
                  ))}
                  {entry.state.outcome && (
                    <div className="outcome" role="status">
                      <CheckCircle2 size={26} />
                      <div>
                        <h2>
                          {entry.state.outcome.kind === "won"
                            ? "目标已达成"
                            : "运行已截断"}
                        </h2>
                        <p>
                          {entry.state.outcome.winners
                            .map(
                              (w) =>
                                `${entry.state.players.find((p) => p.id === w.player)?.name} · ${run.model.goals.find((g) => g.id === w.goal)?.name}`,
                            )
                            .join("；") || entry.state.outcome.reason}
                        </p>
                      </div>
                    </div>
                  )}
                </section>
                <section>
                  <h2>
                    {cursor >= 0 || previewTrial ? "历史快照" : "选择下一步"}
                  </h2>
                  {cursor >= 0 || previewTrial ? (
                    <div className="notice-banner">
                      正在查看第 {cursor >= 0 ? cursor : run.entries.length - 1}{" "}
                      步。{previewTrial && "实验样本只读。"}
                      <button
                        className="text-button"
                        onClick={() =>
                          previewTrial ? setView("runs") : setCursor(-1)
                        }
                      >
                        {previewTrial ? "返回实验记录" : "回到最新"}
                      </button>
                    </div>
                  ) : (
                    <>
                      {run.model.collections.map((c) => {
                        const pile = actor(entry.state).collections[c.id];
                        return (
                          <div className="collection" key={c.id}>
                            <h3>
                              {c.name}
                              <small>
                                选 1–{c.maxSelect} 个 · 牌库 {pile.draw.length}{" "}
                                · 已使用 {pile.discard.length}
                              </small>
                            </h3>
                            <div className="card-options">
                              {pile.hand.map((card) => (
                                <label
                                  key={card.id}
                                  className={
                                    cards.includes(card.id) ? "selected" : ""
                                  }
                                >
                                  <input
                                    type="checkbox"
                                    checked={cards.includes(card.id)}
                                    onChange={(e) =>
                                      setCards((ids) =>
                                        e.target.checked
                                          ? [...ids, card.id]
                                          : ids.filter((id) => id !== card.id),
                                      )
                                    }
                                  />
                                  <strong>{card.name}</strong>
                                  <span>基础值 {card.value}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      {run.model.actions.map((a) => {
                        const reason = actionReason(run.model, entry.state, a);
                        return (
                          <button
                            className="action-offer"
                            key={a.id}
                            disabled={!!reason}
                            onClick={() => execute(a.id)}
                          >
                            <span>
                              <strong>{a.name}</strong>
                              <small>{reason || a.description}</small>
                            </span>
                            <Play size={17} />
                          </button>
                        );
                      })}
                      <div className="run-actions">
                        <button
                          className="button primary"
                          disabled={!!entry.state.outcome}
                          onClick={() => execute("", true)}
                        >
                          <Play size={16} />
                          策略单步
                        </button>
                        <button
                          className="button"
                          disabled={!!entry.state.outcome}
                          onClick={() => execute("__end_turn")}
                        >
                          <Square size={15} />
                          结束行动
                        </button>
                      </div>
                      <p className="hint">
                        策略：{policyNames[policy]}
                        。实际结算由同一规则引擎执行。
                      </p>
                    </>
                  )}
                </section>
              </div>
              <section className="event-section">
                <div className="section-title">
                  <h2>事件与回放</h2>
                  <span className="muted">{run.entries.length - 1} 步决策</span>
                </div>
                <label className="timeline-label">
                  查看快照
                  <input
                    aria-label="回放步骤"
                    type="range"
                    min="0"
                    max={run.entries.length - 1}
                    value={cursor >= 0 ? cursor : run.entries.length - 1}
                    onChange={(e) => setCursor(Number(e.target.value))}
                  />
                </label>
                <ol className="event-list">
                  {run.entries
                    .map((e, i) => (
                      <li key={i}>
                        <button
                          onClick={() => setCursor(i)}
                          className={cursor === i ? "selected" : ""}
                        >
                          <span className="step-number">
                            {String(i).padStart(2, "0")}
                          </span>
                          <div>
                            <strong>{e.title}</strong>
                            <small>
                              {e.actor} · {e.notes.join("；")}
                            </small>
                          </div>
                        </button>
                      </li>
                    ))
                    .reverse()}
                </ol>
              </section>
            </section>
          )}
          {view === "runs" && (
            <section className="page-content">
              <div className="page-heading">
                <div>
                  <h1>实验记录</h1>
                  <p>在相同初始条件下，比较所选策略与一个简单基线。</p>
                </div>
                <div className="settings-actions">
                  <button
                    className="button"
                    disabled={!!progress || busy}
                    onClick={() => setHistoryRevision((n) => n + 1)}
                  >
                    重新加载记录
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      !!progress ||
                      !!issues.length ||
                      !ready ||
                      busy ||
                      historyReady !== project.id
                    }
                    onClick={() => void experiment()}
                  >
                    <FlaskConical size={17} />
                    运行对照实验
                  </button>
                </div>
              </div>
              <p className="hint">
                每种策略运行 12
                个种子。没有随机机制的模型会得到重复局面；结果仅描述本次样例，不能单独证明平衡或有趣。
              </p>
              <p className="record-state" role="status">
                {historyReady === project.id
                  ? "对局与实验自动保存到项目目录，每次决策和每局样本完成后写入。"
                  : historyError
                    ? "记录读取失败，可重新加载。"
                    : "正在读取项目记录…"}
              </p>
              {historyError && (
                <div className="error-banner" role="alert">
                  {historyError}
                </div>
              )}
              {progress && (
                <div className="notice-banner" role="status">
                  正在运行：{progress}
                  <button
                    className="text-button"
                    onClick={() => {
                      cancelled.current = true;
                    }}
                  >
                    取消，保留已完成结果
                  </button>
                </div>
              )}
              {!experiments.some((e) => e.projectId === project.id) && (
                <div className="empty">
                  <FlaskConical size={34} />
                  <h2>从一个设计问题开始</h2>
                  <p>先到“策略与场景”选择策略，再运行参数和策略对照。</p>
                </div>
              )}
              {experiments
                .filter((e) => e.projectId === project.id)
                .map((e) => (
                  <article className="experiment-record" key={e.id}>
                    <div className="section-title">
                      <h2>{e.model.name} · 策略对照</h2>
                      <span className="muted">
                        {
                          {
                            completed: "已完成",
                            cancelled: "已取消，保留部分样本",
                            interrupted: "已中断，可继续",
                            running: "运行中",
                          }[e.status]
                        }
                      </span>
                    </div>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>策略</th>
                          <th>完成局数</th>
                          <th>本局有人达标</th>
                          <th>截断</th>
                          <th>平均步数</th>
                          <th>异常</th>
                        </tr>
                      </thead>
                      <tbody>
                        {experimentRows(e).map((r) => (
                          <tr key={r.policy}>
                            <td>{policyNames[r.policy]}</td>
                            <td>{r.completed}</td>
                            <td>{r.reached}</td>
                            <td>{r.limited}</td>
                            <td>{r.average}</td>
                            <td>{r.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="hint">
                      起始种子 {e.seed} · {e.players} 位参与者 · 每策略最多{" "}
                      {e.count} 局 · {new Date(e.createdAt).toLocaleString()}
                    </p>
                    {e.samples.some((s) => s.error) && (
                      <p className="error-banner" role="alert">
                        {[
                          ...new Set(
                            e.samples.flatMap((s) =>
                              s.error ? [s.error] : [],
                            ),
                          ),
                        ].join("；")}
                      </p>
                    )}
                    <p className="hint">
                      结果使用实验创建时的规则快照。“本局有人达标”统计任一参与者达到目标的局数。
                    </p>
                    {(e.status === "cancelled" || e.status === "interrupted") &&
                      e.samples.length < e.count * e.policies.length && (
                        <button
                          className="button"
                          disabled={
                            !!progress || busy || historyReady !== project.id
                          }
                          onClick={() => void experiment(e)}
                        >
                          继续剩余样本
                        </button>
                      )}
                    <details className="sample-list">
                      <summary>逐局样本与回放（{e.samples.length}）</summary>
                      {e.samples.map((sample) => (
                        <button
                          className="history-row"
                          key={`${sample.policy}:${sample.index}`}
                          onClick={() => previewSample(e, sample)}
                        >
                          <Play size={15} />
                          <span>
                            {policyNames[sample.policy]} · 种子 {sample.seed}
                            <small className="history-meta">
                              {sample.log.choices.length} 步 ·{" "}
                              {sample.error
                                ? `异常：${sample.error}`
                                : sample.log.final.outcome?.kind === "won"
                                  ? "目标已达成"
                                  : "已截断"}
                            </small>
                          </span>
                          <ChevronRight size={15} />
                        </button>
                      ))}
                    </details>
                  </article>
                ))}
              <h2 className="section-gap">已保存的对局</h2>
              {trials
                .filter((t) => t.projectId === project.id)
                .map((t) => (
                  <button
                    className="history-row"
                    key={t.id}
                    onClick={() => {
                      setPreviewTrial(null);
                      setActiveTrial(t.id);
                      setCursor(-1);
                      setView("run");
                    }}
                  >
                    <Play size={18} />
                    <span>
                      {t.run.model.name} · {t.run.entries.length - 1} 步
                      <small className="history-meta">
                        {new Date(t.updatedAt).toLocaleString()} · 种子{" "}
                        {t.run.seed}
                      </small>
                    </span>
                    <span className="muted">
                      {current(t.run).outcome ? "已结束" : "可继续"}
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))}
              <p className="hint">
                记录保存在项目的 runs/ 和 experiments/
                中，包含规则快照、种子、决策、事件和最终状态。重新打开项目后可继续对局或逐步回放。
              </p>
            </section>
          )}
          {view === "versions" && (
            <section className="page-content">
              <div className="page-heading">
                <div>
                  <h1>模型版本</h1>
                  <p>将一次设计冻结下来，再放心尝试新的数值。</p>
                </div>
                <button
                  className="button primary"
                  disabled={!!issues.length || !ready || busy}
                  onClick={() => {
                    setLabel(`版本 ${project.versions.length + 1}`);
                    setModal("version");
                  }}
                >
                  <Save size={17} />
                  保存版本
                </button>
              </div>
              {!project.versions.length && (
                <div className="empty">
                  <Layers3 size={34} />
                  <h2>还没有命名版本</h2>
                  <p>草稿会自动保存；命名版本保留一份独立的规则快照。</p>
                </div>
              )}
              {project.versions.map((v) => (
                <article className="version-row" key={v.id}>
                  <span className="node-icon">
                    <GitBranch size={20} />
                  </span>
                  <div>
                    <h2>{v.name}</h2>
                    <p>
                      {v.model.actions.length} 个行动 · {v.model.goals.length}{" "}
                      个目标 · {new Date(v.createdAt).toLocaleString("zh-CN")}
                    </p>
                    <small>
                      {JSON.stringify(v.model) === JSON.stringify(model)
                        ? "与当前草稿一致"
                        : "与当前草稿不同，原版本已保留"}
                    </small>
                  </div>
                  <button
                    className="button"
                    onClick={() => {
                      update((m) => Object.assign(m, copy(v.model)));
                      setNotice("已将此版本复制为草稿，历史版本仍保留。");
                    }}
                  >
                    <Copy size={16} />
                    复制为草稿
                  </button>
                </article>
              ))}
            </section>
          )}
        </main>
      </div>
      {modal === "project" && (
        <Modal title="新建策略项目" busy={busy} close={() => setModal(null)}>
          <ProjectCreateForm
            created={acceptProject}
            close={() => setModal(null)}
            busyChanged={setBusy}
            beforeCreate={async () => {
              if (project.id)
                await saveWorkspace({ ...workspace, projects: [project] });
            }}
          />
        </Modal>
      )}
      {modal === "definition" && (
        <Modal title="添加模型定义" close={() => setModal(null)}>
          <ApplicationForm onSubmit={addDefinition}>
            <label className="form-field">
              定义类型
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as NodeKind)}
              >
                {(Object.keys(kindNames) as NodeKind[]).map((k) => (
                  <option value={k} key={k}>
                    {kindNames[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              名称
              <input
                autoFocus
                required
                maxLength={60}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <p className="hint">名称可修改，内部引用会保持稳定。</p>
            <footer>
              <button
                type="button"
                className="button"
                onClick={() => setModal(null)}
              >
                取消
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={
                  (kind === "action" || kind === "goal") && !model.fields.length
                }
              >
                添加定义
              </button>
            </footer>
          </ApplicationForm>
        </Modal>
      )}
      {modal === "version" && (
        <Modal title="保存模型版本" close={() => setModal(null)}>
          <ApplicationForm onSubmit={saveVersion}>
            <label className="form-field">
              版本名称
              <input
                autoFocus
                required
                maxLength={60}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <p className="hint">保存完整规则快照，之后编辑不会覆盖此版本。</p>
            <footer>
              <button
                type="button"
                className="button"
                onClick={() => setModal(null)}
              >
                取消
              </button>
              <button type="submit" className="button primary">
                保存版本
              </button>
            </footer>
          </ApplicationForm>
        </Modal>
      )}
      {modal === "help" && (
        <Modal title="先验证决策，再选择载体" close={() => setModal(null)}>
          <div className="help-content">
            <p>
              在模型中定义状态、能力、行动和目标。点击节点可编辑，连线来自实际的消耗、效果和依赖。
            </p>
            <p>
              “规则与集合”编辑周期效果、集合容量与对象素材；行动的高级规则可设置计分集合、倍率和同类配对奖励。删除定义前需先解除引用。
            </p>
            <p>
              “试运行”会建立独立快照。你可以手动选择行动，或让样例策略执行一步，再通过事件与回放查明原因。
            </p>
            <p>
              “多路径发展”和“组合计分”共用同一个运行器，首版支持整数状态、能力前置、数值效果、组合计分和阈值目标。
            </p>
            <p>
              新建项目时选择策略模板和父目录。规则及命名版本保存在项目的
              models/core.json，
              后续编辑只保存这份文件。项目设置支持切换模板和重置，替换前自动备份。对局和实验保存到项目目录，重开后可继续对局、逐步回放或补跑剩余实验样本。
            </p>
            <button className="button primary" onClick={() => setModal(null)}>
              开始探索
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
