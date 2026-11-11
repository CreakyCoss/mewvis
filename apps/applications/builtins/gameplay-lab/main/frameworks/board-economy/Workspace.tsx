import {
  ArrowLeft,
  CircleHelp,
  FlaskConical,
  Grid2X2,
  History,
  Layers3,
  Play,
  Settings2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { projectReadiness } from "../../app/projects/compatibility";
import type { IncompatibleData } from "../../app/projects/incompatible";
import { isBoardProject, type Project } from "../../app/projects/model";
import { projectRepository } from "../../app/projects/repository";
import { Modal } from "../../shared/components/Modal";
import { PlayWindow } from "../../shared/components/PlayWindow";
import { copy, uid } from "../../shared/utils";
import { boardEconomyDefinition } from "./definition";
import { BoardEditor } from "./editor/BoardEditor";
import {
  BoardHistoryView,
  BoardSettings,
  BoardVersions,
} from "./editor/ProjectViews";
import type { BoardModel } from "./model";
import { ExperimentPanel } from "./experiments/ExperimentPanel";
import { boardSampleRecord } from "./experiments/simulation";
import { useBoardExperiments } from "./experiments/use-board-experiments";
import { BoardTable } from "./play/BoardTable";
import { BoardInspection, BoardReplayControls } from "./play/Replay";
import {
  advanceBoardRecord,
  boardTimeline,
  newBoardRecord,
  type BoardRecord,
} from "./records";
import { boardHistory } from "./repository";
import { chooseBoard, observeBoard, type BoardCommand } from "./runtime";
import { validateBoard } from "./validation";
const nav = [
  { id: "design", name: "棋盘与规则", icon: Grid2X2 },
  { id: "history", name: "试玩记录", icon: History },
  { id: "experiments", name: "自动实验", icon: FlaskConical },
  { id: "versions", name: "版本", icon: Layers3 },
  { id: "settings", name: "项目设置", icon: Settings2 },
] as const;
export default function BoardWorkspace({
  initialProject,
  onExit,
}: {
  initialProject: Project<BoardModel>;
  onExit(): void;
}) {
  const [project, setProject] = useState(initialProject),
    [view, setView] = useState<string>("design"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("已保存");
  const [records, setRecords] = useState<BoardRecord[]>([]),
    [record, setRecord] = useState<BoardRecord | null>(null),
    [historyReady, setHistoryReady] = useState(false),
    [historyErrors, setHistoryErrors] = useState<string[]>([]),
    [incompatible, setIncompatible] = useState<IncompatibleData[]>([]),
    [revision, setRevision] = useState(0);
  const [seed, setSeed] = useState(42),
    [cursor, setCursor] = useState(-1),
    [playOpen, setPlayOpen] = useState(false),
    [inspecting, setInspecting] = useState(false),
    [automatic, setAutomatic] = useState(false),
    [previewLabel, setPreviewLabel] = useState(""),
    [versionName, setVersionName] = useState(""),
    [reloadConfirm, setReloadConfirm] = useState(false),
    [help, setHelp] = useState(false);
  const lock = useRef(false),
    saved = useRef(JSON.stringify(initialProject)),
    active = useRef<BoardRecord | null>(null);
  const issues = useMemo(() => projectReadiness(project), [project]);
  const timeline = useMemo(
    () => (record ? boardTimeline(record) : []),
    [record],
  );
  const state = record ? (cursor >= 0 ? timeline[cursor] : record.final) : null;
  const recentEvents = useMemo(
    () =>
      timeline
        .slice(0, cursor < 0 ? timeline.length : cursor + 1)
        .flatMap((snapshot, step) =>
          snapshot.events.map((event) => ({ step, text: event.text })),
        )
        .slice(-3)
        .reverse(),
    [timeline, cursor],
  );
  function update(fn: (m: BoardModel) => void) {
    setProject((p) => {
      const next = copy(p);
      fn(next.model);
      return next;
    });
  }
  async function save() {
    const snapshot = copy(project);
    await projectRepository().saveProject(snapshot);
    saved.current = JSON.stringify(snapshot);
  }
  const experiments = useBoardExperiments(project, save);
  async function act(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
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
    if (validateBoard(project.model, true).length) {
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
    void boardHistory()
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
  }, [project.id, revision]);
  function accept(next: BoardRecord) {
    setPreviewLabel("");
    active.current = next;
    setRecord(next);
    setRecords((items) => [next, ...items.filter((r) => r.id !== next.id)]);
    setError("");
  }
  function clearRecord() {
    setPreviewLabel("");
    active.current = null;
    setRecord(null);
    setPlayOpen(false);
    setCursor(-1);
  }
  async function execute(
    command: BoardCommand,
    driver: "manual" | "basic" = "manual",
  ) {
    if (!active.current || previewLabel || experiments.running || cursor >= 0)
      return;
    await act(async () => {
      const next = advanceBoardRecord(active.current!, command, driver);
      await boardHistory().save(project, next);
      accept(next);
    });
  }
  function autoStep() {
    const r = active.current;
    if (r && !r.final.outcome)
      void execute(
        chooseBoard(r.model, observeBoard(r.model, r.final, r.final.actor)),
        "basic",
      );
  }
  useEffect(() => {
    if (
      !automatic ||
      !!previewLabel ||
      experiments.running ||
      !playOpen ||
      inspecting ||
      error ||
      busy ||
      cursor >= 0 ||
      !record ||
      record.final.outcome ||
      record.final.actor !== 1
    )
      return;
    const timer = setTimeout(autoStep, 450);
    return () => clearTimeout(timer);
  }, [
    automatic,
    playOpen,
    inspecting,
    error,
    busy,
    cursor,
    record,
    previewLabel,
    experiments.running,
  ]);
  async function begin() {
    await act(async () => {
      if (issues.length || !historyReady || experiments.running)
        throw new Error("请先完成棋盘配置并加载记录。");
      await save();
      const next = newBoardRecord(project.id, project.model, seed);
      await boardHistory().save(project, next);
      accept(next);
      setCursor(-1);
      setPlayOpen(true);
    });
  }
  async function exit() {
    await act(async () => {
      await experiments.stopAndFlush();
      await save();
      await boardHistory().flush();
      onExit();
    });
  }
  async function saveVersion() {
    await act(async () => {
      if (issues.length || !versionName.trim() || project.versions.length >= 10)
        throw new Error("请先完善规则、填写名称，版本最多 10 份。");
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
      await experiments.stopAndFlush();
      const next = await projectRepository().reload(project);
      if (!isBoardProject(next))
        throw new Error("项目类型已变化，请从项目库重新打开。");
      saved.current = JSON.stringify(next);
      setProject(next);
      setReloadConfirm(false);
      clearRecord();
      setRevision((n) => n + 1);
      experiments.reload();
    });
  }
  return (
    <div className="lab-app economy-app">
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
              disabled={busy || experiments.running}
              onClick={() => setPlayOpen(true)}
            >
              {previewLabel ? "打开样本" : "打开本局"}
            </button>
          )}
          <button
            className="button"
            aria-label="使用指南"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={16} />
            <span>使用指南</span>
          </button>
          <button
            className="button primary"
            disabled={
              busy || experiments.running || !!issues.length || !historyReady
            }
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
              <ArrowLeft size={16} />
              项目库
            </button>
            {nav.map((item) => (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                disabled={
                  busy || (experiments.running && item.id !== "experiments")
                }
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
          {view === "design" && (
            <>
              <BoardEditor
                model={project.model}
                issues={issues}
                update={update}
                seed={seed}
                setSeed={setSeed}
              />
              <section className="page-content">
                <details className="settings-section">
                  <summary>记录本次要验证的设计问题</summary>
                  <label className="form-field">
                    核心循环
                    <textarea
                      aria-label="棋盘核心循环"
                      maxLength={4000}
                      value={project.brief.coreLoop}
                      onChange={(e) =>
                        setProject((p) => ({
                          ...p,
                          brief: { ...p.brief, coreLoop: e.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="form-field">
                    待验证问题
                    <textarea
                      aria-label="棋盘待验证问题"
                      maxLength={4000}
                      value={project.brief.question}
                      onChange={(e) =>
                        setProject((p) => ({
                          ...p,
                          brief: { ...p.brief, question: e.target.value },
                        }))
                      }
                    />
                  </label>
                </details>
              </section>
            </>
          )}
          {view === "history" && (
            <BoardHistoryView
              records={records}
              ready={historyReady}
              errors={historyErrors}
              incompatible={incompatible}
              reload={() => {
                clearRecord();
                setRevision((n) => n + 1);
              }}
              open={(r) => {
                accept(r);
                setCursor(-1);
                setPlayOpen(true);
              }}
              remove={(id) => boardHistory().removeIncompatible(project, id)}
              removed={() => setRevision((n) => n + 1)}
            />
          )}
          {view === "experiments" && (
            <ExperimentPanel
              project={project}
              session={experiments}
              busy={busy}
              preview={(experiment, sample) => {
                const variant = experiment.variants.find(
                  (v) => v.id === sample.variant,
                )!;
                setRecord(boardSampleRecord(experiment, sample));
                setPreviewLabel(
                  `${variant.name} · 种子 ${sample.seed}${sample.error ? " · 错误发生前的操作" : ""}`,
                );
                setAutomatic(false);
                setCursor(0);
                setPlayOpen(true);
              }}
            />
          )}
          {view === "versions" && (
            <BoardVersions
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
            <BoardSettings
              project={project}
              rename={(name) =>
                update((m) => {
                  m.name = name;
                })
              }
              confirm={reloadConfirm}
              setConfirm={setReloadConfirm}
              reload={() => void reloadProject()}
              selectFramework={() =>
                setProject((p) => ({
                  ...p,
                  direction: "board-economy",
                  simulator: copy(boardEconomyDefinition.simulator),
                }))
              }
            />
          )}
        </main>
      </div>
      {help && (
        <Modal title="环形经济棋盘玩法" close={() => setHelp(false)}>
          <div className="help-content">
            <p>
              先添加至少四格棋盘，首格设为起点，至少一格为地产。配置价格、租金、初始资金与起点收入。
            </p>
            <p>
              两位玩家轮流掷骰，落到空置地产可购买或跳过。对手地产自动收租；现金不足时支付余额、移交地产并结束对局。首版没有抵押、拍卖或建房。
            </p>
            <p>
              “自动玩家走一步”按基础策略执行当前操作，也可勾选自动控制第二位玩家。达到回合上限不判胜负。检查或回放时暂停自动对手。
            </p>
            <p>
              操作保存成功后更新棋盘。修改草稿不影响旧局；在试玩记录里继续或回放。
            </p>
            <p>
              “自动实验”可运行多个种子，或对照两份规则。实验按局保存，取消后可继续；样本只读回放，不写入试玩记录。
            </p>
          </div>
        </Modal>
      )}
      {playOpen && record && state && (
        <PlayWindow
          key={record.id}
          className="economy-play-window"
          sceneName="棋盘"
          title={record.model.name}
          busy={busy}
          error={error}
          readOnly={!!previewLabel || cursor >= 0}
          readOnlyText={
            previewLabel ? "实验样本 · 只读回放" : "历史棋盘 · 只读回放"
          }
          onInspectChange={setInspecting}
          close={() => setPlayOpen(false)}
          scene={
            <>
              {previewLabel ? (
                <p className="play-window-notice">
                  {previewLabel} · 使用实验冻结的棋盘和规则。
                </p>
              ) : (
                JSON.stringify(record.model) !==
                  JSON.stringify(project.model) && (
                  <p className="play-window-notice">
                    设计方案已修改，本局继续使用开局时的棋盘和规则。
                  </p>
                )
              )}
              {(cursor >= 0 || previewLabel) && (
                <BoardReplayControls
                  record={record}
                  cursor={cursor}
                  setCursor={setCursor}
                  sample={!!previewLabel}
                />
              )}
              <BoardTable
                model={record.model}
                state={state}
                recentEvents={recentEvents}
                busy={busy || experiments.running}
                readOnly={!!previewLabel || cursor >= 0}
                automatic={automatic}
                setAutomatic={setAutomatic}
                execute={(c) => void execute(c)}
                autoStep={autoStep}
                newGame={() => void begin()}
                newGameDisabled={
                  !!issues.length || !historyReady || experiments.running
                }
              />
            </>
          }
          inspection={
            <BoardInspection
              record={record}
              cursor={cursor}
              setCursor={setCursor}
              sample={!!previewLabel}
            />
          }
        />
      )}
    </div>
  );
}
