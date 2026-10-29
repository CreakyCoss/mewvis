import {
  ArrowLeft,
  Boxes,
  History,
  Layers3,
  LayoutGrid,
  Play,
  Settings2,
  Blocks,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { projectReadiness } from "../../app/projects/compatibility";
import type { IncompatibleData } from "../../app/projects/incompatible";
import { isDoudizhuProject, type Project } from "../../app/projects/model";
import { projectRepository } from "../../app/projects/repository";
import { PlayWindow } from "../../shared/components/PlayWindow";
import { copy, uid } from "../../shared/utils";
import { chooseDoudizhu } from "./bots/basic";
import { DoudizhuOverview } from "./editor/Overview";
import { DoudizhuProjectSettings } from "./editor/ProjectSettings";
import { DoudizhuRulesEditor } from "./editor/RulesEditor";
import { DoudizhuVersions } from "./editor/Versions";
import { DoudizhuCompositionEditor } from "./composition/Editor";
import { ComposedDoudizhuTable, doudizhuModuleEditors } from "./composition/ui";
import type { DoudizhuModel } from "./model";
import { DoudizhuHistoryView } from "./play/HistoryView";
import { DoudizhuInspection } from "./play/Inspection";
import {
  advanceDoudizhuRecord,
  doudizhuReplay,
  newDoudizhuRecord,
  type DoudizhuRecord,
} from "./records";
import { doudizhuHistory } from "./repository";
import { observeDoudizhu, type DoudizhuCommand } from "./runtime/game";
import { validateDoudizhu } from "./validation";
type View = string;
const nav = [
  { id: "overview", name: "玩法概览", icon: LayoutGrid },
  { id: "rules", name: "牌型与结算", icon: Boxes },
  { id: "composition", name: "玩法组合", icon: Blocks },
  { id: "history", name: "试玩记录", icon: History },
  { id: "versions", name: "版本", icon: Layers3 },
  { id: "settings", name: "项目设置", icon: Settings2 },
] as const;
export default function DoudizhuWorkspace({
  initialProject,
  onExit,
}: {
  initialProject: Project<DoudizhuModel>;
  onExit(): void;
}) {
  const [project, setProject] = useState(initialProject),
    [view, setView] = useState<View>("overview"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("已保存");
  const [records, setRecords] = useState<DoudizhuRecord[]>([]),
    [record, setRecord] = useState<DoudizhuRecord | null>(null),
    [cursor, setCursor] = useState(-1),
    [selected, setSelected] = useState<string[]>([]),
    [playOpen, setPlayOpen] = useState(false);
  const [historyReady, setHistoryReady] = useState(false),
    [historyRevision, setHistoryRevision] = useState(0),
    [historyErrors, setHistoryErrors] = useState<string[]>([]),
    [incompatible, setIncompatible] = useState<IncompatibleData[]>([]);
  const [seed, setSeed] = useState(42),
    [versionName, setVersionName] = useState(""),
    [reloadConfirm, setReloadConfirm] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const lock = useRef(false),
    saved = useRef(JSON.stringify(initialProject));
  const issues = useMemo(() => projectReadiness(project), [project]);
  const moduleEditors = useMemo(
    () => doudizhuModuleEditors(project.model),
    [project.model],
  );
  const navigation = [
    ...nav.slice(0, 3),
    ...moduleEditors.map((entry) => ({
      id: "module/" + entry.id,
      name: entry.name,
      icon: Blocks,
    })),
    ...nav.slice(3),
  ];
  const ModuleEditor = moduleEditors.find(
    (entry) => view === "module/" + entry.id,
  )?.Editor;
  useEffect(() => {
    if (
      view.startsWith("module/") &&
      !moduleEditors.some((entry) => view === "module/" + entry.id)
    )
      setView("composition");
  }, [view, moduleEditors]);

  function update(change: (model: DoudizhuModel) => void) {
    setProject((p) => {
      const next = copy(p);
      change(next.model);
      return next;
    });
  }
  async function save() {
    const snapshot = copy(project);
    await projectRepository().saveProject(snapshot);
    saved.current = JSON.stringify(snapshot);
  }
  async function act(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (busy) return;
    if (saved.current === JSON.stringify(project)) {
      setStatus("已保存");
      return;
    }
    if (validateDoudizhu(project.model, true).length) {
      setStatus("结构待修复");
      return;
    }
    let live = true;
    setStatus("保存中");
    const timer = setTimeout(() => {
      void save()
        .then(() => {
          if (live) setStatus("已保存");
        })
        .catch((e) => {
          if (live) {
            setStatus("保存失败");
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
    void doudizhuHistory()
      .list(project)
      .then((result) => {
        if (live) {
          setRecords(result.records);
          setHistoryErrors(result.errors);
          setIncompatible(result.incompatible);
          setHistoryReady(true);
        }
      })
      .catch((e) => {
        if (live) setHistoryErrors([e.message]);
      });
    return () => {
      live = false;
    };
  }, [project.id, historyRevision]);
  function accept(next: DoudizhuRecord) {
    setError("");
    setRecord(next);
    setRecords((values) => [next, ...values.filter((r) => r.id !== next.id)]);
    setSelected([]);
  }
  async function execute(command: DoudizhuCommand) {
    if (!record || cursor >= 0) return;
    await act(async () => {
      const next = advanceDoudizhuRecord(record, command);
      await doudizhuHistory().save(project, next);
      accept(next);
    });
  }
  useEffect(() => {
    if (
      !playOpen ||
      inspecting ||
      !!error ||
      !record ||
      busy ||
      cursor >= 0 ||
      record.final.phase === "finished" ||
      record.final.actor === 0
    )
      return;
    const timer = setTimeout(() => {
      void execute(
        chooseDoudizhu(
          record.model,
          observeDoudizhu(record.model, record.final, record.final.actor),
        ),
      );
    }, 450);
    return () => clearTimeout(timer);
  }, [record, busy, cursor, playOpen, inspecting, error]);
  async function begin() {
    await act(async () => {
      if (issues.length || !historyReady)
        throw new Error("请先修复配置并加载记录。");
      await save();
      const next = newDoudizhuRecord(project.id, project.model, seed);
      await doudizhuHistory().save(project, next);
      accept(next);
      setCursor(-1);
      setPlayOpen(true);
    });
  }
  async function exit() {
    await act(async () => {
      await save();
      await doudizhuHistory().flush();
      onExit();
    });
  }
  async function saveVersion() {
    await act(async () => {
      const next = copy(project);
      next.versions.push({
        id: uid("version"),
        name: versionName.trim(),
        createdAt: new Date().toISOString(),
        gameType: next.gameType,
        direction: next.direction,
        simulator: copy(next.simulator),
        brief: copy(next.brief),
        model: copy(next.model),
      });
      await projectRepository().saveProject(next);
      saved.current = JSON.stringify(next);
      setProject(next);
      setVersionName("");
    });
  }
  async function reloadProject() {
    await act(async () => {
      const next = await projectRepository().reload(project);
      if (!isDoudizhuProject(next))
        throw new Error("项目类型已变化，请从项目库重新打开。");
      saved.current = JSON.stringify(next);
      setProject(next);
      setReloadConfirm(false);
      setRecord(null);
      setHistoryRevision((n) => n + 1);
    });
  }
  const state = record
    ? cursor >= 0
      ? doudizhuReplay(record, cursor)
      : record.final
    : null;
  const observation =
    state && record ? observeDoudizhu(record.model, state, 0) : null;
  return (
    <div className="lab-app doudizhu-app">
      <header className="lab-header">
        <div className="lab-brand">
          <strong>游戏沙盘</strong>
          <span>项目 / {project.model.name}</span>
          <span className="save-status" role="status">
            草稿 · {status}
          </span>
        </div>
        <div className="header-actions">
          {record && (
            <button
              className="button"
              disabled={busy}
              onClick={() => setPlayOpen(true)}
            >
              打开本局
            </button>
          )}
          <button
            className="button primary"
            disabled={busy || !!issues.length || !historyReady}
            onClick={() => void begin()}
          >
            <Play size={15} />
            开始试玩
          </button>
        </div>
      </header>
      <div className="lab-shell">
        <aside className="lab-sidebar">
          <button
            className="back-button"
            disabled={busy}
            onClick={() => void exit()}
          >
            <ArrowLeft size={16} />
            返回项目库
          </button>
          <div className="project-name">
            <strong>{project.model.name}</strong>
          </div>
          <nav aria-label="项目导航">
            <button
              className="library-nav"
              aria-label="项目库"
              disabled={busy}
              onClick={() => void exit()}
            >
              <LayoutGrid size={16} />
              项目库
            </button>
            {navigation.map((item) => (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                disabled={busy}
                onClick={() => setView(item.id)}
              >
                <item.icon size={16} />
                {item.name}
              </button>
            ))}
          </nav>
        </aside>
        <main className="lab-main" inert={busy}>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {view === "overview" && (
            <DoudizhuOverview
              project={project}
              issues={issues}
              historyReady={historyReady}
              seed={seed}
              setSeed={setSeed}
              openRules={() => setView("rules")}
              play={() => void begin()}
              update={update}
              changeQuestion={(question) =>
                setProject((p) => ({ ...p, brief: { ...p.brief, question } }))
              }
            />
          )}
          {view === "rules" && (
            <DoudizhuRulesEditor model={project.model} update={update} />
          )}
          {view === "composition" && (
            <DoudizhuCompositionEditor model={project.model} update={update} />
          )}
          {ModuleEditor && (
            <ModuleEditor model={project.model} update={update} />
          )}
          {view === "history" && (
            <DoudizhuHistoryView
              records={records}
              ready={historyReady}
              errors={historyErrors}
              incompatible={incompatible}
              reload={() => {
                setRecord(null);
                setPlayOpen(false);
                setHistoryRevision((n) => n + 1);
              }}
              open={(r) => {
                accept(r);
                setCursor(-1);
                setPlayOpen(true);
              }}
              remove={(id) => doudizhuHistory().removeIncompatible(project, id)}
              removed={() => setHistoryRevision((n) => n + 1)}
            />
          )}
          {view === "versions" && (
            <DoudizhuVersions
              project={project}
              name={versionName}
              setName={setVersionName}
              disabled={!!issues.length}
              save={() => void saveVersion()}
              restore={(id) => {
                const version = project.versions.find((v) => v.id === id);
                if (version)
                  setProject((p) => ({
                    ...p,
                    model: copy(version.model),
                    brief: copy(version.brief),
                  }));
              }}
            />
          )}
          {view === "settings" && (
            <DoudizhuProjectSettings
              project={project}
              rename={(name) =>
                update((m) => {
                  m.name = name;
                })
              }
              confirm={reloadConfirm}
              setConfirm={setReloadConfirm}
              reload={() => void reloadProject()}
            />
          )}
        </main>
      </div>
      {playOpen && record && state && observation && (
        <PlayWindow
          key={record.id}
          title={record.model.name}
          readOnly={cursor >= 0}
          readOnlyText="历史对局 · 只读回放"
          onInspectChange={setInspecting}
          busy={busy}
          error={error}
          close={() => setPlayOpen(false)}
          scene={
            <>
              {JSON.stringify(record.model) !==
                JSON.stringify(project.model) && (
                <p className="play-window-notice">
                  设计方案已修改，本局继续使用开局时的规则。新开局时使用当前方案。
                </p>
              )}
              {error && record.final.actor !== 0 && cursor < 0 && (
                <button className="button" onClick={() => setError("")}>
                  重试当前自动操作
                </button>
              )}
              <div className="poker-replay">
                <label htmlFor="doudizhu-replay">回放步骤</label>
                <input
                  id="doudizhu-replay"
                  aria-label="斗地主回放步骤"
                  type="range"
                  min={0}
                  max={record.decisions.length}
                  value={cursor < 0 ? record.decisions.length : cursor}
                  onChange={(e) => {
                    setSelected([]);
                    setCursor(Number(e.target.value));
                  }}
                />
                <span>
                  {cursor < 0 ? record.decisions.length : cursor} /{" "}
                  {record.decisions.length}
                </span>
                {cursor >= 0 && (
                  <button
                    className="button"
                    onClick={() => {
                      setSelected([]);
                      setCursor(-1);
                    }}
                  >
                    回到当前对局
                  </button>
                )}
              </div>
              <ComposedDoudizhuTable
                model={record.model}
                view={observation}
                selected={selected}
                setSelected={setSelected}
                execute={(c) => void execute(c)}
                busy={busy}
                readOnly={cursor >= 0}
                newGame={() => void begin()}
                newGameDisabled={!!issues.length || !historyReady}
                hint={() => {
                  const command = chooseDoudizhu(
                    record.model,
                    observation,
                    false,
                  );
                  setSelected(command.type === "play" ? command.cards : []);
                }}
              />
            </>
          }
          inspection={
            <DoudizhuInspection
              record={record}
              state={state}
              step={(value) => {
                setCursor(value);
                setSelected([]);
              }}
            />
          }
        />
      )}
    </div>
  );
}
