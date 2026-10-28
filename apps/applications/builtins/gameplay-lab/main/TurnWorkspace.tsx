import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { Modal } from "./Modal";
import { projectReadiness } from "./compatibility";
import { type DirectionId } from "./catalog";
import { ProjectOverview } from "./ProjectOverview";
import {
  simulatorName,
  advanceSimulatedRun,
  type SimulatorRef,
  type ReadinessIssue,
} from "./simulators";
import { ComparisonBuilder } from "./ComparisonBuilder";
import { ComparisonResults } from "./ComparisonResults";
import { experimentTotal, experimentVariants, sampleModel } from "./comparison";
import { PlaytestEditor } from "./PlaytestEditor";
import { playtestRepository } from "./playtest-storage";
import {
  selectedSetup,
  initialOf,
  playtestReferences,
  type PlaytestConfig,
  type ExperimentSetup,
  type RunSetup,
} from "./playtest";
import { RulesEditor } from "./RulesEditor";
import { duplicateDefinition, removeDefinition } from "./definitions";
import { historyRepository } from "./history";
import {
  newTrial,
  newConfiguredExperiment,
  trialChoice,
  trialStrategy,
  experimentPolicyName,
  nextSample,
  experimentRows,
  restoreLog,
  type Trial,
  type Experiment,
  type Sample,
} from "./records";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { ProjectSettings } from "./ProjectForms";
import appIcon from "../assets/icon-sandbox.png";
import { Inspector } from "./Inspector";
import { copy, uid, validateModel, type Model, type NodeKind } from "./model";
import { type TemplateId } from "./fixtures";
import { actor, actionReason, choose, current } from "./engine";
import {
  initialWorkspace,
  saveWorkspace,
  projectRepository,
  isTurnProject,
  type Project,
  type Workspace,
} from "./storage";
import "./styles.css";

type View =
  | "library"
  | "overview"
  | "model"
  | "rules"
  | "strategy"
  | "runs"
  | "versions"
  | "run"
  | "settings";
const nav = [
  { id: "overview", name: "策划概览", icon: LayoutGrid },
  { id: "model", name: "规则定义", icon: Boxes },
  { id: "rules", name: "规则与集合", icon: Settings2 },
  { id: "strategy", name: "策略与场景", icon: FileText },
  { id: "runs", name: "实验记录", icon: History },
  { id: "versions", name: "版本", icon: Layers3 },
  { id: "settings", name: "项目设置", icon: Settings2 },
] as const;

