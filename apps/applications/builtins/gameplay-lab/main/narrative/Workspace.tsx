import {
  ArrowLeft,
  BookOpen,
  GitBranch,
  History,
  LayoutGrid,
  Play,
  Settings2,
  Users,
  Variable,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import appIcon from "../../assets/icon-sandbox.png";
import { projectReadiness } from "../projects/compatibility";
import { isNarrativeProject, type Project } from "../projects/model";
import { projectRepository } from "../projects/repository";
import { ApplicationForm } from "../shared/components/Form";
import { Modal } from "../shared/components/Modal";
import { copy, uid } from "../shared/utils";
import { type NarrativeModel } from "./model";
import { chooseStory, newStoryRecord, type StoryRecord } from "./records";
import { narrativeHistory } from "./repository";
import { validateNarrative } from "./validation";
import { CharactersView } from "./views/CharactersView";
import { HistoryView } from "./views/HistoryView";
import { NodesView } from "./views/NodesView";
import { OverviewView } from "./views/OverviewView";
import { PlayView } from "./views/PlayView";
import { SettingsView } from "./views/SettingsView";
import { VariablesView } from "./views/VariablesView";
import { VersionsView } from "./views/VersionsView";
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
  const model = project.model;
  const issues = useMemo(() => projectReadiness(project), [project]);
  const replaying = !!record && cursor >= 0 && cursor < record.decisions.length;
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
    await projectRepository().saveProject(project);
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
  async function reloadProject() {
    await projectRepository()
      .flush()
      .catch(() => {});
    const loaded = await projectRepository().reload(project);
    if (!isNarrativeProject(loaded))
      throw new Error("项目类型已变化，请返回项目库重新打开。");
    setProject(loaded);
    savedProject.current = JSON.stringify(loaded);
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
            <OverviewView
              project={project}
              issues={issues}
              busy={busy}
              historyReady={historyReady}
              update={update}
              patch={patch}
              begin={() => void act(begin)}
              addNode={addNode}
              edit={setView}
              fix={fix}
            />
          )}
          {view === "characters" && (
            <CharactersView model={model} update={update} setError={setError} />
          )}
          {view === "variables" && (
            <VariablesView model={model} update={update} setError={setError} />
          )}
          {view === "nodes" && (
            <NodesView
              model={model}
              selected={selected}
              setSelected={setSelected}
              update={update}
              setError={setError}
              addNode={addNode}
            />
          )}
          {view === "play" && record && (
            <PlayView
              record={record}
              cursor={cursor}
              busy={busy}
              setCursor={setCursor}
              back={() => setView("nodes")}
              decide={(id) => void act(() => decide(id))}
            />
          )}
          {view === "history" && (
            <HistoryView
              model={model}
              records={records}
              historyReady={historyReady}
              historyErrors={historyErrors}
              busy={busy}
              reload={() => setHistoryRevision((n) => n + 1)}
              openRecord={(r) => {
                setRecord(r);
                setCursor(-1);
                setView("play");
              }}
              editNode={(id) => {
                setSelected(id);
                setView("nodes");
              }}
            />
          )}
          {view === "versions" && (
            <VersionsView
              project={project}
              disabled={!!issues.length || project.versions.length >= 10}
              saveVersion={() =>
                setVersionName(`版本 ${project.versions.length + 1}`)
              }
              patch={patch}
            />
          )}
          {view === "settings" && (
            <SettingsView
              project={project}
              update={update}
              patch={patch}
              reload={() => void act(reloadProject)}
            />
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
