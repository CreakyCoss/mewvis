import type { Project } from "../../../app/projects/model";
import type { ReadinessIssue } from "../../../shared/contracts";
import { doudizhuDefinition } from "../definition";
import type { DoudizhuModel } from "../model";
export function DoudizhuOverview({
  project,
  issues,
  historyReady,
  seed,
  setSeed,
  openRules,
  play,
  update,
  changeQuestion,
}: {
  project: Project<DoudizhuModel>;
  issues: ReadinessIssue[];
  historyReady: boolean;
  seed: number;
  setSeed(value: number): void;
  openRules(): void;
  play(): void;
  update(change: (m: DoudizhuModel) => void): void;
  changeQuestion(value: string): void;
}) {
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <div className="eyebrow">卡牌 · 斗地主框架 v1</div>
          <h1>{project.model.name}</h1>
          <p>{doudizhuDefinition.description}</p>
        </div>
      </div>
      <section className="settings-section">
        <h2>从完整玩法开始设计</h2>
        <p>
          框架提供 54
          张牌、三人叫分、地主与农民阵营、跟牌与过牌、清空手牌胜负及结算。你可以直接调整牌型和规则，再进入牌桌验证。
        </p>
        <div className="settings-actions">
          <button className="button" onClick={() => openRules()}>
            配置 {project.model.rules.enabled.length} 种牌型
          </button>
          <button
            className="button primary"
            disabled={!!issues.length || !historyReady}
            onClick={() => play()}
          >
            进入牌桌
          </button>
        </div>
        <p className="hint">{doudizhuDefinition.scope}</p>
      </section>
      {issues.length > 0 && (
        <div className="form-error" role="alert">
          {issues.map((issue, i) => (
            <p key={i}>{issue.message}</p>
          ))}
        </div>
      )}
      <section className="settings-section">
        <h2>试玩设置</h2>
        <label className="form-field">
          随机种子
          <input
            aria-label="斗地主随机种子"
            type="number"
            min={0}
            max={4294967295}
            value={seed}
            onChange={(e) =>
              setSeed(
                Math.min(
                  4294967295,
                  Math.max(0, Math.floor(Number(e.target.value) || 0)),
                ),
              )
            }
          />
        </label>
        <p className="hint">
          你控制玩家
          1，另外两位由基础自动玩家操作。相同规则和种子可复现发牌及操作结果；自动玩家只读取自己的手牌和公开信息。
        </p>
      </section>
      <section className="settings-section">
        <h2>设计意图</h2>
        <label className="form-field">
          方案说明
          <textarea
            aria-label="斗地主方案说明"
            maxLength={4000}
            value={project.model.description}
            onChange={(e) =>
              update((m) => {
                m.description = e.target.value;
              })
            }
          />
        </label>
        <label className="form-field">
          本次想验证的问题
          <textarea
            aria-label="斗地主待验证问题"
            maxLength={4000}
            value={project.brief.question}
            onChange={(e) => changeQuestion(e.target.value)}
          />
        </label>
      </section>
    </section>
  );
}
