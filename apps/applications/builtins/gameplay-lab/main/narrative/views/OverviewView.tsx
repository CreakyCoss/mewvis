import { Plus } from "lucide-react";
import { directionDefinition, gameTypeName } from "../../projects/catalog";
import { DirectionPicker } from "../../projects/components/DirectionPicker";
import { type Project } from "../../projects/model";
import type { ReadinessIssue } from "../../shared/contracts";
import { type NarrativeModel } from "../model";

export function OverviewView({
  project,
  issues,
  busy,
  historyReady,
  update,
  patch,
  begin,
  addNode,
  edit,
  fix,
}: {
  project: Project<NarrativeModel>;
  issues: ReadinessIssue[];
  busy: boolean;
  historyReady: boolean;
  update(change: (model: NarrativeModel) => void): void;
  patch(change: (project: Project<NarrativeModel>) => void): void;
  edit(view: "characters" | "variables"): void;
  begin(): void;
  addNode(): void;
  fix(path: string): void;
}) {
  const model = project.model;
  const issueLabel = (path: string) =>
    model.nodes.find((n) => n.id === path)?.title ??
    model.variables.find((v) => v.id === path)?.name ??
    model.characters.find((c) => c.id === path)?.name ??
    path;
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>策划概览</h1>
          <p>
            {gameTypeName(project.gameType)} ·{" "}
            {directionDefinition(project.direction)?.name ?? "待选玩法方向"} ·
            从零开始
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
            {issues.length ? `还有 ${issues.length} 项待配置` : "可以开始试玩"}
          </h2>
          <div className="settings-actions">
            <button className="button" onClick={addNode}>
              <Plus size={14} />
              添加剧情
            </button>
            <button className="button" onClick={() => edit("characters")}>
              设计人物
            </button>
            <button className="button" onClick={() => edit("variables")}>
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
                  <button className="text-button" onClick={() => fix(i.path)}>
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
  );
}
