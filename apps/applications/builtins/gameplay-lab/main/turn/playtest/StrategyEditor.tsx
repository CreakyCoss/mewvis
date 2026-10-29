import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { Copy, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { copy, uid } from "../../shared/utils";
import { type Model } from "../model";
import { amount } from "../rules/EffectsEditor";
import {
  allStrategies,
  basePolicyNames,
  type Condition,
  type PlaytestConfig,
  type Strategy,
} from "./config";
import { selectOptions as select } from "./options";
export function StrategyEditor({
  model,
  config,
  busy,
  change,
  deleting,
  setDeleting,
}: {
  model: Model;
  config: PlaytestConfig;
  busy: boolean;
  change(change: (config: PlaytestConfig) => void): void;
  deleting: string;
  setDeleting(id: string): void;
}) {
  const [editing, setEditing] = useState(
    config.scenarios.find((s) => s.id === config.selectedScenario)
      ?.participants[0]?.strategyId ?? "goal",
  );
  const catalogue = allStrategies(config);
  const strategy = catalogue.find((s) => s.id === editing) ?? catalogue[0];
  const builtin = !config.strategies.some((s) => s.id === strategy.id);
  const patchStrategy = (work: (s: Strategy) => void) =>
    change((c) => {
      const s = c.strategies.find((s) => s.id === strategy.id);
      if (s) work(s);
    });
  const cloneStrategy = () => {
    const id = uid("strategy");
    change((c) => {
      c.strategies.push({
        ...copy(strategy),
        id,
        name: `${strategy.name.slice(0, 50)} 副本`,
      });
    });
    setEditing(id);
  };
  const refs = config.scenarios
    .filter((s) => s.participants.some((p) => p.strategyId === strategy.id))
    .map((s) => `场景「${s.name}」`);
  if (config.comparedStrategies.includes(strategy.id))
    refs.push("实验对照选择");

  return (
    <section className="settings-section section-gap">
      <div className="section-title">
        <h2>决策策略</h2>
        <button
          className="button"
          disabled={config.strategies.length >= 20 || busy}
          onClick={cloneStrategy}
        >
          <Copy size={14} />
          {builtin ? "复制为自定义策略" : "复制策略"}
        </button>
      </div>
      <label className="form-field">
        查看或编辑策略
        <NativeSelect
          aria-label="查看或编辑策略"
          value={strategy.id}
          onChange={(event) => {
            setEditing(event.target.value);
            setDeleting("");
          }}
          size="sm"
        >
          {select(catalogue, strategy.id)}
        </NativeSelect>
      </label>
      {builtin ? (
        <p className="hint">
          内置策略只读。复制到项目后，可配置行动条件、优先级、资源保留门槛和选牌方式。
        </p>
      ) : (
        <fieldset className="project-fields">
          <div className="rule-grid">
            <label className="form-field">
              策略名称
              <input
                aria-label="策略名称"
                maxLength={60}
                value={strategy.name}
                onChange={(e) =>
                  patchStrategy((s) => {
                    s.name = e.target.value;
                  })
                }
              />
            </label>
            <label className="form-field">
              规则选择方式
              <NativeSelect
                aria-label="规则选择方式"
                value={strategy.selection}
                onChange={(event) =>
                  patchStrategy((s) => {
                    s.selection = event.target.value as Strategy["selection"];
                  })
                }
                size="sm"
              >
                <NativeSelectOption value="priority">
                  选最高优先级
                </NativeSelectOption>
                <NativeSelectOption value="weighted">
                  按权重随机
                </NativeSelectOption>
              </NativeSelect>
            </label>
            <label className="form-field">
              组合选牌方式
              <NativeSelect
                aria-label="组合选牌方式"
                value={strategy.cards}
                onChange={(event) =>
                  patchStrategy((s) => {
                    s.cards = event.target.value as Strategy["cards"];
                  })
                }
                size="sm"
              >
                <NativeSelectOption value="best">
                  当前组合得分最高
                </NativeSelectOption>
                <NativeSelectOption value="value">
                  基础值最高
                </NativeSelectOption>
                <NativeSelectOption value="random">
                  按种子随机选择
                </NativeSelectOption>
              </NativeSelect>
            </label>
            <label className="form-field">
              无匹配规则时
              <NativeSelect
                aria-label="无匹配规则时"
                value={strategy.fallback}
                onChange={(event) =>
                  patchStrategy((s) => {
                    s.fallback = event.target.value as Strategy["fallback"];
                  })
                }
                size="sm"
              >
                <NativeSelectOption value="base">
                  使用基础策略
                </NativeSelectOption>
                <NativeSelectOption value="end">
                  结束行动阶段
                </NativeSelectOption>
              </NativeSelect>
            </label>
            {strategy.fallback === "base" && (
              <label className="form-field">
                基础策略
                <NativeSelect
                  aria-label="基础策略"
                  value={strategy.base}
                  onChange={(event) =>
                    patchStrategy((s) => {
                      s.base = event.target.value as Strategy["base"];
                    })
                  }
                  size="sm"
                >
                  {Object.entries(basePolicyNames).map(([id, name]) => (
                    <NativeSelectOption key={id} value={id}>
                      {name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
            )}
          </div>
          <h3 className="section-gap">资源保留门槛</h3>
          <p className="hint">
            自动决策时，有成本的行动在支付后必须保留指定数量；不消耗该状态的行动仍可执行。
          </p>
          {strategy.reserves.map((r, i) => (
            <div className="config-condition" key={i}>
              <NativeSelect
                aria-label={`保留状态 ${i + 1}`}
                value={r.field}
                onChange={(event) =>
                  patchStrategy((s) => {
                    s.reserves[i].field = event.target.value;
                  })
                }
                size="sm"
              >
                {select(
                  model.fields.filter(
                    (f) =>
                      f.id === r.field ||
                      !strategy.reserves.some((r) => r.field === f.id),
                  ),
                  r.field,
                )}
              </NativeSelect>
              <input
                aria-label={`保留数量 ${i + 1}`}
                type="number"
                min="0"
                max="1000000"
                value={r.value}
                onChange={(e) =>
                  patchStrategy((s) => {
                    s.reserves[i].value = amount(e.target.value);
                  })
                }
              />
              <button
                className="icon-button"
                aria-label={`移除保留门槛 ${i + 1}`}
                onClick={() =>
                  patchStrategy((s) => {
                    s.reserves.splice(i, 1);
                  })
                }
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            className="text-button"
            disabled={strategy.reserves.length >= model.fields.length}
            onClick={() =>
              patchStrategy((s) => {
                const f = model.fields.find(
                  (f) => !s.reserves.some((r) => r.field === f.id),
                );
                if (f) s.reserves.push({ field: f.id, value: 0 });
              })
            }
          >
            <Plus size={14} />
            添加保留门槛
          </button>
          <h3 className="section-gap">行动规则</h3>
          <p className="hint">
            规则内的条件全部满足才参与选择。优先级 / 权重为 0
            时停用该行动。无匹配时，基础策略只会选择未配置规则的行动。
          </p>
          {strategy.rules.map((r, i) => (
            <div className="strategy-rule" key={i}>
              <div className="rule-grid">
                <label className="form-field">
                  行动
                  <NativeSelect
                    aria-label={`规则 ${i + 1} 行动`}
                    value={r.action}
                    onChange={(event) =>
                      patchStrategy((s) => {
                        s.rules[i].action = event.target.value;
                      })
                    }
                    size="sm"
                  >
                    {select(
                      model.actions.filter(
                        (a) =>
                          a.id === r.action ||
                          !strategy.rules.some((r) => r.action === a.id),
                      ),
                      r.action,
                    )}
                  </NativeSelect>
                </label>
                <label className="form-field">
                  优先级 / 权重
                  <input
                    aria-label={`规则 ${i + 1} 优先级`}
                    type="number"
                    min="0"
                    max="1000"
                    value={r.priority}
                    onChange={(e) =>
                      patchStrategy((s) => {
                        s.rules[i].priority = amount(e.target.value, 0, 1000);
                      })
                    }
                  />
                </label>
              </div>
              {r.conditions.map((c, j) => (
                <div className="config-condition" key={j}>
                  <NativeSelect
                    aria-label={`规则 ${i + 1} 条件 ${j + 1} 状态`}
                    value={c.field}
                    onChange={(event) =>
                      patchStrategy((s) => {
                        s.rules[i].conditions[j].field = event.target.value;
                      })
                    }
                    size="sm"
                  >
                    {select(model.fields, c.field)}
                  </NativeSelect>
                  <NativeSelect
                    aria-label={`规则 ${i + 1} 条件 ${j + 1} 比较`}
                    value={c.op}
                    onChange={(event) =>
                      patchStrategy((s) => {
                        s.rules[i].conditions[j].op = event.target
                          .value as Condition["op"];
                      })
                    }
                    size="sm"
                  >
                    <NativeSelectOption value="gte">≥</NativeSelectOption>
                    <NativeSelectOption value="lte">≤</NativeSelectOption>
                    <NativeSelectOption value="lt">＜</NativeSelectOption>
                    <NativeSelectOption value="gt">＞</NativeSelectOption>
                    <NativeSelectOption value="eq">＝</NativeSelectOption>
                  </NativeSelect>
                  <input
                    aria-label={`规则 ${i + 1} 条件 ${j + 1} 门槛`}
                    type="number"
                    min="0"
                    max="1000000"
                    value={c.value}
                    onChange={(e) =>
                      patchStrategy((s) => {
                        s.rules[i].conditions[j].value = amount(e.target.value);
                      })
                    }
                  />
                  <button
                    className="icon-button"
                    aria-label={`移除规则 ${i + 1} 条件 ${j + 1}`}
                    onClick={() =>
                      patchStrategy((s) => {
                        s.rules[i].conditions.splice(j, 1);
                      })
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <div className="settings-actions">
                <button
                  className="text-button"
                  disabled={!model.fields.length || r.conditions.length >= 10}
                  onClick={() =>
                    patchStrategy((s) => {
                      s.rules[i].conditions.push({
                        field: model.fields[0].id,
                        op: "gte",
                        value: 0,
                      });
                    })
                  }
                >
                  <Plus size={14} />
                  添加条件
                </button>
                <button
                  className="text-button danger-text"
                  onClick={() =>
                    patchStrategy((s) => {
                      s.rules.splice(i, 1);
                    })
                  }
                >
                  移除行动规则
                </button>
              </div>
            </div>
          ))}
          <button
            className="text-button"
            disabled={strategy.rules.length >= model.actions.length}
            onClick={() =>
              patchStrategy((s) => {
                const a = model.actions.find(
                  (a) => !s.rules.some((r) => r.action === a.id),
                );
                if (a)
                  s.rules.push({
                    action: a.id,
                    priority: 10,
                    conditions: [],
                  });
              })
            }
          >
            <Plus size={14} />
            添加行动规则
          </button>
          <div>
            <button
              className="text-button danger-text"
              onClick={() =>
                setDeleting(deleting === strategy.id ? "" : strategy.id)
              }
            >
              <Trash2 size={14} />
              删除策略
            </button>
          </div>
          {deleting === strategy.id && (
            <div className="settings-confirm">
              {refs.length ? (
                <p>请先解除引用：{refs.join("、")}</p>
              ) : (
                <>
                  <p>历史记录保留原策略快照。</p>
                  <button
                    className="button"
                    onClick={() => {
                      change((c) => {
                        c.strategies = c.strategies.filter(
                          (s) => s.id !== strategy.id,
                        );
                      });
                      setEditing("goal");
                      setDeleting("");
                    }}
                  >
                    确认删除策略
                  </button>
                </>
              )}
              <button className="text-button" onClick={() => setDeleting("")}>
                取消
              </button>
            </div>
          )}
        </fieldset>
      )}
    </section>
  );
}