const emptyProject: Project = {
  gameType: "systems",
  direction: null,
  simulator: null,
  brief: { coreLoop: "", question: "" },
  id: "",
  workspaceId: "",
  path: "",
  exampleId: null,
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

export default function TurnWorkspace({
  initialProject,
  onExit,
}: {
  initialProject: Project;
  onExit(): void;
}) {
  const [workspace, setWorkspace] = useState<Workspace>(() => ({
    ...initialWorkspace(),
    active: initialProject.id,
    projects: [initialProject],
  }));
  const [ready, setReady] = useState(true),
    [saveStatus, setSaveStatus] = useState("已保存");
  const [view, setView] = useState<View>("overview"),
    [selected, setSelected] = useState("study"),
    [list, setList] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [modal, setModal] = useState<"definition" | "version" | "help" | null>(
    null,
  );
  const [label, setLabel] = useState(""),
    [kind, setKind] = useState<NodeKind>("state");
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<PlaytestConfig | null>(null);
  const [configReady, setConfigReady] = useState("");
  const [configError, setConfigError] = useState("");
  const [configStatus, setConfigStatus] = useState("正在加载");
  const [configRevision, setConfigRevision] = useState(0);
  const configSequence = useRef(0);
  const [trials, setTrials] = useState<Trial[]>([]),
    [activeTrial, setActiveTrial] = useState("");
  const [cursor, setCursor] = useState(-1),
    [cards, setCards] = useState<string[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]),
    [progress, setProgress] = useState("");
  const [previewTrial, setPreviewTrial] = useState<Trial | null>(null);
  const [previewLabel, setPreviewLabel] = useState("");
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
    () => (project.id ? projectReadiness(project) : []),
    [model, project.id, project.simulator, project.direction, project.gameType],
  );
  const setupValidation = useMemo(() => {
    if (
      !config ||
      config.projectId !== project.id ||
      configReady !== project.id
    )
      return {
        runError: "正在读取场景与策略配置。",
        experimentError: "正在读取场景与策略配置。",
      };
    let runError = "",
      experimentError = "";
    try {
      selectedSetup(config, model);
    } catch (cause) {
      runError = (cause as Error).message;
    }
    try {
      selectedSetup(config, model, true);
    } catch (cause) {
      experimentError = (cause as Error).message;
    }
    return { runError, experimentError };
  }, [config, configReady, model, project.id]);
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
    setConfigReady("");
    setConfigError("");
    setConfigStatus("正在加载");
    setConfig(null);
    void playtestRepository()
      .load(project)
      .then((value) => {
        if (!active) return;
        setConfig(value);
        setConfigReady(project.id);
        setConfigStatus("已读取");
      })
      .catch((cause) => {
        if (active) {
          setConfigError((cause as Error).message);
          setConfigStatus("读取失败");
        }
      });
    return () => {
      active = false;
    };
  }, [project.id, project.path, configRevision]);
  useEffect(() => {
    if (!config || configReady !== project.id || busy) return;
    const sequence = ++configSequence.current;
    setConfigStatus("保存中");
    const timer = setTimeout(() => {
      void playtestRepository()
        .save(project, config)
        .then(() => {
          if (sequence === configSequence.current) {
            setConfigStatus("已保存");
            setConfigError("");
          }
        })
        .catch((cause) => {
          if (sequence === configSequence.current) {
            setConfigStatus("保存失败");
            setConfigError((cause as Error).message);
          }
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [config, configReady, project.id, project.path, busy]);

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

  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );
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
  function metadata(
    patch: Partial<
      Pick<Project, "simulator" | "brief" | "direction" | "gameType">
    >,
  ) {
    setWorkspace((w) => ({
      ...w,
      projects: w.projects.map((p) =>
        p.id === w.active ? { ...p, ...copy(patch) } : p,
      ),
    }));
  }
  function selectSimulator(
    ref: SimulatorRef | null,
    direction: DirectionId | null,
  ) {
    metadata({ simulator: ref, direction });
  }
  function openDefinition(type: NodeKind) {
    setKind(type);
    setLabel("");
    setView("model");
    setList(true);
    setModal("definition");
  }
  function fixReadiness(issue: ReadinessIssue) {
    if (issue.view === "simulator") {
      setView("overview");
      requestAnimationFrame(() =>
        document
          .getElementById("simulator-choice")
          ?.scrollIntoView({ block: "center" }),
      );
      return;
    }
    if (issue.view === "rules") {
      setView("rules");
      return;
    }
    if (issue.path === "状态" && !model.fields.length) {
      openDefinition("state");
      return;
    }
    if (issue.path === "行动" && !model.actions.length && model.fields.length) {
      openDefinition("action");
      return;
    }
    if (issue.path === "目标" && !model.goals.length && model.fields.length) {
      openDefinition("goal");
      return;
    }
    setView("model");
    setList(true);
    if (issue.nodeId) inspect(issue.nodeId);
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
      if (!config || configReady !== project.id)
        throw new Error("请先等待场景与策略读取完成，再删除定义。");
      const refs = playtestReferences(config, id);
      if (refs.length)
        throw new Error(`请先解除场景与策略引用：${refs.join("、")}`);
      const next = copy(model);
      removeDefinition(next, id);
      update((m) => Object.assign(m, next));
      setSelected(next.actions[0]?.id ?? next.fields[0]?.id ?? "");
      setNotice("定义已删除。");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function exit() {
    setBusy(true);
    setError("");
    try {
      await saveWorkspace({ ...workspace, projects: [project] });
      if (config && configReady === project.id)
        await playtestRepository().save(project, config);
      await historyRepository().flush();
      onExit();
    } catch (cause) {
      setError((cause as Error).message);
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
      const loaded = await projectRepository().reload(project);
      if (!isTurnProject(loaded))
        throw new Error("项目类型已变化，请返回项目库重新打开。");
      const value = loaded;
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
  async function resetProject(exampleId: TemplateId) {
    setBusy(true);
    try {
      const result = await projectRepository().reset(project, exampleId);
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
      setNotice(`示例已应用，原规则备份于 ${result.backup}`);
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
    if (
      busy ||
      historyReady !== project.id ||
      !config ||
      configReady !== project.id
    )
      return;
    setBusy(true);
    try {
      if (!project.simulator) throw new Error("请先在策划概览选择玩法模拟器。");
      const setup = selectedSetup(config, model) as RunSetup;
      const trial = newTrial(
        project.id,
        model,
        setup.scenario.seedStart,
        setup.scenario.participants.length,
        setup,
        project.simulator,
      );
      await saveWorkspace({ ...workspace, projects: [project] });
      await playtestRepository().save(project, config);
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
      const decision = automatic
        ? trialChoice(trial)
        : { driver: "manual", choice: { action, cards } };
      const next = {
        ...trial,
        run: advanceSimulatedRun(run, decision.choice),
        drivers: [...trial.drivers, decision.driver],
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
          effects: [],
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
                  simulator: copy(p.simulator),
                  gameType: p.gameType,
                  direction: p.direction,
                  brief: copy(p.brief),
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
  async function experiment(existing?: Experiment, proposed?: Experiment) {
    if (experimentRunning.current || historyReady !== project.id) return;
    if (!existing && !proposed && issues.length) {
      setError("请先修复模型问题。");
      return;
    }
    experimentRunning.current = true;
    cancelled.current = false;
    const location = copy(project);
    let result: Experiment;
    try {
      if (!existing && (!config || configReady !== project.id))
        throw new Error("请先读取场景与策略配置。");
      result = existing
        ? { ...copy(existing), status: "running" }
        : proposed
          ? copy(proposed)
          : newConfiguredExperiment(
              project.id,
              model,
              selectedSetup(config!, model, true) as ExperimentSetup,
              project.simulator!,
            );
    } catch (cause) {
      setError((cause as Error).message);
      experimentRunning.current = false;
      return;
    }
    const display = (value: Experiment) =>
      setExperiments((es) => [value, ...es.filter((e) => e.id !== value.id)]);
    try {
      if (!existing) {
        if (!proposed || !validateModel(location.model, true).length)
          await saveWorkspace({ ...workspace, projects: [location] });
        await playtestRepository().save(location, config!);
      }
      await historyRepository().save(location, result);
      display(result);
      setView("runs");
      while (!cancelled.current) {
        setProgress(`${result.samples.length}/${experimentTotal(result)} 局`);
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
          result.samples.length === experimentTotal(result)
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
        sampleModel(experiment, sample),
        sample.seed,
        experiment.players,
        sample.log,
        experiment.setup ? initialOf(experiment.setup.scenario) : undefined,
        experiment.simulator,
      );
      const arm = experiment.setup?.arms.find((a) => a.id === sample.policy);
      const setup =
        experiment.setup && arm
          ? {
              scenario: {
                ...copy(experiment.setup.scenario),
                participants: experiment.setup.scenario.participants.map(
                  (p, i) => ({ ...copy(p), strategyId: arm.strategyIds[i] }),
                ),
              },
              strategies: copy(experiment.setup.strategies),
            }
          : undefined;
      setPreviewTrial({
        ...(setup ? { setup } : {}),
        id: `${experiment.id}-${sample.variant ?? "baseline"}-${sample.policy}-${sample.index}`,
        projectId: experiment.projectId,
        createdAt: experiment.createdAt,
        updatedAt: experiment.updatedAt,
        drivers: [],
        run,
      });
      setPreviewLabel(
        `${experiment.comparison ? experimentVariants(experiment).find((v) => v.id === sample.variant)?.name + " · " : ""}${experimentPolicyName(experiment, sample.policy)} · 种子 ${sample.seed}`,
      );
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
                !ready ||
                busy ||
                !!issues.length ||
                historyReady !== project.id ||
                !!setupValidation.runError ||
                !!configError
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
              onClick={() => void exit()}
            >
              <ArrowLeft size={17} />
              返回项目库
            </button>
            <button
              className="project-name"
              disabled={busy}
              onClick={() => void exit()}
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
                onClick={() => void exit()}
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
                  {item.id === "rules"
                    ? project.gameType === "card"
                      ? "卡牌与回合"
                      : "流程与产出"
                    : item.name}
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
          {project.id &&
            view !== "strategy" &&
            (configError ||
              (configReady === project.id && setupValidation.runError)) && (
              <div className="notice-banner" role="status">
                场景与策略配置待检查：{configError || setupValidation.runError}
                <button
                  className="text-button"
                  onClick={() => setView("strategy")}
                >
                  查看配置
                </button>
              </div>
            )}
          {view === "runs" && setupValidation.experimentError && (
            <div className="notice-banner">
              实验配置：{setupValidation.experimentError}
              <button
                className="text-button"
                onClick={() => setView("strategy")}
              >
                配置对照策略
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
          {view === "overview" && project.id && (
            <ProjectOverview
              project={project}
              busy={busy}
              runDisabled={
                historyReady !== project.id ||
                configReady !== project.id ||
                !!configError ||
                !!setupValidation.runError
              }
              update={update}
              brief={(brief) => metadata({ brief })}
              selectSimulator={selectSimulator}
              add={openDefinition}
              fix={fixReadiness}
              run={() => void begin()}
            />
          )}
          {view === "model" && (
            <div className="model-layout">
              <section className="model-workspace">
                <header className="workspace-heading">
                  <div>
                    <h1>规则定义</h1>
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
                key={project.id + ":" + selected}
                defaultAdvanced={project.exampleId === null}
                model={model}
                selected={selected}
                select={inspect}
                update={update}
                duplicate={duplicate}
                remove={remove}
                references={config ? playtestReferences(config, selected) : []}
              />
            </div>
          )}
          {view === "settings" && project.id && (
            <ProjectSettings
              key={project.id + ":" + project.exampleId}
              project={project}
              busy={busy}
              rename={(name) =>
                update((m) => {
                  m.name = name;
                })
              }
              reload={reloadProject}
              reset={resetProject}
              selectSimulator={selectSimulator}
            />
          )}
          {view === "rules" && (
            <RulesEditor
              model={model}
              cardMode={project.gameType === "card"}
              update={update}
              duplicate={duplicate}
              remove={remove}
            />
          )}
          {view === "strategy" &&
            (config && configReady === project.id ? (
              <PlaytestEditor
                key={project.id}
                model={model}
                config={config}
                status={configStatus}
                error={configError}
                change={(work) =>
                  setConfig((current) => {
                    if (!current) return current;
                    const next = copy(current);
                    work(next);
                    return next;
                  })
                }
                busy={busy || historyReady !== project.id}
                runDisabled={!!issues.length}
                reload={() => setConfigRevision((n) => n + 1)}
                run={() => void begin()}
              />
            ) : (
              <section className="page-content">
                <h1>策略与场景</h1>
                <p className="hint">
                  {configError || "正在读取场景与策略配置…"}
                </p>
                <button
                  className="button"
                  onClick={() => setConfigRevision((n) => n + 1)}
                >
                  重新加载配置
                </button>
              </section>
            ))}
          {view === "run" && run && entry && (
            <section className="page-content run-page">
              <div className="page-heading">
                <div>
                  {run.simulator && (
                    <div className="simulator-badge">
                      {simulatorName(run.simulator)} · v{run.simulator.version}
                    </div>
                  )}
                  <div className="eyebrow">
                    {previewTrial && <div>{previewLabel}</div>}
                    基于独立规则快照 · {run.model.name}
                    {trial?.setup && <> · 场景 {trial.setup.scenario.name}</>}
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
                                  <span>
                                    {card.group} · 基础值 {card.value}
                                  </span>
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
                        策略：
                        {trial
                          ? (trialStrategy(trial)?.name ?? "目标优先")
                          : "目标优先"}
                        。使用本局创建时的策略快照执行。
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
                  <p>在选定场景中，比较第一位参与者的策略与各自的目标结果。</p>
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
                      historyReady !== project.id ||
                      !!setupValidation.experimentError ||
                      !!configError
                    }
                    onClick={() => void experiment()}
                  >
                    <FlaskConical size={17} />
                    运行策略对照
                  </button>
                </div>
              </div>
              <p className="hint">
                实验使用“策略与场景”中选择的种子范围和对照策略。各组使用相同初始配置；双人时另一位参与者的策略保持固定。
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
              {config && configReady === project.id && (
                <ComparisonBuilder
                  key={project.id}
                  project={project}
                  config={config}
                  disabled={
                    !!progress ||
                    busy ||
                    !ready ||
                    historyReady !== project.id ||
                    !!configError
                  }
                  start={(value) => void experiment(undefined, value)}
                />
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
                .map((e) =>
                  e.comparison ? (
                    <ComparisonResults
                      key={e.id}
                      experiment={e}
                      busy={!!progress || busy || historyReady !== project.id}
                      resume={() => void experiment(e)}
                      preview={(sample) => previewSample(e, sample)}
                    />
                  ) : (
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
                              <td>{experimentPolicyName(e, r.policy)}</td>
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
                        {e.setup && <>场景 {e.setup.scenario.name} · </>}
                        起始种子 {e.seed} · {e.players} 位参与者 · 每策略最多{" "}
                        {e.count} 局 · {new Date(e.createdAt).toLocaleString()}
                      </p>
                      <div className="player-results">
                        <h3>参与者与目标达成局数</h3>
                        <div className="table-scroll">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>对照策略</th>
                                {Array.from({ length: e.players }, (_, i) => (
                                  <th key={i}>
                                    {e.setup?.scenario.participants[i].name ??
                                      `玩家 ${String.fromCharCode(65 + i)}`}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {experimentRows(e).map((row) => (
                                <tr key={row.policy}>
                                  <td>{experimentPolicyName(e, row.policy)}</td>
                                  {row.players.map((p, i) => (
                                    <td key={p.id}>
                                      {p.reached} 局达标
                                      <small>
                                        {e.setup &&
                                          `策略：${e.setup.strategies.find((s) => s.id === e.setup!.arms.find((a) => a.id === row.policy)!.strategyIds[i])?.name} · `}
                                        {p.goals
                                          .map((g) => `${g.name} ${g.reached}`)
                                          .join(" / ")}
                                      </small>
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
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
                      {(e.status === "cancelled" ||
                        e.status === "interrupted") &&
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
                              {experimentPolicyName(e, sample.policy)} · 种子{" "}
                              {sample.seed}
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
                  ),
                )}
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
                      metadata({
                        simulator: v.simulator ?? null,
                        gameType: v.gameType ?? project.gameType,
                        direction: v.direction ?? null,
                        ...(v.brief ? { brief: copy(v.brief) } : {}),
                      });
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
      {modal === "definition" && (
        <Modal title="添加模型定义" close={() => setModal(null)}>
          <ApplicationForm onSubmit={addDefinition}>
            <label className="form-field">
              定义类型
              <NativeSelect
                value={kind}
                onChange={(event) => setKind(event.target.value as NodeKind)}
                aria-label="定义类型"
                size="sm"
              >
                {(Object.keys(kindNames) as NodeKind[]).map((k) => (
                  <NativeSelectOption value={k} key={k}>
                    {kindNames[k]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
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
        <Modal title="从策划到第一次试玩" close={() => setModal(null)}>
          <div className="help-content">
            <p>
              新建时先选择游戏类型与玩法方向，再从零编写内容或复制该类型的示例。策划概览记录设计目标、核心循环与待验证问题。
            </p>
            <p>
              在“规则定义”中添加自己的状态、能力、行动和目标。点击定义可编辑，连线来自实际的消耗、效果和依赖。概览中的就绪检查会提示缺项并提供编辑入口，最小规则完成后即可人工试玩。
            </p>
            <p>
              “策略与场景”可保存参与者初始配置、自定义策略和实验对照选择。配置保存在项目
              configs/playtest.json，运行记录保存独立配置快照。
            </p>
            <p>
              在“实验记录”展开“版本与参数对照”，可以比较命名版本与草稿，或扫描单个数值。结果保留各分组的规则快照，可查看差值并逐局回放。
            </p>
            <p>
              卡牌项目的“卡牌与回合”设计牌池、卡牌、选择与周期结算；经营项目的“流程与产出”设计行动机会和周期效果。删除定义前需先解除引用。
            </p>
            <p>
              “试运行”会冻结规则、场景、玩家策略和模拟器版本。你可以手动选择行动，或让自动玩家执行一步，再通过事件与回放查明原因。
            </p>
            <p>
              回合发展支持资源支付、周期产出、能力解锁和阈值目标；卡牌组合还支持自定义牌池、选牌、计分、弃置和补充。不兼容的规则会阻止运行并提示原因。
            </p>
            <p>
              新建项目时填写名称和父目录。规则、模拟器选择、设计说明及命名版本保存在项目的
              models/core.json，
              后续编辑只保存自己的项目。项目设置支持选择当前类型的玩法方向，以及应用或重置同类示例；替换示例前自动备份。对局和实验保存到项目目录，重开后可继续对局、逐步回放或补跑剩余实验样本。
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
