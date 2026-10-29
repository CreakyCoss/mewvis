import {
  ArrowLeft,
  Boxes,
  Check,
  CircleHelp,
  FileText,
  FlaskConical,
  History,
  Info,
  Layers3,
  LayoutGrid,
  Play,
  Settings2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import appIcon from "../../../assets/icon-sandbox.png";
import {
  duplicateDefinition,
  removeDefinition,
} from "../../domains/turn/definitions";
import {
  validateModel,
  type Model,
  type NodeKind,
} from "../../domains/turn/model";
import {
  frameworkDefinition,
  type FrameworkId,
} from "../../frameworks/catalog";
import { numericFrameworkUi } from "../../frameworks/numeric-ui";
import type { NumericView as View } from "../../frameworks/numeric-ui-contracts";
import { PlayWindow } from "../../shared/components/PlayWindow";
import type { ContentLocation } from "../../shared/content";
import { type ReadinessIssue, type SimulatorRef } from "../../shared/contracts";
import {
  useContentFocus,
  type ContentFocus,
} from "../../shared/use-content-focus";
import { copy, uid } from "../../shared/utils";
import { useExperimentRunner } from "../../validation/experiments/use-experiment-runner";
import { PlaytestEditor } from "../../validation/playtest/PlaytestEditor";
import { playtestReferences } from "../../validation/playtest/config";
import { playtestRepository } from "../../validation/playtest/repository";
import { usePlaytestConfig } from "../../validation/playtest/use-playtest-config";
import { historyRepository } from "../../validation/records/repository";
import { useRunSession } from "../../validation/records/use-run-session";
import { useTurnHistory } from "../../validation/records/use-turn-history";
import { projectReadiness } from "../projects/compatibility";
import { ContentLibrary } from "../projects/components/ContentLibrary";
import { IncompatibleDataNotice } from "../projects/components/IncompatibleDataNotice";
import { ProjectSettings } from "../projects/components/ProjectForms";
import { ProjectOverview } from "../projects/components/ProjectOverview";
import { projectContent } from "../projects/content";
import { type TemplateId } from "../projects/examples";
import { isTurnProject, type Project } from "../projects/model";
import { projectRepository } from "../projects/repository";
import {
  WorkspaceDialogs,
  type WorkspaceModal,
} from "./turn/components/WorkspaceDialogs";
import { RulesEditor } from "./turn/rules/RulesEditor";
import { HistoryView } from "./turn/views/HistoryView";
import { ModelView } from "./turn/views/ModelView";
import { RunView } from "./turn/views/RunView";
import { VersionsView } from "./turn/views/VersionsView";

const nav = [
  { id: "overview", name: "策划概览", icon: LayoutGrid },
  { id: "content", name: "内容目录", icon: FileText },
  { id: "model", name: "规则定义", icon: Boxes },
  { id: "rules", name: "规则与集合", icon: Settings2 },
  { id: "strategy", name: "验证设置", icon: FileText },
  { id: "runs", name: "实验记录", icon: History },
  { id: "versions", name: "版本", icon: Layers3 },
  { id: "settings", name: "项目设置", icon: Settings2 },
] as const;

export default function TurnWorkspace({
  initialProject,
  onExit,
}: {
  initialProject: Project;
  onExit(): void;
}) {
  const [project, setProject] = useState(initialProject);
  const [saveStatus, setSaveStatus] = useState("已保存");
  const [view, setView] = useState<View>("overview"),
    [selected, setSelected] = useState("study"),
    [list, setList] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [modal, setModal] = useState<WorkspaceModal>(null);
  const [contentFocus, setContentFocus] = useState<ContentFocus | null>(null);
  const [label, setLabel] = useState(""),
    [kind, setKind] = useState<NodeKind>("state");
  const [busy, setBusy] = useState(false);
  const [playOpen, setPlayOpen] = useState(false);
  useEffect(() => {
    if (
      view.startsWith("module/") &&
      !numericFrameworkUi(project)
        ?.navigation(project.model)
        .some((entry) => entry.id === view)
    )
      setView("composition");
  }, [project.model, view]);
  const {
    config,
    setConfig,
    configReady,
    configError,
    configStatus,
    setupValidation,
    reloadConfig,
  } = usePlaytestConfig(project, busy);
  const {
    trials,
    setTrials,
    experiments,
    setExperiments,
    historyReady,
    historyError,
    incompatible,
    reloadHistory: loadHistory,
  } = useTurnHistory(project);
  const {
    trial,
    cursor,
    cards,
    previewTrial,
    previewLabel,
    setCursor,
    setCards,
    begin,
    execute,
    previewSample,
    clearSession,
    openTrial,
  } = useRunSession({
    project,
    config,
    configReady,
    historyReady,
    trials,
    setTrials,
    busy,
    setBusy,
    setError,
    onOpen: () => setPlayOpen(true),
  });
  function reloadHistory() {
    setPlayOpen(false);
    clearSession();
    loadHistory();
  }
  const mainRef = useRef<HTMLElement>(null);
  useContentFocus(mainRef, view, contentFocus);
  const saveSequence = useRef(0);
  const model = project.model;
  const frameworkUi = numericFrameworkUi(project);
  const issues = useMemo(
    () => (project.id ? projectReadiness(project) : []),
    [model, project.id, project.simulator, project.direction, project.gameType],
  );
  const { experiment, progress, cancelExperiment } = useExperimentRunner({
    project,
    config,
    configReady,
    historyReady: historyReady === project.id,
    blocked: !!issues.length,
    setExperiments,
    onStarted: () => setView("runs"),
    onError: setError,
  });
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [view]);

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
    if (!project.id || busy) return;
    if (validateModel(project.model, true).length) {
      setSaveStatus("结构待修复");
      return;
    }
    const sequence = ++saveSequence.current;
    setSaveStatus("保存中");
    const timer = setTimeout(() => {
      void projectRepository()
        .saveProject(project)
        .then(() => {
          if (sequence === saveSequence.current) setSaveStatus("已保存");
        })
        .catch((e) => {
          setSaveStatus("保存失败");
          setError(String(e.message));
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [project, busy]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  function update(change: (m: Model) => void) {
    setProject((project) => {
      const model = copy(project.model);
      change(model);
      return { ...project, model };
    });
  }
  function metadata(
    patch: Partial<
      Pick<Project, "simulator" | "brief" | "direction" | "gameType">
    >,
  ) {
    setProject((project) => ({ ...project, ...copy(patch) }));
  }

  function selectSimulator(
    ref: SimulatorRef | null,
    direction: FrameworkId | null,
  ) {
    if (direction && frameworkDefinition(direction)?.schema !== model.format) {
      setError("该玩法需要不同的模型结构，请另建项目。");
      return;
    }
    metadata({ simulator: ref, direction });
  }
  function openDefinition(type: NodeKind) {
    setKind(type);
    setLabel("");
    setView("model");
    setList(true);
    setModal("definition");
  }
  function openContent(location: ContentLocation) {
    if (
      !["model", "rules", "strategy", "overview", "settings"].includes(
        location.area,
      )
    )
      return;
    const tab = frameworkUi?.contentView(model, location);
    if (tab) {
      setView(tab);
      setContentFocus((previous) => ({
        key: location.key,
        sequence: (previous?.sequence ?? 0) + 1,
      }));
      return;
    }
    setView(location.area as View);
    if (location.area === "model") {
      setList(true);
      if (location.id) setSelected(location.id);
    }
    setContentFocus((previous) => ({
      key: location.key,
      sequence: (previous?.sequence ?? 0) + 1,
    }));
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
    const entry = projectContent(model).items.find(
      (item) => item.kind !== "flow" && item.id === issue.path,
    );
    if (entry) {
      openContent(entry.location);
      return;
    }
    if (issue.view === "rules") {
      setView(frameworkUi?.issueView(issue) ?? "rules");
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
      await projectRepository().saveProject(project);
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
      setProject(loaded);
      setError("");
      reloadHistory();
      setNotice("已从项目 JSON 重新读取。");
    } finally {
      setBusy(false);
    }
  }
  async function resetProject(exampleId: TemplateId) {
    setBusy(true);
    try {
      const result = await projectRepository().reset(project, exampleId);
      setProject(result.project);
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
    setProject((p) => ({
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
    }));
    setModal(null);
    setNotice("模型版本已保存，后续编辑不会覆盖它。");
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
          <strong>{model.name}</strong>
        </div>
        <span className="save-status" role="status">
          <i />
          草稿 · {saveStatus}
        </span>
        <div className="header-actions">
          {trial && (
            <button
              className="button"
              disabled={busy}
              onClick={() => setPlayOpen(true)}
            >
              打开本局
            </button>
          )}
          <button
            className="button"
            aria-label="使用指南"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={17} />
            <span>使用指南</span>
          </button>
          <button
            className="button primary"
            disabled={
              busy ||
              !!issues.length ||
              historyReady !== project.id ||
              !!setupValidation.runError ||
              !!configError
            }
            onClick={begin}
          >
            <Play size={17} />
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
            {(frameworkUi?.navigation(model) ?? nav).map((item) => (
              <button
                key={item.id}
                disabled={busy}
                className={view === item.id ? "active" : ""}
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
          {notice && (
            <div className="notice-banner" role="status">
              <Check size={17} />
              {notice}
            </div>
          )}
          <IncompatibleDataNotice
            items={incompatible}
            remove={(id) => historyRepository().removeIncompatible(project, id)}
            done={loadHistory}
            disabled={busy || !!progress}
          />
          <ContentLibrary
            model={model}
            active={view === "content"}
            open={openContent}
            extraReferences={
              config ? (id) => playtestReferences(config, id) : undefined
            }
          />
          {frameworkUi?.renderDesign({
            model,
            view,
            issues,
            disabled:
              busy ||
              !!issues.length ||
              historyReady !== project.id ||
              configReady !== project.id ||
              !!configError ||
              !!setupValidation.runError,
            open: setView,
            play: () => void begin(),
            fix: fixReadiness,
            brief: project.brief,
            changeBrief: (brief) => metadata({ brief }),
            update,
          })}
          {view === "overview" && !frameworkUi && project.id && (
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
            <ModelView
              expandRules={contentFocus?.key === `action:${selected}`}
              project={project}
              issues={issues}
              selected={selected}
              list={list}
              setList={setList}
              inspect={inspect}
              update={update}
              duplicate={duplicate}
              remove={remove}
              references={config ? playtestReferences(config, selected) : []}
              add={() => {
                setLabel("");
                setKind("state");
                setModal("definition");
              }}
            />
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
          {view === "rules" && <RulesEditor model={model} update={update} />}
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
                reload={() => reloadConfig()}
                run={() => void begin()}
              />
            ) : (
              <section className="page-content">
                <h1>验证设置</h1>
                <p className="hint">
                  {configError || "正在读取场景与策略配置…"}
                </p>
                <button className="button" onClick={() => reloadConfig()}>
                  重新加载配置
                </button>
              </section>
            ))}
          {view === "runs" && (
            <HistoryView
              project={project}
              config={config}
              configReady={configReady === project.id}
              configError={configError}
              historyReady={historyReady === project.id}
              historyError={historyError}
              busy={busy}
              progress={progress}
              experimentDisabled={
                !!issues.length || !!setupValidation.experimentError
              }
              experiments={experiments}
              trials={trials}
              reload={() => reloadHistory()}
              cancel={cancelExperiment}
              experiment={(existing, proposed) =>
                void experiment(existing, proposed)
              }
              previewSample={previewSample}
              openTrial={openTrial}
            />
          )}
          {view === "versions" && (
            <VersionsView
              project={project}
              disabled={!!issues.length || busy}
              saveVersion={() => {
                setLabel(`版本 ${project.versions.length + 1}`);
                setModal("version");
              }}
              restore={(v) => {
                setProject((project) => ({
                  ...project,
                  model: copy(v.model),
                  simulator: v.simulator,
                  gameType: v.gameType,
                  direction: v.direction,
                  brief: copy(v.brief),
                }));
                setNotice("已将此版本复制为草稿，历史版本仍保留。");
              }}
            />
          )}
        </main>
      </div>
      {playOpen && trial && (
        <PlayWindow
          key={trial.id}
          title={trial.run.model.name}
          readOnly={!!previewTrial}
          busy={busy}
          error={error}
          close={() => setPlayOpen(false)}
          scene={
            frameworkUi ? (
              <>
                {JSON.stringify(trial.run.model) !== JSON.stringify(model) && (
                  <p className="play-window-notice">
                    设计方案已修改，本局继续使用开局时的规则。新开局时使用当前方案。
                  </p>
                )}
                {frameworkUi.renderScene({
                  trial,
                  cursor,
                  cards,
                  busy,
                  readOnly: !!previewTrial,
                  setCursor,
                  setCards,
                  execute: (action, automatic) =>
                    void execute(action, automatic),
                  newGame: () => void begin(),
                  newGameDisabled:
                    !!issues.length ||
                    !!configError ||
                    !!setupValidation.runError ||
                    historyReady !== project.id,
                })}
              </>
            ) : undefined
          }
          inspection={
            <RunView
              trial={trial}
              model={model}
              cursor={cursor}
              cards={cards}
              previewLabel={previewTrial ? previewLabel : null}
              setCursor={setCursor}
              setCards={setCards}
              execute={(action, automatic) => void execute(action, automatic)}
              back={() => setPlayOpen(false)}
              history={() => {
                setPlayOpen(false);
                setView("runs");
              }}
            />
          }
        />
      )}
      <WorkspaceDialogs
        modal={modal}
        kind={kind}
        label={label}
        model={model}
        setKind={setKind}
        setLabel={setLabel}
        close={() => setModal(null)}
        addDefinition={addDefinition}
        saveVersion={saveVersion}
      />
    </div>
  );
}
