import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Copy,
  FileText,
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
import appIcon from "../assets/icon-sandbox.png";
import { Inspector } from "./Inspector";
import { copy, uid, validateModel, type Model, type NodeKind } from "./model";
import { templates, makeTemplate } from "./fixtures";
import {
  actor,
  actionReason,
  choose,
  current,
  policyNames,
  simulate,
  startRun,
  step,
  type Policy,
  type Run,
} from "./engine";
import {
  initialWorkspace,
  loadWorkspace,
  saveWorkspace,
  type Workspace,
} from "./storage";
import "./styles.css";

type View = "library" | "model" | "strategy" | "runs" | "versions" | "run";
type Trial = { id: string; projectId: string; run: Run };
type Experiment = {
  id: string;
  projectId: string;
  seed: number;
  players: number;
  errors: string[];
  name: string;
  model: Model;
  rows: {
    policy: Policy;
    completed: number;
    reached: number;
    limited: number;
    average: number;
    error: number;
  }[];
  cancelled: boolean;
};
const nav = [
  { id: "model", name: "模型", icon: Boxes },
  { id: "strategy", name: "策略与场景", icon: FileText },
  { id: "runs", name: "实验记录", icon: History },
  { id: "versions", name: "版本", icon: Layers3 },
] as const;
const number = (v: string, minimum = 0) =>
  Math.min(1_000_000, Math.max(minimum, Math.round(Number(v) || 0)));

