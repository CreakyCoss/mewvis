import { CheckCircle2, Circle, Play, Plus } from "lucide-react";
import { type ReadinessIssue, type SimulatorRef } from "../../shared/contracts";
import type { Model, NodeKind } from "../../turn/model";
import { gameTypeName, type DirectionId } from "../catalog";
import { projectReadiness } from "../compatibility";
import { templates } from "../examples";
import type { DesignBrief, Project } from "../model";
import { DirectionPicker } from "./DirectionPicker";
export function ProjectOverview({
  project,
  busy,
  runDisabled,
  update,
  brief,
  selectSimulator,
  add,
  fix,
  run,
}: {
  project: Project;
  busy: boolean;
  runDisabled: boolean;
  update(change: (m: Model) => void): void;
  brief(value: DesignBrief): void;
  selectSimulator(
    ref: SimulatorRef | null,
    direction: DirectionId | null,
  ): void;
  add(kind: NodeKind): void;
  fix(issue: ReadinessIssue): void;
  run(): void;
}) {
  const issues = projectReadiness(project);
  const source = templates.find((t) => t.id === project.exampleId);
  const label = (issue: ReadinessIssue) =>
    [
      ...project.model.fields,
      ...project.model.capabilities,
      ...project.model.actions,
      ...project.model.goals,
      ...project.model.collections,
    ].find((n) => n.id === issue.path)?.name ?? issue.path;
  return (
    <section className="page-content project-overview">
      <div className="page-heading">
        <div>
          <h1>策划概览</h1>
          <p>
            {project.model.name} ·{" "}
            {source ? `示例来源：${source.name}` : "从零开始"} ·{" "}
            {gameTypeName(project.gameType)}
          </p>
        </div>
        <button
          className="button primary"
          disabled={busy || runDisabled || !!issues.length}
          onClick={run}
        >
          <Play size={16} />
          人工试玩
        </button>
      </div>
      <div className="overview-grid">
        <section className="settings-section">
          <h2>玩法选择</h2>
          <DirectionPicker
            gameType={project.gameType}
            value={project.direction}
            simulator={project.simulator}
            change={selectSimulator}
            disabled={busy}
          />
          <p className="hint">
            示例是可选的创建起点。当前工作区按游戏类型组织，规则只有通过玩法方向及模拟器的兼容性检查后才能运行。
          </p>
        </section>
        <section
          className="settings-section readiness-panel"
          aria-label="试玩就绪检查"
        >
          <h2>
            {issues.length ? `还有 ${issues.length} 项待配置` : "可以开始试玩"}
          </h2>
          <p className="hint">
            先配置最小规则即可人工试玩，自动玩家和实验可稍后设置。
          </p>
          <div className="settings-actions">
            {(["state", "action", "goal"] as NodeKind[]).map((kind, i) => (
              <button
                className="button"
                key={kind}
                disabled={
                  busy || (kind !== "state" && !project.model.fields.length)
                }
                onClick={() => add(kind)}
              >
                <Plus size={14} />
                添加{["状态", "行动", "目标"][i]}
              </button>
            ))}
          </div>
          {issues.length ? (
            <ul className="readiness-list">
              {issues.slice(0, 12).map((issue, i) => (
                <li key={i}>
                  <Circle size={15} />
                  <div>
                    <strong>{label(issue)}</strong>
                    <p>{issue.message}</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => fix(issue)}
                    disabled={busy}
                  >
                    配置
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="readiness-success">
              <CheckCircle2 size={20} />
              <p>
                规则与模拟器校验通过。开始运行后，规则、场景和模拟器版本会冻结为本局快照。
              </p>
            </div>
          )}
          {issues.length > 12 && (
            <p className="hint">显示前 12 项，修复后继续检查。</p>
          )}
        </section>
        <section className="settings-section overview-brief">
          <h2>设计意图</h2>
          <label className="form-field">
            设计目标
            <textarea
              aria-label="设计目标"
              rows={3}
              maxLength={2000}
              value={project.model.description}
              onChange={(e) =>
                update((m) => {
                  m.description = e.target.value;
                })
              }
              placeholder="玩家要做什么选择？这款游戏希望提供什么体验？"
            />
          </label>
          <label className="form-field">
            核心循环
            <textarea
              aria-label="核心循环"
              rows={3}
              maxLength={4000}
              value={project.brief.coreLoop}
              onChange={(e) =>
                brief({ ...project.brief, coreLoop: e.target.value })
              }
              placeholder="例如：投入资源 → 获取产出 → 解锁行动 → 推进目标"
            />
          </label>
          <label className="form-field">
            待验证问题
            <textarea
              aria-label="待验证问题"
              rows={3}
              maxLength={4000}
              value={project.brief.question}
              onChange={(e) =>
                brief({ ...project.brief, question: e.target.value })
              }
              placeholder="这次想验证哪条规则或哪个数值是否可行？"
            />
          </label>
          <p className="hint">
            设计说明记录意图；实际结算使用规则定义中的配置。修改会自动保存到项目。
          </p>
        </section>
      </div>
    </section>
  );
}
