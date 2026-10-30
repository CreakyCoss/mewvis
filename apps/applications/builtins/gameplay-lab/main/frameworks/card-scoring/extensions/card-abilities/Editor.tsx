import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import type { CardModel } from "../../../../domains/card/model";
import type { ModuleEditorProps } from "../../../composition/ui";
import { cardAbilitiesConfig, newCardAbility, type CardAbility } from "./model";

const number = (text: string, low: number, high: number) =>
  Math.min(high, Math.max(low, Math.floor(Number(text) || 0)));
export function CardAbilitiesEditor({
  model,
  update,
}: ModuleEditorProps<CardModel>) {
  const config = cardAbilitiesConfig(model);
  if (!config) return null;
  function change(id: string, fn: (ability: CardAbility) => void) {
    update((m) => {
      const ability = cardAbilitiesConfig(m)!.abilities.find(
        (a) => a.id === id,
      );
      if (ability) fn(ability);
    });
  }
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>卡牌能力</h1>
          <p>组合抽牌、选牌弃牌、资源费用与专注状态，定义自己的行动前能力。</p>
        </div>
      </div>
      <p className="hint">
        能力只作用于自己的牌区，不消耗普通行动次数。依次支付费用、弃牌、抽牌、施加状态；任何一步失败都不扣费、不扣次数。
      </p>
      <div className="settings-actions">
        {(
          [
            ["draw", "添加抽牌能力"],
            ["discard", "添加弃牌能力"],
            ["focus", "添加专注能力"],
          ] as const
        ).map(([kind, label]) => (
          <button
            className="button"
            key={kind}
            disabled={config.abilities.length >= 8}
            onClick={() =>
              update((m) =>
                cardAbilitiesConfig(m)!.abilities.push(newCardAbility(kind, m)),
              )
            }
          >
            {label}
          </button>
        ))}
      </div>
      {!config.abilities.length && (
        <p className="hint">添加一项能力，或在“玩法组合”中关闭此模块。</p>
      )}
      {config.abilities.map((ability, index) => (
        <section className="settings-section" key={ability.id}>
          <div className="page-heading">
            <h2>
              能力 {index + 1} · {ability.name || "未命名"}
            </h2>
            <button
              className="text-button"
              aria-label={`删除能力 ${index + 1}`}
              onClick={() =>
                update((m) => {
                  const c = cardAbilitiesConfig(m)!;
                  c.abilities = c.abilities.filter((a) => a.id !== ability.id);
                })
              }
            >
              删除
            </button>
          </div>
          <div className="rule-grid">
            <label className="form-field">
              能力名称
              <input
                aria-label={`能力 ${index + 1} 名称`}
                maxLength={40}
                value={ability.name}
                onChange={(e) =>
                  change(ability.id, (a) => {
                    a.name = e.target.value;
                  })
                }
              />
            </label>
            <label className="form-field">
              每局次数
              <input
                aria-label={`能力 ${index + 1} 次数`}
                type="number"
                min={1}
                max={3}
                value={ability.uses}
                onChange={(e) =>
                  change(ability.id, (a) => {
                    a.uses = number(e.target.value, 1, 3);
                  })
                }
              />
            </label>
            <label className="form-field">
              目标牌库
              <NativeSelect
                aria-label={`能力 ${index + 1} 牌库`}
                value={ability.deck}
                size="sm"
                onChange={(e) =>
                  change(ability.id, (a) => {
                    a.deck = e.target.value;
                  })
                }
              >
                <NativeSelectOption value="">请选择牌库</NativeSelectOption>
                {ability.deck &&
                  !model.decks.some((d) => d.id === ability.deck) && (
                    <NativeSelectOption value={ability.deck}>
                      牌库已不存在
                    </NativeSelectOption>
                  )}
                {model.decks.map((d) => (
                  <NativeSelectOption value={d.id} key={d.id}>
                    {d.name || "未命名牌库"}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label className="form-field">
              选牌弃置数量
              <input
                aria-label={`能力 ${index + 1} 弃牌数`}
                type="number"
                min={0}
                max={10}
                value={ability.discard}
                onChange={(e) =>
                  change(ability.id, (a) => {
                    a.discard = number(e.target.value, 0, 10);
                  })
                }
              />
            </label>
            <label className="form-field">
              最多抽牌数量
              <input
                aria-label={`能力 ${index + 1} 抽牌数`}
                type="number"
                min={0}
                max={10}
                value={ability.draw}
                onChange={(e) =>
                  change(ability.id, (a) => {
                    a.draw = number(e.target.value, 0, 10);
                  })
                }
              />
            </label>
            <label className="form-field">
              费用资源
              <NativeSelect
                aria-label={`能力 ${index + 1} 费用资源`}
                value={ability.cost?.field ?? ""}
                size="sm"
                onChange={(e) =>
                  change(ability.id, (a) => {
                    a.cost = e.target.value
                      ? { field: e.target.value, amount: a.cost?.amount ?? 1 }
                      : null;
                  })
                }
              >
                <NativeSelectOption value="">无费用</NativeSelectOption>
                {ability.cost &&
                  !model.fields.some((f) => f.id === ability.cost!.field) && (
                    <NativeSelectOption value={ability.cost.field}>
                      资源已不存在
                    </NativeSelectOption>
                  )}
                {model.fields.map((f) => (
                  <NativeSelectOption value={f.id} key={f.id}>
                    {f.name || "未命名资源"}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            {ability.cost && (
              <label className="form-field">
                基础费用
                <input
                  aria-label={`能力 ${index + 1} 费用`}
                  type="number"
                  min={1}
                  max={1000000}
                  value={ability.cost.amount}
                  onChange={(e) =>
                    change(ability.id, (a) => {
                      a.cost!.amount = number(e.target.value, 1, 1000000);
                    })
                  }
                />
              </label>
            )}
          </div>
          <label className="poker-toggle">
            <input
              type="checkbox"
              aria-label={`能力 ${index + 1} 施加专注`}
              checked={!!ability.focus}
              onChange={(e) =>
                change(ability.id, (a) => {
                  a.focus = e.target.checked ? { discount: 1, turns: 2 } : null;
                })
              }
            />
            施加专注状态
          </label>
          {ability.focus && (
            <div className="rule-grid">
              <label className="form-field">
                卡牌能力费用减免
                <input
                  aria-label={`能力 ${index + 1} 减免`}
                  type="number"
                  min={1}
                  max={3}
                  value={ability.focus.discount}
                  onChange={(e) =>
                    change(ability.id, (a) => {
                      a.focus!.discount = number(e.target.value, 1, 3);
                    })
                  }
                />
              </label>
              <label className="form-field">
                持续自己的行动阶段
                <input
                  aria-label={`能力 ${index + 1} 持续阶段`}
                  type="number"
                  min={1}
                  max={3}
                  value={ability.focus.turns}
                  onChange={(e) =>
                    change(ability.id, (a) => {
                      a.focus!.turns = number(e.target.value, 1, 3);
                    })
                  }
                />
              </label>
            </div>
          )}
          <p className="hint">
            弃牌必须选足设定张数；抽牌受该牌库容量和回收规则限制，剩余牌不足时只抽可用数量。专注包含施加当阶段，在自己的阶段结束时减
            1；重新施加会覆盖，只减免本模块费用。
          </p>
        </section>
      ))}
    </section>
  );
}
