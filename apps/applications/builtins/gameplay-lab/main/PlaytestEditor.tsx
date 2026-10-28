import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { useState } from "react";
import { Copy, Plus, Trash2, X, Play } from "lucide-react";
import { amount } from "./EffectsEditor";
import { copy, uid, type Model } from "./model";
import {
  allStrategies,
  basePolicyNames,
  initialPlayer,
  selectedSetup,
  type PlaytestConfig,
  type Strategy,
  type Condition,
} from "./playtest";
export function PlaytestEditor({
  model,
  config,
  change,
  status,
  error,
  reload,
  busy,
  runDisabled,
  run,
}: {
  model: Model;
  config: PlaytestConfig;
  change(change: (c: PlaytestConfig) => void): void;
  status: string;
  error: string;
  reload(): void;
  busy: boolean;
  runDisabled: boolean;
  run(): void;
}) {
  const [editing, setEditing] = useState(
      config.scenarios.find((s) => s.id === config.selectedScenario)
        ?.participants[0]?.strategyId ?? "goal",
    ),
    [deleting, setDeleting] = useState("");
  const catalogue = allStrategies(config),
    scenario = config.scenarios.find((s) => s.id === config.selectedScenario),
    strategy = catalogue.find((s) => s.id === editing) ?? catalogue[0],
    builtin = !config.strategies.some((s) => s.id === strategy.id);
  const patchScenario = (work: (s: NonNullable<typeof scenario>) => void) =>
    change((c) => {
      const s = c.scenarios.find((s) => s.id === c.selectedScenario);
      if (s) work(s);
    });
  const patchStrategy = (work: (s: Strategy) => void) =>
    change((c) => {
      const s = c.strategies.find((s) => s.id === strategy.id);
      if (s) work(s);
    });
  const select = (items: { id: string; name: string }[], value: string) => (
    <>
      {!items.some((i) => i.id === value) && (
        <NativeSelectOption value={value}>已失效：{value}</NativeSelectOption>
      )}
      {items.map((i) => (
        <NativeSelectOption key={i.id} value={i.id}>
          {i.name}
        </NativeSelectOption>
      ))}
    </>
  );
  const newScenario = () =>
    change((c) => {
      const s = {
        id: uid("scenario"),
        name: "新场景",
        seedStart: 42,
        seedCount: 12,
        participants: [initialPlayer()],
      };
      c.scenarios.push(s);
      c.selectedScenario = s.id;
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
  let runError = "",
    experimentError = "";
  try {
    selectedSetup(config, model);
  } catch (e) {
    runError = (e as Error).message;
  }
  try {
    selectedSetup(config, model, true);
  } catch (e) {
    experimentError = (e as Error).message;
  }
  return (
    <section className="page-content playtest-page">
      <div className="page-heading">
        <div>
          <h1>策略与场景</h1>
          <p>保存初始条件，配置决策方式，再用相同场景比较策略。</p>
        </div>
        <div className="config-save">
          <span role="status">配置 · {status}</span>
          <button className="button" disabled={busy} onClick={reload}>
            重新加载配置
          </button>
        </div>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <section className="settings-section">
        <div className="section-title">
          <h2>运行场景</h2>
          <div className="settings-actions">
            <button
              className="button"
              disabled={busy || config.scenarios.length >= 20}
              onClick={newScenario}
            >
              <Plus size={14} />
              新建场景
            </button>
            {scenario && (
              <button
                className="button"
                disabled={busy || config.scenarios.length >= 20}
                onClick={() =>
                  change((c) => {
                    const s = {
                      ...copy(scenario),
                      id: uid("scenario"),
                      name: `${scenario.name.slice(0, 50)} 副本`,
                    };
                    c.scenarios.push(s);
                    c.selectedScenario = s.id;
                  })
                }
              >
                <Copy size={14} />
                复制场景
              </button>
            )}
          </div>
        </div>
        <label className="form-field">
          选择场景
          <NativeSelect
            aria-label="选择场景"
            value={config.selectedScenario}
            onChange={(event) =>
              change((c) => {
                c.selectedScenario = event.target.value;
              })
            }
            size="sm"
          >
            {!scenario && (
              <NativeSelectOption value="">请选择场景</NativeSelectOption>
            )}
            {config.scenarios.map((s) => (
              <NativeSelectOption key={s.id} value={s.id}>
                {s.name || "未命名场景"}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        {scenario && (
          <>
            <div className="rule-grid">
              <label className="form-field">
                场景名称
                <input
                  aria-label="场景名称"
                  maxLength={60}
                  value={scenario.name}
                  onChange={(e) =>
                    patchScenario((s) => {
                      s.name = e.target.value;
                    })
                  }
                />
              </label>
              <label className="form-field">
                起始种子
                <input
                  aria-label="起始种子"
                  type="number"
                  min="0"
                  max={0xffffffff - scenario.seedCount + 1}
                  value={scenario.seedStart}
                  onChange={(e) =>
                    patchScenario((s) => {
                      s.seedStart = amount(
                        e.target.value,
                        0,
                        0xffffffff - s.seedCount + 1,
                      );
                    })
                  }
                />
              </label>
              <label className="form-field">
                实验种子数量
                <input
                  aria-label="实验种子数量"
                  type="number"
                  min="1"
                  max="12"
                  value={scenario.seedCount}
                  onChange={(e) =>
                    patchScenario((s) => {
                      s.seedCount = amount(e.target.value, 1, 12);
                      s.seedStart = Math.min(
                        s.seedStart,
                        0xffffffff - s.seedCount + 1,
                      );
                    })
                  }
                />
              </label>
              <label className="form-field">
                参与者
                <NativeSelect
                  aria-label="参与者数量"
                  value={scenario.participants.length}
                  onChange={(event) =>
                    patchScenario((s) => {
                      if (event.target.value === "2")
                        s.participants.push(initialPlayer(1));
                      else s.participants = s.participants.slice(0, 1);
                    })
                  }
                  size="sm"
                >
                  <NativeSelectOption value="1">
                    1 位 · 单人目标
                  </NativeSelectOption>
                  <NativeSelectOption value="2">
                    2 位 · 轮流竞争
                  </NativeSelectOption>
                </NativeSelect>
              </label>
            </div>
            <p className="hint">
              试运行使用种子 {scenario.seedStart}；实验使用 {scenario.seedStart}
              –{scenario.seedStart + scenario.seedCount - 1}
              。未覆盖的状态与能力使用模型初始值。
            </p>
            {scenario.participants.map((p, i) => (
              <details className="participant-editor" key={i} open={i === 0}>
                <summary>{p.name || `玩家 ${i + 1}`} · 初始条件与策略</summary>
                <div className="rule-grid">
                  <label className="form-field">
                    参与者名称
                    <input
                      aria-label={`参与者 ${i + 1} 名称`}
                      maxLength={60}
                      value={p.name}
                      onChange={(e) =>
                        patchScenario((s) => {
                          s.participants[i].name = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label className="form-field">
                    试运行策略
                    <NativeSelect
                      aria-label={`参与者 ${i + 1} 策略`}
                      value={p.strategyId}
                      onChange={(event) =>
                        patchScenario((s) => {
                          s.participants[i].strategyId = event.target.value;
                        })
                      }
                      size="sm"
                    >
                      {select(catalogue, p.strategyId)}
                    </NativeSelect>
                  </label>
                </div>
                <h3>初始状态</h3>
                <div className="initial-values">
                  {model.fields.map((f) => (
                    <div className="initial-value" key={f.id}>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          aria-label={`参与者 ${i + 1} 覆盖${f.name}`}
                          checked={Object.hasOwn(p.values, f.id)}
                          onChange={(e) =>
                            patchScenario((s) => {
                              if (e.target.checked)
                                s.participants[i].values[f.id] = f.initial;
                              else delete s.participants[i].values[f.id];
                            })
                          }
                        />
                        {f.name}
                      </label>
                      <input
                        aria-label={`参与者 ${i + 1} ${f.name}初始值`}
                        type="number"
                        min="0"
                        max="1000000"
                        value={
                          Object.hasOwn(p.values, f.id)
                            ? p.values[f.id]
                            : f.initial
                        }
                        disabled={!Object.hasOwn(p.values, f.id)}
                        onChange={(e) =>
                          patchScenario((s) => {
                            s.participants[i].values[f.id] = amount(
                              e.target.value,
                            );
                          })
                        }
                      />
                      <small>
                        {!Object.hasOwn(p.values, f.id)
                          ? "使用模型值"
                          : "场景覆盖"}
                      </small>
                    </div>
                  ))}
                </div>
                {!!model.capabilities.length && (
                  <>
                    <h3 className="section-gap">初始能力</h3>
                    <div className="rule-grid">
                      {model.capabilities.map((a) => (
                        <label className="form-field" key={a.id}>
                          {a.name}
                          <NativeSelect
                            aria-label={`参与者 ${i + 1} ${a.name}初始能力`}
                            value={
                              !Object.hasOwn(p.capabilities, a.id)
                                ? "inherit"
                                : String(p.capabilities[a.id])
                            }
                            onChange={(event) =>
                              patchScenario((s) => {
                                if (event.target.value === "inherit")
                                  delete s.participants[i].capabilities[a.id];
                                else
                                  s.participants[i].capabilities[a.id] =
                                    event.target.value === "true";
                              })
                            }
                            size="sm"
                          >
                            <NativeSelectOption value="inherit">
                              使用模型值 · {a.initial ? "拥有" : "未拥有"}
                            </NativeSelectOption>
                            <NativeSelectOption value="true">
                              初始拥有
                            </NativeSelectOption>
                            <NativeSelectOption value="false">
                              初始不拥有
                            </NativeSelectOption>
                          </NativeSelect>
                        </label>
                      ))}
                    </div>
                  </>
                )}
                {[
                  ...Object.keys(p.values).filter(
                    (id) => !model.fields.some((f) => f.id === id),
                  ),
                  ...Object.keys(p.capabilities).filter(
                    (id) => !model.capabilities.some((c) => c.id === id),
                  ),
                ].map((id) => (
                  <div className="form-error" key={id}>
                    已失效的初始定义：{id}
                    <button
                      className="text-button"
                      onClick={() =>
                        patchScenario((s) => {
                          delete s.participants[i].values[id];
                          delete s.participants[i].capabilities[id];
                        })
                      }
                    >
                      移除覆盖
                    </button>
                  </div>
                ))}
              </details>
            ))}
            <button
              className="text-button danger-text"
              onClick={() =>
                setDeleting(deleting === scenario.id ? "" : scenario.id)
              }
            >
              <Trash2 size={14} />
              删除场景
            </button>
            {deleting === scenario.id && (
              <div className="settings-confirm">
                <p>删除场景会自动保存，历史对局与实验保留原快照。</p>
                <button
                  className="button"
                  onClick={() => {
                    change((c) => {
                      c.scenarios = c.scenarios.filter(
                        (s) => s.id !== scenario.id,
                      );
                      c.selectedScenario = c.scenarios[0]?.id ?? "";
                    });
                    setDeleting("");
                  }}
                >
                  确认删除场景
                </button>
                <button className="text-button" onClick={() => setDeleting("")}>
                  取消
                </button>
              </div>
            )}
          </>
        )}
      </section>
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
                          s.rules[i].conditions[j].value = amount(
                            e.target.value,
                          );
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
      <section className="settings-section section-gap">
        <h2>实验对照</h2>
        <p className="hint">
          选择 1–4
          个策略，逐一用于场景中的第一位参与者。双人时，另一位参与者保持场景中指定的策略。各组使用相同的初始配置和种子范围。
        </p>
        <div className="compare-options">
          {catalogue.map((s) => (
            <label className="check-row" key={s.id}>
              <input
                type="checkbox"
                aria-label={`对照策略 ${s.name}`}
                checked={config.comparedStrategies.includes(s.id)}
                disabled={
                  !config.comparedStrategies.includes(s.id) &&
                  config.comparedStrategies.length >= 4
                }
                onChange={(e) =>
                  change((c) => {
                    c.comparedStrategies = e.target.checked
                      ? [...c.comparedStrategies, s.id]
                      : c.comparedStrategies.filter((id) => id !== s.id);
                  })
                }
              />
              {s.name || "未命名策略"}
            </label>
          ))}
        </div>
        {experimentError && (
          <p className="form-error">实验配置：{experimentError}</p>
        )}
        <p className="hint">
          实验在“实验记录”页启动，分别统计每位参与者及各目标的达成局数；固定先手顺序，结果包含位置影响。
        </p>
      </section>
      {runError && (
        <div className="form-error section-gap" role="alert">
          试运行配置：{runError}
        </div>
      )}
      <button
        className="button primary section-gap"
        disabled={busy || runDisabled || !!error || !!runError}
        onClick={run}
      >
        <Play size={16} />
        用此配置试运行
      </button>
    </section>
  );
}
