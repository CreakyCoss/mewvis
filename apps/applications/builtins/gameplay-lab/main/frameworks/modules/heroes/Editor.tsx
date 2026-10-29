import type { HeroesConfig } from "./model";

export function HeroesEditor({
  config,
  update,
}: {
  config: HeroesConfig | undefined;
  update(change: (config: HeroesConfig) => void): void;
}) {
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>英雄与技能</h1>
          <p>为玩家配置英雄，行动前选择目标，查看其随机手牌。</p>
        </div>
      </div>
      <p className="hint">
        在“玩法组合”管理模块开关；这里配置启用模块的英雄内容。已有对局继续使用开局配置。
      </p>
      {config?.enabled &&
        config.seats.map((hero, seat) => (
          <section className="settings-section" key={hero.id}>
            <h2>玩家 {seat + 1}</h2>
            <div className="rule-grid">
              <label className="form-field">
                英雄名
                <input
                  aria-label={"玩家 " + (seat + 1) + " 英雄名"}
                  maxLength={40}
                  value={hero.name}
                  onChange={(e) =>
                    update((m) => {
                      m.seats[seat].name = e.target.value;
                    })
                  }
                />
              </label>
              <label className="form-field">
                技能名
                <input
                  aria-label={"玩家 " + (seat + 1) + " 技能名"}
                  maxLength={40}
                  value={hero.skill.name}
                  onChange={(e) =>
                    update((m) => {
                      m.seats[seat].skill.name = e.target.value;
                    })
                  }
                />
              </label>
              <label className="form-field">
                每局使用次数
                <input
                  aria-label={"玩家 " + (seat + 1) + " 技能次数"}
                  type="number"
                  min={1}
                  max={3}
                  value={hero.skill.uses}
                  onChange={(e) =>
                    update((m) => {
                      m.seats[seat].skill.uses = Math.min(
                        3,
                        Math.max(1, Number(e.target.value) || 1),
                      );
                    })
                  }
                />
              </label>
              <label className="form-field">
                每次查看张数
                <input
                  aria-label={"玩家 " + (seat + 1) + " 查看张数"}
                  type="number"
                  min={1}
                  max={3}
                  value={hero.skill.count}
                  onChange={(e) =>
                    update((m) => {
                      m.seats[seat].skill.count = Math.min(
                        3,
                        Math.max(1, Number(e.target.value) || 1),
                      );
                    })
                  }
                />
              </label>
            </div>
            <p className="hint">
              轮到自己行动时可选另一名有手牌的玩家使用；不消耗普通行动次数。结果仅使用者可见，目标牌少于设定张数时查看全部。
            </p>
          </section>
        ))}
    </section>
  );
}
