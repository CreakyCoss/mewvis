import { CircleHelp } from "lucide-react";
import { useEffect, useState } from "react";
import appIcon from "../assets/icon-sandbox.png";
import NarrativeWorkspace from "./narrative/Workspace";
import { ProjectCreateForm } from "./projects/components/ProjectForms";
import { ProjectLibrary } from "./projects/components/ProjectLibrary";
import {
  initialWorkspace,
  isNarrativeProject,
  isTurnProject,
  type AnyProject,
  type DesignModel,
  type Workspace,
} from "./projects/model";
import { projectRepository } from "./projects/repository";
import { Modal } from "./shared/components/Modal";
import "./styles/index.css";
import TurnWorkspace from "./turn/Workspace";
export default function App() {
  const [workspace, setWorkspace] = useState<Workspace<DesignModel>>(() =>
    initialWorkspace<DesignModel>(),
  );
  const [active, setActive] = useState<AnyProject | null>(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const [modal, setModal] = useState<"project" | "help" | null>(null);
  useEffect(() => {
    let live = true;
    setReady(false);
    void projectRepository()
      .list()
      .then((w) => {
        if (live) {
          setWorkspace(w);
          setReady(true);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [revision]);
  function accepted(p: AnyProject) {
    setActive(p);
    setModal(null);
    setError("");
  }
  async function open(id?: string) {
    setBusy(true);
    setError("");
    try {
      const p = id ? workspace.projects.find((p) => p.id === id) : null;
      const loaded = p
        ? await projectRepository().reload(p)
        : await projectRepository().open();
      if (loaded) accepted(loaded);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function exit() {
    setActive(null);
    setRevision((n) => n + 1);
  }
  if (active && isNarrativeProject(active))
    return (
      <NarrativeWorkspace
        key={active.id}
        initialProject={active}
        onExit={exit}
      />
    );
  if (active && isTurnProject(active))
    return (
      <TurnWorkspace key={active.id} initialProject={active} onExit={exit} />
    );
  return (
    <div className="lab-app library-home">
      <header className="lab-header">
        <div className="lab-brand">
          <img className="lab-brand-icon" src={appIcon} alt="" />
          <strong>游戏沙盘</strong>
        </div>
        <div className="header-actions">
          <button className="button" onClick={() => setModal("help")}>
            <CircleHelp size={16} />
            使用指南
          </button>
        </div>
      </header>
      <div className="lab-shell">
        <main className="lab-main" inert={busy}>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <ProjectLibrary
            projects={workspace.projects}
            ready={ready && !busy}
            create={() => setModal("project")}
            open={(id) => void open(id)}
            attach={() => void open()}
            errors={workspace.errors}
          />
        </main>
      </div>
      {modal === "project" && (
        <Modal title="新建策划项目" busy={busy} close={() => setModal(null)}>
          <ProjectCreateForm
            created={accepted}
            close={() => setModal(null)}
            busyChanged={setBusy}
            beforeCreate={async () => {}}
          />
        </Modal>
      )}
      {modal === "help" && (
        <Modal title="按游戏类型开始策划" close={() => setModal(null)}>
          <div className="help-content">
            <p>
              先选择游戏类型，再选择要验证的玩法方向。空白项目没有预填内容，示例只作为可选起点。
            </p>
            <p>
              卡牌和回合资源经营使用各自的数值规则工作区；文字冒险使用独立的人物、剧情、变量与分支编辑器。每个方向都明确列出支持范围。
            </p>
            <p>
              内容会保存到所选项目目录。就绪检查通过后可以人工试玩，运行记录冻结规则和模拟器版本；修改草稿不会改写旧记录。
            </p>
            <p>
              棋盘经济和塔防尚未提供。自动实验用于分析已支持的数值机制，叙事体验仍需人工试玩判断。
            </p>
            <button className="button primary" onClick={() => setModal(null)}>
              开始策划
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
