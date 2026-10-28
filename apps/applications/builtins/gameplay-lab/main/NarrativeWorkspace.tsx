import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Flag,
  GitBranch,
  History,
  LayoutGrid,
  Play,
  Plus,
  Save,
  Settings2,
  Users,
  Variable,
} from "lucide-react";
import { copy, uid } from "./model";
import { DirectionPicker } from "./DirectionPicker";
import { directionDefinition, gameTypeName } from "./catalog";
import { projectReadiness } from "./compatibility";
import { projectRepository, isNarrativeProject, type Project } from "./storage";
import { narrativeHistory } from "./narrative-storage";
import {
  validateNarrative,
  narrativeAnalysis,
  conditionPass,
  newStoryRecord,
  chooseStory,
  storyState,
  type NarrativeModel,
  type StoryValue,
  type StoryVariable,
  type StoryChoice,
  type StoryCondition,
  type StoryEffect,
  type StoryRecord,
} from "./narrative";
import { Modal } from "./Modal";
import { ApplicationForm } from "./Form";
import appIcon from "../assets/icon-sandbox.png";
type View =
  | "overview"
  | "characters"
  | "nodes"
  | "variables"
  | "history"
  | "versions"
  | "settings"
  | "play";
const navigation = [
  { id: "overview", name: "策划概览", icon: LayoutGrid },
  { id: "characters", name: "人物", icon: Users },
  { id: "nodes", name: "剧情与选择", icon: GitBranch },
  { id: "variables", name: "状态变量", icon: Variable },
  { id: "history", name: "试玩记录", icon: History },
  { id: "versions", name: "版本", icon: BookOpen },
  { id: "settings", name: "项目设置", icon: Settings2 },
] as const;
const operations = {
  eq: "等于",
  neq: "不等于",
  gte: "大于等于",
  lte: "小于等于",
};
function ValueInput({
  type,
  value,
  change,
  label,
}: {
  type: StoryVariable["type"];
  value: StoryValue;
  change(value: StoryValue): void;
  label: string;
}) {
  if (type === "boolean")
    return (
      <NativeSelect
        aria-label={label}
        value={String(value)}
        onChange={(event) => change(event.target.value === "true")}
        size="sm"
      >
        <NativeSelectOption value="false">否</NativeSelectOption>
        <NativeSelectOption value="true">是</NativeSelectOption>
      </NativeSelect>
    );
  return (
    <input
      aria-label={label}
      type={type === "number" ? "number" : "text"}
      min={type === "number" ? -1_000_000 : undefined}
      max={type === "number" ? 1_000_000 : undefined}
      maxLength={1000}
      value={String(value)}
      onChange={(e) =>
        change(
          type === "number"
            ? Math.max(
                -1_000_000,
                Math.min(1_000_000, Math.trunc(Number(e.target.value) || 0)),
              )
            : e.target.value,
        )
      }
    />
  );
}
function ChoiceEditor({
  choice,
  index,
  model,
  change,
  remove,
}: {
  choice: StoryChoice;
  index: number;
  model: NarrativeModel;
  change(change: (choice: StoryChoice) => void): void;
  remove(): void;
}) {
  const first = model.variables[0];
  function ruleItem(
    rule: StoryCondition | StoryEffect,
    i: number,
    kind: "conditions" | "effects",
  ) {
    const variable = model.variables.find((v) => v.id === rule.variable),
      condition = kind === "conditions",
      c = rule as StoryCondition,
      e = rule as StoryEffect;
    const prefix = `选项 ${index + 1} ${condition ? "条件" : "后果"} ${i + 1}`;
    return (
      <div className="story-rule-row" key={i}>
        <NativeSelect
          aria-label={`${prefix} 变量`}
          value={rule.variable}
          onChange={(event) =>
            change((choice) => {
              const v = model.variables.find(
                (v) => v.id === event.target.value,
              )!;
              const r = choice[kind][i];
              r.variable = v.id;
              r.value = copy(v.initial);
              if ("op" in r) r.op = "eq";
              else r.operation = "set";
            })
          }
          size="sm"
        >
          {!variable && (
            <NativeSelectOption value={rule.variable}>
              缺失变量
            </NativeSelectOption>
          )}
          {model.variables.map((v) => (
            <NativeSelectOption key={v.id} value={v.id}>
              {v.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {condition ? (
          <NativeSelect
            aria-label={`${prefix} 比较`}
            value={c.op}
            onChange={(event) =>
              change((choice) => {
                choice.conditions[i].op = event.target
                  .value as StoryCondition["op"];
              })
            }
            size="sm"
          >
            {Object.entries(operations)
              .filter(
                ([op]) =>
                  variable?.type === "number" || ["eq", "neq"].includes(op),
              )
              .map(([op, name]) => (
                <NativeSelectOption key={op} value={op}>
                  {name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        ) : (
          <NativeSelect
            aria-label={`${prefix} 操作`}
            value={e.operation}
            onChange={(event) =>
              change((choice) => {
                choice.effects[i].operation = event.target
                  .value as StoryEffect["operation"];
              })
            }
            size="sm"
          >
            <NativeSelectOption value="set">设置为</NativeSelectOption>
            {variable?.type === "number" && (
              <NativeSelectOption value="add">增加 / 减少</NativeSelectOption>
            )}
          </NativeSelect>
        )}
        <ValueInput
          label={`${prefix} 值`}
          type={variable?.type ?? "text"}
          value={rule.value}
          change={(value) =>
            change((choice) => {
              choice[kind][i].value = value;
            })
          }
        />
        <button
          className="text-button danger-text"
          aria-label={`移除${prefix}`}
          onClick={() =>
            change((choice) => {
              choice[kind].splice(i, 1);
            })
          }
        >
          移除
        </button>
      </div>
    );
  }
  return (
    <section className="story-choice-editor" aria-label={`选项 ${index + 1}`}>
      <div className="section-title">
        <h3>选项 {index + 1}</h3>
        <button className="text-button danger-text" onClick={remove}>
          移除选项
        </button>
      </div>
      <label className="form-field">
        选项文字
        <input
          aria-label={`选项 ${index + 1} 文字`}
          value={choice.label}
          maxLength={300}
          onChange={(e) =>
            change((c) => {
              c.label = e.target.value;
            })
          }
        />
      </label>
      <label className="form-field">
        前往剧情
        <NativeSelect
          aria-label={`选项 ${index + 1} 目标`}
          value={choice.target}
          onChange={(event) =>
            change((c) => {
              c.target = event.target.value;
            })
          }
          size="sm"
        >
          <NativeSelectOption value="">请选择目标剧情</NativeSelectOption>
          {model.nodes.map((n) => (
            <NativeSelectOption key={n.id} value={n.id}>
              {n.title}
              {n.ending ? " · 结局" : ""}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <h3>可选条件 · 全部满足</h3>
      {choice.conditions.map((r, i) => ruleItem(r, i, "conditions"))}
      <button
        className="text-button"
        disabled={!first || choice.conditions.length >= 20}
        onClick={() =>
          change((c) => {
            c.conditions.push({
              variable: first!.id,
              op: "eq",
              value: copy(first!.initial),
            });
          })
        }
      >
        添加条件
      </button>
      <h3>选择后的状态变化 · 按顺序执行</h3>
      {choice.effects.map((r, i) => ruleItem(r, i, "effects"))}
      <button
        className="text-button"
        disabled={!first || choice.effects.length >= 20}
        onClick={() =>
          change((c) => {
            c.effects.push({
              variable: first!.id,
              operation: "set",
              value: copy(first!.initial),
            });
          })
        }
      >
        添加后果
      </button>
      {!first && (
        <p className="hint">需要条件或后果时，先在“状态变量”定义标记或数值。</p>
      )}
    </section>
  );
}
export default function NarrativeWorkspace({
  initialProject,
  onExit,
}: {
  initialProject: Project<NarrativeModel>;
  onExit(): void;
}) {
  const [project, setProject] = useState(initialProject),
    [view, setView] = useState<View>("overview"),
    [selected, setSelected] = useState(""),
    [saveStatus, setSaveStatus] = useState("已保存"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [records, setRecords] = useState<StoryRecord[]>([]),
    [record, setRecord] = useState<StoryRecord | null>(null),
    [cursor, setCursor] = useState(-1),
    [historyReady, setHistoryReady] = useState(false),
    [historyRevision, setHistoryRevision] = useState(0),
    [historyErrors, setHistoryErrors] = useState<string[]>([]);
  const [versionName, setVersionName] = useState<string | null>(null);
  const savedProject = useRef(JSON.stringify(initialProject));
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [view]);
  const model = project.model,
    issues = useMemo(() => projectReadiness(project), [project]),
    analysis = useMemo(() => narrativeAnalysis(model), [model]);
  const node = model.nodes.find((n) => n.id === selected);
  const state = useMemo(
    () =>
      record
        ? storyState(record, cursor < 0 ? record.decisions.length : cursor)
        : null,
    [record, cursor],
  );
  const currentNode = record?.model.nodes.find((n) => n.id === state?.node),
    replaying = !!record && cursor >= 0 && cursor < record.decisions.length;
  function update(fn: (m: NarrativeModel) => void) {
    setProject((p) => {
      const next = copy(p);
      fn(next.model);
      return next;
    });
  }
  function patch(fn: (p: Project<NarrativeModel>) => void) {
    setProject((p) => {
      const next = copy(p);
      fn(next);
      return next;
    });
  }
  async function save() {
    await projectRepository().saveWorkspace({
      format: "gameplay-workspace-v2",
      active: project.id,
      projects: [project],
      errors: [],
    });
    savedProject.current = JSON.stringify(project);
  }
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (busy) return;
    if (savedProject.current === JSON.stringify(project)) {
      setSaveStatus("已保存");
      return;
    }
    if (validateNarrative(model, true).length) {
      setSaveStatus("结构待修复");
      return;
    }
    let live = true;
    setSaveStatus("保存中");
    const timer = setTimeout(() => {
      void save()
        .then(() => {
          if (live) setSaveStatus("已保存");
        })
        .catch((e) => {
          if (live) {
            setSaveStatus("保存失败");
            setError(e.message);
          }
        });
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [project, busy]);
  useEffect(() => {
    let live = true;
    setHistoryReady(false);
    void narrativeHistory()
      .list(project)
      .then((r) => {
        if (live) {
          setRecords(r.records);
          setHistoryErrors(r.errors);
          setHistoryReady(true);
        }
      })
      .catch((e) => {
        if (live) {
          setHistoryErrors([e.message]);
        }
      });
    return () => {
      live = false;
    };
  }, [project.id, historyRevision]);
  function addNode() {
    const id = uid("scene");
    update((m) => {
      m.nodes.push({
        id,
        title: "新剧情",
        text: "",
        speaker: "",
        ending: false,
        choices: [],
      });
      if (!m.startNode) m.startNode = id;
    });
    setSelected(id);
    setView("nodes");
  }
  function fix(path: string) {
    if (["模拟器", "玩法方向", "游戏类型", "策划模型"].includes(path)) {
      setView("overview");
      return;
    }
    if (model.characters.some((c) => c.id === path)) {
      setView("characters");
      return;
    }
    if (model.variables.some((v) => v.id === path)) {
      setView("variables");
      return;
    }
    if (model.nodes.some((n) => n.id === path)) setSelected(path);
    setView("nodes");
  }
  function deleteNode() {
    if (!node) return;
    const refs = model.nodes.filter((n) =>
      n.choices.some((c) => c.target === node.id),
    );
    if (refs.length || model.startNode === node.id) {
      setError("请先更换起始剧情并解除指向本节点的选项，再删除剧情。");
      return;
    }
    update((m) => {
      m.nodes = m.nodes.filter((n) => n.id !== node.id);
    });
    setSelected("");
  }
  function variableReferenced(id: string) {
    return model.nodes.some((n) =>
      n.choices.some((c) =>
        [...c.conditions, ...c.effects].some((r) => r.variable === id),
      ),
    );
  }
  async function begin() {
    if (issues.length) throw new Error("请先补齐就绪检查中的配置。");
    await save();
    const next = newStoryRecord(project.id, model);
    await narrativeHistory().save(project, next);
    setRecord(next);
    setRecords((rs) => [next, ...rs]);
    setCursor(-1);
    setView("play");
  }
  async function decide(id: string) {
    if (!record || replaying) return;
    const next = chooseStory(record, id);
    await narrativeHistory().save(project, next);
    setRecord(next);
    setRecords((rs) => [next, ...rs.filter((r) => r.id !== next.id)]);
    setCursor(-1);
  }
  const issueLabel = (path: string) =>
    model.nodes.find((n) => n.id === path)?.title ??
    model.variables.find((v) => v.id === path)?.name ??
    model.characters.find((c) => c.id === path)?.name ??
    path;
  return (
    <div className="lab-app narrative-workspace">
      <header className="lab-header">
        <div className="lab-brand">
          <img className="lab-brand-icon" src={appIcon} alt="" />
          <strong>游戏沙盘</strong>
        </div>
        <div className="lab-breadcrumb">
          <span>文字冒险</span>
          <span>/</span>
          <strong>{model.name}</strong>
        </div>
        <span className="save-status" role="status">
          <i />
          草稿 · {saveStatus}
        </span>
        <div className="header-actions">
          <button
            className="button primary"
            disabled={busy || !!issues.length || !historyReady}
            onClick={() => void act(begin)}
          >
            <Play size={16} />
            人工试玩
          </button>
        </div>
      </header>
      <div className="lab-shell">
        <aside className="lab-sidebar">
          <button
            className="back-button"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await save();
                await narrativeHistory().flush();
                onExit();
              })
            }
          >
            <ArrowLeft size={16} />
            返回项目库
          </button>
          <div className="project-name">
            <span className="project-symbol">
              <BookOpen size={18} />
            </span>
            <strong>{model.name}</strong>
          </div>
          <nav aria-label="项目导航">
            <button
              className="library-nav"
              aria-label="项目库"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await save();
                  onExit();
                })
              }
            >
              <LayoutGrid size={16} />
              项目库
            </button>
            {navigation.map((n) => (
              <button
                key={n.id}
                className={view === n.id ? "active" : ""}
                disabled={busy}
                onClick={() => setView(n.id)}
              >
                <n.icon size={16} />
                {n.name}
              </button>
            ))}
          </nav>
          <div className="stage-label">
            <BookOpen size={16} />
            <span>条件分支叙事</span>
          </div>
        </aside>
        <main ref={mainRef} className={`lab-main view-${view}`} inert={busy}>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button className="text-button" onClick={() => setError("")}>
                关闭错误
              </button>
            </div>
          )}
          {view === "overview" && (
            <section className="page-content">
              <div className="page-heading">
                <div>
                  <h1>策划概览</h1>
                  <p>
                    {gameTypeName(project.gameType)} ·{" "}
                    {directionDefinition(project.direction)?.name ??
                      "待选玩法方向"}{" "}
                    · 从零开始
                  </p>
                </div>
              </div>
              <div className="overview-grid">
                <section className="settings-section">
                  <h2>玩法方向与验证范围</h2>
                  <DirectionPicker
                    gameType="narrative"
                    value={project.direction}
                    simulator={project.simulator}
                    change={(ref, direction) =>
                      patch((p) => {
                        p.simulator = ref;
                        p.direction = direction;
                      })
                    }
                    disabled={busy}
                  />
                </section>
                <section className="settings-section readiness-panel">
                  <h2>
                    {issues.length
                      ? `还有 ${issues.length} 项待配置`
                      : "可以开始试玩"}
                  </h2>
                  <div className="settings-actions">
                    <button className="button" onClick={addNode}>
                      <Plus size={14} />
                      添加剧情
                    </button>
                    <button
                      className="button"
                      onClick={() => setView("characters")}
                    >
                      设计人物
                    </button>
                    <button
                      className="button"
                      onClick={() => setView("variables")}
                    >
                      设置变量
                    </button>
                  </div>
                  {issues.length ? (
                    <ul className="readiness-list">
                      {issues.slice(0, 12).map((i, index) => (
                        <li key={index}>
                          <div>
                            <strong>{issueLabel(i.path)}</strong>
                            <p>{i.message}</p>
                          </div>
                          <button
                            className="text-button"
                            onClick={() => fix(i.path)}
                          >
                            配置
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="readiness-success">
                      规则与模拟器兼容。试玩冻结人物、剧情、条件、后果与模拟器版本。
                    </p>
                  )}
                </section>
                <section className="settings-section overview-brief">
                  <h2>设计意图</h2>
                  <label className="form-field">
                    设计目标
                    <textarea
                      aria-label="设计目标"
                      maxLength={2000}
                      rows={3}
                      value={model.description}
                      onChange={(e) =>
                        update((m) => {
                          m.description = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label className="form-field">
                    核心体验与选择循环
                    <textarea
                      aria-label="核心循环"
                      maxLength={4000}
                      rows={3}
                      value={project.brief.coreLoop}
                      onChange={(e) =>
                        patch((p) => {
                          p.brief.coreLoop = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label className="form-field">
                    待验证问题
                    <textarea
                      aria-label="待验证问题"
                      maxLength={4000}
                      rows={3}
                      value={project.brief.question}
                      onChange={(e) =>
                        patch((p) => {
                          p.brief.question = e.target.value;
                        })
                      }
                    />
                  </label>
                </section>
              </div>
            </section>
          )}
          {view === "characters" && (
            <section className="page-content">
              <div className="page-heading">
                <div>
                  <h1>人物</h1>
                  <p>人物可作为剧情的发言者；关系和标记通过状态变量表达。</p>
                </div>
                <button
                  className="button primary"
                  disabled={model.characters.length >= 80}
                  onClick={() =>
                    update((m) => {
                      m.characters.push({
                        id: uid("character"),
                        name: "新人物",
                        description: "",
                      });
                    })
                  }
                >
                  <Plus size={15} />
                  添加人物
                </button>
              </div>
              {!model.characters.length && (
                <p className="hint">
                  尚无人物。旁白剧情可以直接开始，人物不是试玩必填项。
                </p>
              )}
              {model.characters.map((c, index) => (
                <section className="settings-section" key={c.id}>
                  <label className="form-field">
                    人物名称
                    <input
                      aria-label={`人物 ${index + 1} 名称`}
                      maxLength={300}
                      value={c.name}
                      onChange={(e) =>
                        update((m) => {
                          m.characters[index].name = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label className="form-field">
                    人物设定
                    <textarea
                      aria-label={`人物 ${index + 1} 设定`}
                      maxLength={2000}
                      value={c.description}
                      onChange={(e) =>
                        update((m) => {
                          m.characters[index].description = e.target.value;
                        })
                      }
                    />
                  </label>
                  <button
                    className="text-button danger-text"
                    onClick={() => {
                      if (model.nodes.some((n) => n.speaker === c.id)) {
                        setError("人物正在被剧情引用，请先更换发言者。");
                        return;
                      }
                      update((m) => {
                        m.characters.splice(index, 1);
                      });
                    }}
                  >
                    删除人物
                  </button>
                </section>
              ))}
            </section>
          )}
          {view === "variables" && (
            <section className="page-content">
              <div className="page-heading">
                <div>
                  <h1>状态变量</h1>
                  <p>
                    为选项条件和后果定义标记、数值或文本。已被引用的变量需先解除引用才能改类型或删除。
                  </p>
                </div>
                <button
                  className="button primary"
                  disabled={model.variables.length >= 80}
                  onClick={() =>
                    update((m) => {
                      m.variables.push({
                        id: uid("variable"),
                        name: "新标记",
                        type: "boolean",
                        initial: false,
                      });
                    })
                  }
                >
                  <Plus size={15} />
                  添加变量
                </button>
              </div>
              {model.variables.map((v, index) => (
                <section className="settings-section" key={v.id}>
                  <div className="story-variable-grid">
                    <label className="form-field">
                      变量名称
                      <input
                        aria-label={`变量 ${index + 1} 名称`}
                        value={v.name}
                        maxLength={300}
                        onChange={(e) =>
                          update((m) => {
                            m.variables[index].name = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label className="form-field">
                      变量类型
                      <NativeSelect
                        aria-label={`变量 ${index + 1} 类型`}
                        disabled={variableReferenced(v.id)}
                        value={v.type}
                        onChange={(event) =>
                          update((m) => {
                            const type = event.target
                              .value as StoryVariable["type"];
                            m.variables[index].type = type;
                            m.variables[index].initial =
                              type === "boolean"
                                ? false
                                : type === "number"
                                  ? 0
                                  : "";
                          })
                        }
                        size="sm"
                      >
                        <NativeSelectOption value="boolean">
                          是否标记
                        </NativeSelectOption>
                        <NativeSelectOption value="number">
                          整数数值
                        </NativeSelectOption>
                        <NativeSelectOption value="text">
                          文本
                        </NativeSelectOption>
                      </NativeSelect>
                    </label>
                    <label className="form-field">
                      初始值
                      <ValueInput
                        label={`变量 ${index + 1} 初始值`}
                        type={v.type}
                        value={v.initial}
                        change={(value) =>
                          update((m) => {
                            m.variables[index].initial = value;
                          })
                        }
                      />
                    </label>
                  </div>
                  <button
                    className="text-button danger-text"
                    onClick={() => {
                      if (variableReferenced(v.id)) {
                        setError(
                          "变量正在被选项条件或后果引用，请先解除引用。",
                        );
                        return;
                      }
                      update((m) => {
                        m.variables.splice(index, 1);
                      });
                    }}
                  >
                    删除变量
                  </button>
                </section>
              ))}
              {!model.variables.length && (
                <p className="hint">
                  纯分支剧情不需要变量。出现条件选项或选择后果时再添加。
                </p>
              )}
            </section>
          )}
          {view === "nodes" && (
            <section className="page-content">
              <div className="page-heading">
                <div>
                  <h1>剧情与选择</h1>
                  <p>
                    选择目标剧情形成分支，条件决定选项是否可用，后果在跳转前按顺序执行。
                  </p>
                </div>
                <button
                  className="button primary"
                  disabled={model.nodes.length >= 80}
                  onClick={addNode}
                >
                  <Plus size={15} />
                  添加剧情
                </button>
              </div>
              <label className="form-field">
                起始剧情
                <NativeSelect
                  aria-label="起始剧情"
                  value={model.startNode}
                  onChange={(event) =>
                    update((m) => {
                      m.startNode = event.target.value;
                    })
                  }
                  size="sm"
                >
                  <NativeSelectOption value="">
                    请选择起始剧情
                  </NativeSelectOption>
                  {model.nodes.map((n) => (
                    <NativeSelectOption key={n.id} value={n.id}>
                      {n.title}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              <div className="story-editor-layout">
                <nav className="story-node-list" aria-label="剧情列表">
                  {model.nodes.map((n) => (
                    <button
                      className={selected === n.id ? "active" : ""}
                      key={n.id}
                      onClick={() => setSelected(n.id)}
                    >
                      <span>{n.title}</span>
                      <small>
                        {n.ending ? "结局" : `${n.choices.length} 个选项`}
                        {n.id === model.startNode ? " · 起点" : ""}
                      </small>
                    </button>
                  ))}
                </nav>
                <div>
                  {node ? (
                    <section className="settings-section story-node-editor">
                      <label className="form-field">
                        剧情标题
                        <input
                          aria-label="剧情标题"
                          maxLength={300}
                          value={node.title}
                          onChange={(e) =>
                            update((m) => {
                              m.nodes.find((n) => n.id === node.id)!.title =
                                e.target.value;
                            })
                          }
                        />
                      </label>
                      <label className="form-field">
                        发言人物
                        <NativeSelect
                          aria-label="发言人物"
                          value={node.speaker}
                          onChange={(event) =>
                            update((m) => {
                              m.nodes.find((n) => n.id === node.id)!.speaker =
                                event.target.value;
                            })
                          }
                          size="sm"
                        >
                          <NativeSelectOption value="">旁白</NativeSelectOption>
                          {model.characters.map((c) => (
                            <NativeSelectOption key={c.id} value={c.id}>
                              {c.name}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
                      <label className="form-field">
                        剧情正文
                        <textarea
                          aria-label="剧情正文"
                          rows={6}
                          maxLength={8000}
                          value={node.text}
                          onChange={(e) =>
                            update((m) => {
                              m.nodes.find((n) => n.id === node.id)!.text =
                                e.target.value;
                            })
                          }
                        />
                      </label>
                      <label className="story-checkbox">
                        <input
                          type="checkbox"
                          checked={node.ending}
                          onChange={(e) =>
                            update((m) => {
                              m.nodes.find((n) => n.id === node.id)!.ending =
                                e.target.checked;
                            })
                          }
                        />
                        这是结局节点
                      </label>
                      {node.ending && !!node.choices.length && (
                        <p className="form-error">
                          结局节点仍有选项，请移除选项或取消结局标记。选项不会被自动删除。
                        </p>
                      )}
                      {node.choices.map((c, i) => (
                        <ChoiceEditor
                          key={c.id}
                          choice={c}
                          index={i}
                          model={model}
                          change={(fn) =>
                            update((m) => {
                              fn(
                                m.nodes.find((n) => n.id === node.id)!.choices[
                                  i
                                ],
                              );
                            })
                          }
                          remove={() =>
                            update((m) => {
                              m.nodes
                                .find((n) => n.id === node.id)!
                                .choices.splice(i, 1);
                            })
                          }
                        />
                      ))}
                      <div className="settings-actions">
                        <button
                          className="button"
                          disabled={node.ending || node.choices.length >= 20}
                          onClick={() =>
                            update((m) => {
                              m.nodes
                                .find((n) => n.id === node.id)!
                                .choices.push({
                                  id: uid("choice"),
                                  label: "",
                                  target: "",
                                  conditions: [],
                                  effects: [],
                                });
                            })
                          }
                        >
                          <Plus size={14} />
                          添加选项
                        </button>
                        <button
                          className="text-button danger-text"
                          onClick={deleteNode}
                        >
                          删除剧情
                        </button>
                      </div>
                    </section>
                  ) : (
                    <p className="hint">添加剧情或从列表中选择节点。</p>
                  )}
                </div>
              </div>
            </section>
          )}
          {view === "play" && record && state && currentNode && (
            <section className="page-content story-play">
              <div className="page-heading">
                <div>
                  <p>
                    条件分支叙事 · v{record.simulator.version} · 独立剧情快照
                    {replaying ? " · 回放中" : ""}
                  </p>
                  <h1>{currentNode.title}</h1>
                </div>
                <button className="button" onClick={() => setView("nodes")}>
                  返回剧情设计
                </button>
              </div>
              <section className="settings-section story-reader">
                <p className="story-speaker">
                  {record.model.characters.find(
                    (c) => c.id === currentNode.speaker,
                  )?.name ?? "旁白"}
                </p>
                <div className="story-prose">{currentNode.text}</div>
                {state.outcome === "ending" ? (
                  <p className="readiness-success" role="status">
                    <Flag size={18} />
                    已到达结局 · {currentNode.title}
                  </p>
                ) : state.outcome === "blocked" ? (
                  <p className="form-error" role="status">
                    当前没有满足条件的选项。请检查条件是否造成死路。
                  </p>
                ) : state.outcome === "budget" ? (
                  <p className="hint" role="status">
                    已达到 200 次选择的运行上限，记录保留，未判定为结局。
                  </p>
                ) : null}
                {currentNode.choices.map((c) => {
                  const failures = c.conditions.filter(
                    (x) => !conditionPass(x, state.values),
                  );
                  return (
                    <button
                      className="story-play-choice"
                      key={c.id}
                      disabled={
                        busy ||
                        replaying ||
                        state.outcome !== "playing" ||
                        !!failures.length
                      }
                      onClick={() => void act(() => decide(c.id))}
                    >
                      <strong>{c.label}</strong>
                      {!!failures.length && (
                        <small>
                          条件不满足：
                          {failures
                            .map(
                              (x) =>
                                `${record.model.variables.find((v) => v.id === x.variable)?.name} ${operations[x.op]} ${String(x.value)}`,
                            )
                            .join("；")}
                        </small>
                      )}
                    </button>
                  );
                })}
              </section>
              <section className="settings-section">
                <h2>当前状态与回放</h2>
                {!record.model.variables.length ? (
                  <p className="hint">本方案没有状态变量。</p>
                ) : (
                  <dl className="story-state-values">
                    {record.model.variables.map((v) => (
                      <div key={v.id}>
                        <dt>{v.name}</dt>
                        <dd>{String(state.values[v.id])}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <label className="form-field">
                  回放步骤 · {state.steps} / {record.decisions.length}
                  <input
                    aria-label="回放步骤"
                    type="range"
                    min={0}
                    max={record.decisions.length}
                    value={cursor < 0 ? record.decisions.length : cursor}
                    onChange={(e) => setCursor(Number(e.target.value))}
                  />
                </label>
                {replaying && (
                  <button className="button" onClick={() => setCursor(-1)}>
                    返回最新状态
                  </button>
                )}
                <ol className="story-events">
                  {state.events.map((e, i) => (
                    <li key={i}>
                      <strong>
                        {
                          record.model.nodes
                            .flatMap((n) => n.choices)
                            .find((c) => c.id === e.choice)?.label
                        }
                      </strong>
                      <p>
                        {record.model.nodes.find((n) => n.id === e.from)?.title}{" "}
                        → {record.model.nodes.find((n) => n.id === e.to)?.title}
                      </p>
                      {e.changes.map((change, j) => (
                        <p key={j}>{change}</p>
                      ))}
                    </li>
                  ))}
                </ol>
              </section>
            </section>
          )}
          {view === "history" && (
            <section className="page-content">
              <div className="page-heading">
                <div>
                  <h1>试玩记录与结构检查</h1>
                  <p>
                    叙事以分支、条件和后果为检查对象；体验与选择质量需要人工试玩判断。
                  </p>
                </div>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => setHistoryRevision((n) => n + 1)}
                >
                  重新加载记录
                </button>
              </div>
              <section className="settings-section">
                <h2>当前草稿 · 结构可达性</h2>
                <p>
                  {model.nodes.length} 段剧情 · 从起点结构上可达{" "}
                  {analysis.reachable} 段 · 可达结局 {analysis.endings} 个
                </p>
                <p className="hint">
                  这里只检查连线，不穷举条件组合，也不代表实际玩家可以到达所有结局。
                </p>
                {analysis.unreachable.map((n) => (
                  <p key={n.id}>
                    未连接到起点：
                    <button
                      className="text-button"
                      onClick={() => {
                        setSelected(n.id);
                        setView("nodes");
                      }}
                    >
                      {n.title}
                    </button>
                  </p>
                ))}
              </section>
              {historyErrors.map((e, i) => (
                <p className="form-error" key={i} role="alert">
                  {e}
                </p>
              ))}
              <h2>已保存的试玩</h2>
              {records.map((r) => (
                <button
                  className="history-row"
                  key={r.id}
                  onClick={() => {
                    setRecord(r);
                    setCursor(-1);
                    setView("play");
                  }}
                >
                  <Play size={16} />
                  <span>
                    {r.model.name} · {r.decisions.length} 次选择
                    <small className="history-meta">
                      {new Date(r.updatedAt).toLocaleString()} · 条件分支叙事 v
                      {r.simulator.version}
                    </small>
                  </span>
                  <span>
                    {r.final.outcome === "ending"
                      ? "已到结局"
                      : r.final.outcome === "playing"
                        ? "可继续"
                        : r.final.outcome === "blocked"
                          ? "条件死路"
                          : "达到上限"}
                  </span>
                </button>
              ))}
              {historyReady && !records.length && (
                <p className="hint">
                  开始人工试玩后，每次选择都会保存。重开可继续或回放。
                </p>
              )}
            </section>
          )}
          {view === "versions" && (
            <section className="page-content">
              <div className="page-heading">
                <div>
                  <h1>策划版本</h1>
                  <p>冻结完整叙事规则、玩法方向和设计说明。</p>
                </div>
                <button
                  className="button primary"
                  disabled={!!issues.length || project.versions.length >= 10}
                  onClick={() =>
                    setVersionName(`版本 ${project.versions.length + 1}`)
                  }
                >
                  <Save size={15} />
                  保存版本
                </button>
              </div>
              {project.versions.map((v) => (
                <article className="version-row" key={v.id}>
                  <div>
                    <h2>{v.name}</h2>
                    <p>
                      {v.model.nodes.length} 段剧情 ·{" "}
                      {v.model.characters.length} 位人物 ·{" "}
                      {new Date(v.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    className="button"
                    onClick={() =>
                      patch((p) => {
                        p.model = copy(v.model);
                        p.direction = v.direction ?? null;
                        p.simulator = copy(v.simulator ?? null);
                        if (v.brief) p.brief = copy(v.brief);
                      })
                    }
                  >
                    复制为草稿
                  </button>
                </article>
              ))}
            </section>
          )}
          {view === "settings" && (
            <section className="page-content">
              <div className="page-heading">
                <div>
                  <h1>项目设置</h1>
                  <p>文字冒险 · 独立叙事模型 · 从零开始</p>
                </div>
              </div>
              <section className="settings-section">
                <label className="form-field">
                  项目名称
                  <input
                    aria-label="项目名称"
                    maxLength={60}
                    value={model.name}
                    onChange={(e) =>
                      update((m) => {
                        m.name = e.target.value;
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  项目目录
                  <input readOnly value={project.path} />
                </label>
                <p className="hint">
                  规则文件：models/core.json。更换游戏类型需要新建对应类型的项目；不会将剧情自动转换为卡牌或数值规则。
                </p>
                <button
                  className="button"
                  onClick={() =>
                    void act(async () => {
                      await projectRepository()
                        .flush()
                        .catch(() => {});
                      const loaded = await projectRepository().reload(project);
                      if (!isNarrativeProject(loaded))
                        throw new Error(
                          "项目类型已变化，请返回项目库重新打开。",
                        );
                      setProject(loaded);
                      setHistoryRevision((n) => n + 1);
                      setSaveStatus("已读取");
                    })
                  }
                >
                  从项目文件重新读取
                </button>
              </section>
              <section className="settings-section">
                <h2>玩法方向</h2>
                <DirectionPicker
                  gameType="narrative"
                  value={project.direction}
                  simulator={project.simulator}
                  change={(ref, direction) =>
                    patch((p) => {
                      p.direction = direction;
                      p.simulator = ref;
                    })
                  }
                />
              </section>
            </section>
          )}
        </main>
      </div>
      {versionName !== null && (
        <Modal title="保存策划版本" close={() => setVersionName(null)}>
          <ApplicationForm
            onSubmit={(e) => {
              e.preventDefault();
              patch((p) => {
                p.versions.push({
                  id: uid("version"),
                  name: versionName.trim() || "未命名版本",
                  createdAt: new Date().toISOString(),
                  model: copy(p.model),
                  simulator: copy(p.simulator),
                  gameType: p.gameType,
                  direction: p.direction,
                  brief: copy(p.brief),
                });
              });
              setVersionName(null);
            }}
          >
            <label className="form-field">
              版本名称
              <input
                required
                maxLength={100}
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
              />
            </label>
            <footer>
              <button
                type="button"
                className="button"
                onClick={() => setVersionName(null)}
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
    </div>
  );
}
