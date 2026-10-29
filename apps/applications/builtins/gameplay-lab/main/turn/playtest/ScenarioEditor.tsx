import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { Copy, Plus, Trash2 } from "lucide-react";
import { copy, uid } from "../../shared/utils";
import { type Model } from "../model";
import { amount } from "../rules/EffectsEditor";
import { allStrategies, initialPlayer, type PlaytestConfig } from "./config";
import { selectOptions as select } from "./options";
export function ScenarioEditor({
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
  const catalogue = allStrategies(config);
  const scenario = config.scenarios.find(
    (s) => s.id === config.selectedScenario,
  );
  const patchScenario = (work: (s: NonNullable<typeof scenario>) => void) =>
    change((c) => {
      const s = c.scenarios.find((s) => s.id === c.selectedScenario);
      if (s) work(s);
    });
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

  return (
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
            试运行使用种子 {scenario.seedStart}；实验使用 {scenario.seedStart}–
            {scenario.seedStart + scenario.seedCount - 1}
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
  );
}