function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close(): void;
  children: ReactNode;
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
      onCancel={close}
      aria-labelledby="lab-dialog-title"
    >
      <header>
        <h2 id="lab-dialog-title">{title}</h2>
        <button className="icon-button" aria-label="关闭弹窗" onClick={close}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

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
    [template, setTemplate] = useState("development"),
    [kind, setKind] = useState<NodeKind>("state");
  const [policy, setPolicy] = useState<Policy>("goal"),
    [seed, setSeed] = useState(42),
    [players, setPlayers] = useState(1);
  const [trials, setTrials] = useState<Trial[]>([]),
    [activeTrial, setActiveTrial] = useState("");
  const [cursor, setCursor] = useState(-1),
    [cards, setCards] = useState<string[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]),
    [progress, setProgress] = useState("");
  const cancelled = useRef(false),
    saveSequence = useRef(0);
  const project =
    workspace.projects.find((p) => p.id === workspace.active) ??
    workspace.projects[0];
  const model = project.model;
  const issues = useMemo(() => validateModel(model), [model]);
  const trial = trials.find((t) => t.id === activeTrial);
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
    if (!ready) return;
    if (workspace.projects.some((p) => validateModel(p.model, true).length)) {
      setSaveStatus("结构待修复");
      return;
    }
    const sequence = ++saveSequence.current;
    setSaveStatus("保存中");
    const timer = setTimeout(() => {
      void saveWorkspace(workspace)
        .then(() => {
          if (sequence === saveSequence.current) setSaveStatus("已保存");
        })
        .catch((e) => {
          setSaveStatus("保存失败");
          setError(String(e.message));
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [workspace, ready]);
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
  function selectProject(id: string) {
    const p = workspace.projects.find((p) => p.id === id)!;
    setWorkspace((w) => ({ ...w, active: id }));
    setSelected(p.model.actions[0]?.id ?? p.model.fields[0]?.id ?? "");
    setView("model");
    setError("");
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
  function begin() {
    try {
      const run = startRun(model, seed, players),
        id = uid("run");
      setTrials((ts) =>
        [{ id, projectId: project.id, run }, ...ts].slice(0, 8),
      );
      setActiveTrial(id);
      setCursor(-1);
      setView("run");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function execute(action: string, automatic = false) {
    if (!run) return;
    try {
      const next = step(
        run,
        automatic ? choose(run, policy) : { action, cards },
      );
      setTrials((ts) =>
        ts.map((t) => (t.id === activeTrial ? { ...t, run: next } : t)),
      );
      setCursor(-1);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function addProject(event: React.FormEvent) {
    event.preventDefault();
    if (workspace.projects.length >= 20) {
      setError("首版最多保存 20 个项目。");
      return;
    }
    const m =
      template === "blank"
        ? {
            ...makeTemplate(),
            fields: [],
            capabilities: [],
            actions: [],
            goals: [],
            flow: { actionsPerTurn: 2, maxRounds: 15, income: [] },
          }
        : makeTemplate(template);
    m.id = uid("model");
    m.name = label.trim() || "新的策略模型";
    const id = uid("project");
    setWorkspace((w) => ({
      ...w,
      active: id,
      projects: [...w.projects, { id, model: m, versions: [] }],
    }));
    setSelected(m.actions[0]?.id ?? "");
    setView("model");
    setModal(null);
  }
  function addDefinition(event: React.FormEvent) {
    event.preventDefault();
    const name = label.trim();
    if (!name) return;
    if ((kind === "action" || kind === "goal") && !model.fields.length) {
      setError("先添加一个状态，再定义行动或目标。");
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
  async function experiment() {
    if (issues.length) {
      setError("请先修复模型问题。");
      return;
    }
    cancelled.current = false;
    const snapshot = copy(model),
      policies: Policy[] = [policy, policy === "random" ? "goal" : "random"];
    const result: Experiment = {
      id: uid("experiment"),
      projectId: project.id,
      seed,
      players,
      errors: [],
      name: snapshot.name,
      model: snapshot,
      rows: [],
      cancelled: false,
    };
    for (const p of policies) {
      let completed = 0,
        reached = 0,
        limited = 0,
        steps = 0,
        error = 0;
      for (let i = 0; i < 12 && !cancelled.current; i++) {
        setProgress(`${policyNames[p]} · ${i + 1}/12`);
        try {
          const r = simulate(snapshot, (seed + i) >>> 0, p, players);
          completed++;
          steps += r.entries.length - 1;
          if (current(r).outcome?.kind === "won") reached++;
          else limited++;
        } catch (cause) {
          error++;
          const reason = cause instanceof Error ? cause.message : String(cause);
          if (!result.errors.includes(reason)) result.errors.push(reason);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      result.rows.push({
        policy: p,
        completed,
        reached,
        limited,
        average: completed ? Math.round((steps / completed) * 10) / 10 : 0,
        error,
      });
      if (cancelled.current) break;
    }
    result.cancelled = cancelled.current;
    setExperiments((es) => [result, ...es].slice(0, 10));
    setProgress("");
    setView("runs");
  }

  return (
    <div className="lab-app">
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
        <div className="lab-breadcrumb">
          <span>项目</span>
          <span>/</span>
          <strong>{view === "library" ? "项目库" : model.name}</strong>
        </div>
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
              disabled={!ready || !!issues.length}
              onClick={begin}
            >
              <Play size={17} />
              试运行
            </button>
          )}
        </div>
      </header>
      <div className="lab-shell">
        <aside className="lab-sidebar">
          {view === "library" ? (
            <nav aria-label="工作区导航">
              <button className="active" aria-current="page">
                <LayoutGrid size={20} />
                项目库
              </button>
            </nav>
          ) : (
            <>
              <button
                className="back-button"
                onClick={() => setView("library")}
              >
                <ArrowLeft size={17} />
                返回项目库
              </button>
              <button
                className="project-name"
                onClick={() => setView("library")}
              >
                <span className="project-symbol">
                  <Boxes size={21} />
                </span>
                <strong>{model.name}</strong>
              </button>
              <nav aria-label="项目导航">
                <button
                  className="library-nav"
                  aria-label="项目库"
                  onClick={() => setView("library")}
                >
                  <LayoutGrid size={20} />
                  项目库
                </button>
                {nav.map((item) => (
                  <button
                    key={item.id}
                    className={
                      view === item.id ||
                      (view === "run" && item.id === "model")
                        ? "active"
                        : ""
                    }
                    onClick={() => setView(item.id)}
                  >
                    <item.icon size={20} />
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
            </>
          )}
        </aside>
        <main className={`lab-main view-${view}`}>
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
              />
            </div>
          )}
          {view === "library" && (
            <section className="page-content">
              <div className="page-heading">
                <div>
                  <h1>项目库</h1>
                  <p>先验证一个想法，再决定用什么方式玩。</p>
                </div>
                <button
                  className="button primary"
                  disabled={!ready}
                  onClick={() => {
                    setLabel("");
                    setModal("project");
                  }}
                >
                  <Plus size={18} />
                  新建项目
                </button>
              </div>
              <div className="project-grid">
                {workspace.projects.map((p) => (
                  <button
                    className="project-card"
                    key={p.id}
                    onClick={() => selectProject(p.id)}
                  >
                    <span className="project-symbol">
                      <Boxes size={24} />
                    </span>
                    <h2>{p.model.name}</h2>
                    <p>
                      {p.model.description || "从核心规则开始建立策略模型。"}
                    </p>
                    <footer>
                      <span>
                        {p.model.actions.length} 个行动 · {p.model.goals.length}{" "}
                        个目标
                      </span>
                      <ArrowRight size={18} />
                    </footer>
                  </button>
                ))}
              </div>
            </section>
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
                  <label className="form-field">
                    每阶段行动数
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={model.flow.actionsPerTurn}
                      onChange={(e) =>
                        update((m) => {
                          m.flow.actionsPerTurn = Math.min(
                            10,
                            number(e.target.value, 1),
                          );
                        })
                      }
                    />
                  </label>
                  <label className="form-field">
                    轮数上限
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={model.flow.maxRounds}
                      onChange={(e) =>
                        update((m) => {
                          m.flow.maxRounds = Math.min(
                            100,
                            number(e.target.value, 1),
                          );
                        })
                      }
                    />
                  </label>
                  <p className="hint">
                    行动数与轮数是规则的一部分；修改会进入新的运行快照。
                  </p>
                </section>
              </div>
              <button
                className="button primary"
                disabled={!ready || !!issues.length}
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
                  <h2>{cursor >= 0 ? "历史快照" : "选择下一步"}</h2>
                  {cursor >= 0 ? (
                    <div className="notice-banner">
                      正在查看第 {cursor} 步。
                      <button
                        className="text-button"
                        onClick={() => setCursor(-1)}
                      >
                        回到最新
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
                <button
                  className="button primary"
                  disabled={!!progress || !!issues.length || !ready}
                  onClick={() => void experiment()}
                >
                  <FlaskConical size={17} />
                  运行对照实验
                </button>
              </div>
              <p className="hint">
                每种策略运行 12
                个种子。没有随机机制的模型会得到重复局面；结果仅描述本次样例，不能单独证明平衡或有趣。
              </p>
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
                      <h2>{e.name} · 策略对照</h2>
                      <span className="muted">
                        {e.cancelled ? "已取消，保留部分样本" : "已完成"}
                      </span>
                    </div>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>策略</th>
                          <th>完成局数</th>
                          <th>达成目标</th>
                          <th>截断</th>
                          <th>平均步数</th>
                          <th>异常</th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.rows.map((r) => (
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
                      起始种子 {e.seed} · {e.players} 位参与者 · 每策略最多 12
                      局
                    </p>
                    {e.errors.length > 0 && (
                      <p className="error-banner" role="alert">
                        {e.errors.join("；")}
                      </p>
                    )}
                    <p className="hint">
                      本次实验绑定运行时的规则快照，后续草稿变化不会改写结果。
                    </p>
                  </article>
                ))}
              <h2 className="section-gap">本次会话的对局</h2>
              {trials
                .filter((t) => t.projectId === project.id)
                .map((t) => (
                  <button
                    className="history-row"
                    key={t.id}
                    onClick={() => {
                      setActiveTrial(t.id);
                      setCursor(-1);
                      setView("run");
                    }}
                  >
                    <Play size={18} />
                    <span>
                      {t.run.model.name} · {t.run.entries.length - 1} 步
                    </span>
                    <span className="muted">
                      {current(t.run).outcome ? "已结束" : "可继续"}
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))}
              <p className="hint">
                试运行与实验结果暂保留在本次页面会话中；项目和命名版本通过宿主保存。
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
                  disabled={!!issues.length || !ready}
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
        <Modal title="新建策略项目" close={() => setModal(null)}>
          <form onSubmit={addProject}>
            <label className="form-field">
              项目名称
              <input
                autoFocus
                required
                maxLength={60}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="你想验证什么想法？"
              />
            </label>
            <label className="form-field">
              起点
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              >
                <option value="blank">空白核心模型</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · 参考模型
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">此时无需选择卡牌、棋盘或其他游戏载体。</p>
            <footer>
              <button
                type="button"
                className="button"
                onClick={() => setModal(null)}
              >
                取消
              </button>
              <button className="button primary">创建项目</button>
            </footer>
          </form>
        </Modal>
      )}
      {modal === "definition" && (
        <Modal title="添加模型定义" close={() => setModal(null)}>
          <form onSubmit={addDefinition}>
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
                className="button primary"
                disabled={
                  (kind === "action" || kind === "goal") && !model.fields.length
                }
              >
                添加定义
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {modal === "version" && (
        <Modal title="保存模型版本" close={() => setModal(null)}>
          <form onSubmit={saveVersion}>
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
              <button className="button primary">保存版本</button>
            </footer>
          </form>
        </Modal>
      )}
      {modal === "help" && (
        <Modal title="先验证决策，再选择载体" close={() => setModal(null)}>
          <div className="help-content">
            <p>
              在模型中定义状态、能力、行动和目标。点击节点可编辑，连线来自实际的消耗、效果和依赖。
            </p>
            <p>
              “试运行”会建立独立快照。你可以手动选择行动，或让样例策略执行一步，再通过事件与回放查明原因。
            </p>
            <p>
              “多路径发展”和“组合计分”共用同一个运行器，首版支持整数状态、能力前置、数值效果、组合计分和阈值目标。
            </p>
            <p>
              项目与命名版本由应用数据 SDK
              保存。独立开发预览使用隔离内存，整页刷新会清空；在 Mewvis
              中启用后使用宿主存储。实验结果目前仅保留本次页面会话。
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
