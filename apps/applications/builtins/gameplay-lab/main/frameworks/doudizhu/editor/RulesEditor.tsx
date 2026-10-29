import { patternNames, type DoudizhuModel, type PatternKind } from "../model";
export function DoudizhuRulesEditor({
  model,
  update,
}: {
  model: DoudizhuModel;
  update(change: (model: DoudizhuModel) => void): void;
}) {
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>牌型与结算</h1>
          <p>保留三人叫分、地主与农民对抗的骨架，调整系统支持的出牌规则。</p>
        </div>
      </div>
      <section className="settings-section">
        <h2>允许的牌型</h2>
        <div className="poker-pattern-options">
          {Object.entries(patternNames).map(([kind, name]) => (
            <label key={kind}>
              <input
                type="checkbox"
                checked={model.rules.enabled.includes(kind as PatternKind)}
                disabled={kind === "single"}
                onChange={(e) =>
                  update((m) => {
                    m.rules.enabled = e.target.checked
                      ? [...m.rules.enabled, kind as PatternKind]
                      : m.rules.enabled.filter((k) => k !== kind);
                  })
                }
              />
              {name}
              {kind === "single" && "（必要）"}
            </label>
          ))}
        </div>
        <p className="hint">
          同牌型、同张数比较主体点数；炸弹压过普通牌型，王炸最大。连续牌型不含 2
          和大小王。
        </p>
      </section>
      <section className="settings-section">
        <h2>连续牌型</h2>
        <div className="rule-grid">
          {[
            ["straightMin", "顺子最少张数", 3, 12],
            ["pairChainMin", "连对最少对数", 2, 10],
            ["tripleChainMin", "飞机最少三张组数", 2, 6],
          ].map(([key, label, min, max]) => (
            <label className="form-field" key={key}>
              {label}
              <input
                aria-label={String(label)}
                type="number"
                min={min}
                max={max}
                value={model.rules[key as "straightMin"]}
                onChange={(e) =>
                  update((m) => {
                    m.rules[key as "straightMin"] = Math.min(
                      Number(max),
                      Math.max(
                        Number(min),
                        Number(e.target.value) || Number(min),
                      ),
                    );
                  })
                }
              />
            </label>
          ))}
        </div>
        <label className="poker-toggle">
          <input
            type="checkbox"
            checked={model.rules.distinctSingles}
            onChange={(e) =>
              update((m) => {
                m.rules.distinctSingles = e.target.checked;
              })
            }
          />
          飞机带单、四带两张的附带牌必须点数不同
        </label>
        <p className="hint">
          附带牌不能来自主体点数；飞机带对和四带两对使用不同点数的对子。带牌不能同时包含大小王。
        </p>
      </section>
      <section className="settings-section">
        <h2>得分</h2>
        <div className="rule-grid">
          <label className="form-field">
            基础分
            <input
              aria-label="斗地主基础分"
              type="number"
              min={1}
              max={100}
              value={model.rules.baseScore}
              onChange={(e) =>
                update((m) => {
                  m.rules.baseScore = Math.min(
                    100,
                    Math.max(1, Number(e.target.value) || 1),
                  );
                })
              }
            />
          </label>
          <label className="form-field">
            每次炸弹或王炸倍率
            <input
              aria-label="炸弹倍率"
              type="number"
              min={1}
              max={4}
              value={model.rules.bombFactor}
              onChange={(e) =>
                update((m) => {
                  m.rules.bombFactor = Math.min(
                    4,
                    Math.max(1, Number(e.target.value) || 1),
                  );
                })
              }
            />
          </label>
        </div>
        <p className="hint">
          单个农民分值 = 基础分 × 叫分 ×
          累积倍率。地主输赢两倍，两位农民同输同赢；当前不计算春天。
        </p>
      </section>
    </section>
  );
}
