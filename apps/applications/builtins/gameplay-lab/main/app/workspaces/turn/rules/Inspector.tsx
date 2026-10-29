import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { CheckCircle2, ChevronRight, Plus, X } from "lucide-react";
import { useState } from "react";
import {
  edgesOf,
  fieldName,
  nodesOf,
  validateModel,
  type Action,
  type Model,
} from "../../../../domains/turn/model";
import { EffectsEditor } from "../../../../shared/turn/EffectsEditor";
import { DefinitionActions } from "./DefinitionActions";
import { KindIcon, kindNames } from "./Graph";

const amount = (value: string, min = 0) =>
  Math.min(1_000_000, Math.max(min, Math.round(Number(value) || 0)));
export function Inspector({
  model,
  selected,
  select,
  update,
  duplicate,
  remove,
  references = [],
  defaultAdvanced = false,
}: {
  model: Model;
  selected: string;
  select(id: string): void;
  duplicate(id: string): void;
  remove(id: string): void;
  references?: string[];
  defaultAdvanced?: boolean;
  update(change: (model: Model) => void): void;
}) {
  const nodes = nodesOf(model),
    node = nodes.find((n) => n.id === selected),
    action = model.actions.find((a) => a.id === selected);
  const [advanced, setAdvanced] = useState(
    defaultAdvanced || action?.effects.length === 0,
  );
  const issues = validateModel(model);
  if (!node)
    return (
      <aside className="lab-inspector">
        <div className="empty">
          <h2>选择一个定义</h2>
          <p>点击节点，编辑它的条件、数值和效果。</p>
        </div>
      </aside>
    );
  const patch = (change: (action: Action) => void) =>
    update((m) => change(m.actions.find((a) => a.id === selected)!));
  const fieldSelect = (
    value: string,
    change: (value: string) => void,
    label: string,
  ) => (
    <NativeSelect
      aria-label={label}
      value={value}
      onChange={(event) => change(event.target.value)}
      size="sm"
    >
      {model.fields.map((f) => (
        <NativeSelectOption key={f.id} value={f.id}>
          {f.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
  const nameField = (
    <label className="form-field">
      名称
      <input
        aria-label="定义名称"
        value={node.name}
        maxLength={60}
        onChange={(e) =>
          update((m) => {
            const item = [
              ...m.fields,
              ...m.capabilities,
              ...m.actions,
              ...m.goals,
            ].find((n) => n.id === selected)!;
            item.name = e.target.value;
          })
        }
      />
    </label>
  );
  const direct = new Set(
    edgesOf(model)
      .filter((e) => e.from === selected || (!action && e.to === selected))
      .flatMap((e) => [e.from, e.to]),
  );
  model.goals
    .filter((g) => direct.has(g.field))
    .forEach((g) => direct.add(g.id));
  const related = nodes.filter((n) => n.id !== selected && direct.has(n.id));
  return (
    <aside
      className="lab-inspector"
      aria-label="定义编辑器"
      data-content-key={`${node.kind}:${selected}`}
      tabIndex={-1}
    >
      <button
        className="text-button mobile-back"
        onClick={() =>
          document
            .querySelector(".model-workspace")
            ?.scrollIntoView({ block: "start" })
        }
      >
        返回模型定义
      </button>
      <div className={`inspector-kind kind-${node.kind}`}>
        <span className="node-icon">
          <KindIcon kind={node.kind} />
        </span>
        {kindNames[node.kind]}
      </div>
      <h2>{node.name}</h2>
      {action ? (
        <>
          <div className="quick-fields">
            {action.costs.map((c, i) => (
              <label key={i}>
                消耗{fieldName(model, c.field)}
                <input
                  aria-label={`消耗${fieldName(model, c.field)}`}
                  type="number"
                  min="0"
                  max="1000000"
                  value={c.value}
                  onChange={(e) =>
                    patch((a) => {
                      a.costs[i].value = amount(e.target.value);
                    })
                  }
                />
              </label>
            ))}
            <label>
              占用行动
              <input
                aria-label="占用行动"
                type="number"
                value={1}
                readOnly
                title="首版每次行动占用一次机会"
              />
            </label>
            {action.effects.map((e, i) =>
              e.type === "add" ? (
                <label key={i}>
                  增加{fieldName(model, e.field)}
                  <input
                    aria-label={`增加${fieldName(model, e.field)}`}
                    type="number"
                    min="0"
                    max="1000000"
                    value={e.value}
                    onChange={(event) =>
                      patch((a) => {
                        const effect = a.effects[i];
                        if (effect.type === "add")
                          effect.value = amount(event.target.value);
                      })
                    }
                  />
                </label>
              ) : (
                <p className="hint" key={i}>
                  {e.type === "grant"
                    ? `获得 ${model.capabilities.find((c) => c.id === e.capability)?.name}`
                    : "组合计分：基础值与同类奖励之和 × 倍率"}
                </p>
              ),
            )}
          </div>
          <details
            className="advanced-editor"
            open={advanced}
            onToggle={(e) => setAdvanced(e.currentTarget.open)}
          >
            <summary>高级规则</summary>
            {nameField}
            <h3>消耗与效果</h3>
            {action.costs.map((c, i) => (
              <div className="effect-row" key={i}>
                <div className="cost-name">
                  {fieldSelect(
                    c.field,
                    (id) =>
                      patch((a) => {
                        a.costs[i].field = id;
                      }),
                    `消耗状态 ${i + 1}`,
                  )}
                </div>
                <input
                  aria-label={`高级：消耗${fieldName(model, c.field)}`}
                  type="number"
                  min="0"
                  value={c.value}
                  onChange={(e) =>
                    patch((a) => {
                      a.costs[i].value = amount(e.target.value);
                    })
                  }
                />
                <button
                  className="icon-button"
                  aria-label={`移除消耗 ${i + 1}`}
                  onClick={() =>
                    patch((a) => {
                      a.costs.splice(i, 1);
                    })
                  }
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              className="text-button"
              disabled={!model.fields.length || action.costs.length >= 20}
              onClick={() =>
                patch((a) => {
                  if (model.fields.length)
                    a.costs.push({ field: model.fields[0].id, value: 1 });
                })
              }
            >
              <Plus size={14} />
              添加消耗
            </button>
            <EffectsEditor
              model={model}
              effects={action.effects}
              scoring
              label="行动效果"
              change={(effects) =>
                patch((a) => {
                  a.effects = effects;
                })
              }
            />
            <h3 className="section-gap">前置能力</h3>
            {model.capabilities.map((c) => (
              <label className="check-row" key={c.id}>
                <input
                  type="checkbox"
                  checked={action.requires.includes(c.id)}
                  disabled={
                    !action.requires.includes(c.id) &&
                    action.requires.length >= 20
                  }
                  onChange={(e) =>
                    patch((a) => {
                      a.requires = e.target.checked
                        ? [...a.requires, c.id]
                        : a.requires.filter((id) => id !== c.id);
                    })
                  }
                />
                {c.name}
              </label>
            ))}
          </details>
        </>
      ) : (
        nameField
      )}
      {node.kind === "state" &&
        (() => {
          const f = model.fields.find((f) => f.id === selected)!;
          return (
            <>
              <label className="form-field">
                初始值
                <input
                  aria-label="初始值"
                  type="number"
                  min="0"
                  value={f.initial}
                  onChange={(e) =>
                    update((m) => {
                      m.fields.find((f) => f.id === selected)!.initial = amount(
                        e.target.value,
                      );
                    })
                  }
                />
              </label>
              <label className="form-field">
                状态用途
                <NativeSelect
                  value={f.role}
                  onChange={(event) =>
                    update((m) => {
                      m.fields.find((f) => f.id === selected)!.role = event
                        .target.value as typeof f.role;
                    })
                  }
                  aria-label="状态用途"
                  size="sm"
                >
                  <NativeSelectOption value="stock">
                    库存 · 可消费
                  </NativeSelectOption>
                  <NativeSelectOption value="rate">
                    速率 · 产出能力
                  </NativeSelectOption>
                  <NativeSelectOption value="progress">
                    进度 · 目标指标
                  </NativeSelectOption>
                </NativeSelect>
              </label>
            </>
          );
        })()}
      {node.kind === "capability" && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={model.capabilities.find((c) => c.id === selected)!.initial}
            onChange={(e) =>
              update((m) => {
                m.capabilities.find((c) => c.id === selected)!.initial =
                  e.target.checked;
              })
            }
          />
          初始即可使用
        </label>
      )}
      {node.kind === "goal" &&
        (() => {
          const g = model.goals.find((g) => g.id === selected)!;
          return (
            <>
              <label className="form-field">
                目标指标
                {fieldSelect(
                  g.field,
                  (id) =>
                    update((m) => {
                      m.goals.find((g) => g.id === selected)!.field = id;
                    }),
                  "目标指标",
                )}
              </label>
              <label className="form-field">
                达成门槛
                <input
                  aria-label="达成门槛"
                  type="number"
                  min="1"
                  value={g.threshold}
                  onChange={(e) =>
                    update((m) => {
                      m.goals.find((g) => g.id === selected)!.threshold =
                        amount(e.target.value, 1);
                    })
                  }
                />
              </label>
              <p className="hint">行动和周期结算后检查，达到任一目标即结束。</p>
            </>
          );
        })()}
      <section className="inspector-section">
        <label className="form-field">
          说明
          <textarea
            aria-label="说明"
            rows={3}
            value={node.description}
            onChange={(e) =>
              update((m) => {
                const item = [
                  ...m.fields,
                  ...m.capabilities,
                  ...m.actions,
                  ...m.goals,
                ].find((n) => n.id === selected)!;
                item.description = e.target.value;
              })
            }
          />
        </label>
      </section>
      <section className="inspector-section">
        <h3>影响范围</h3>
        {related.slice(0, 4).map((n) => (
          <button
            key={n.id}
            className="related-row"
            onClick={() => select(n.id)}
          >
            <span className={`kind-${n.kind}`}>
              <KindIcon kind={n.kind} />
            </span>
            <span>{n.name}</span>
            <ChevronRight size={16} />
          </button>
        ))}
        {!related.length && <p className="hint">暂时没有关联定义。</p>}
      </section>
      <DefinitionActions
        key={selected}
        model={model}
        id={selected}
        extraReferences={references}
        duplicate={() => duplicate(selected)}
        remove={() => remove(selected)}
      />
      <div className={`validation-status ${issues.length ? "has-issues" : ""}`}>
        <CheckCircle2 size={29} />
        <div>
          <strong>
            {issues.length ? `${issues.length} 项待检查` : "结构校验通过"}
          </strong>
          <p>
            {issues.length
              ? "请查看工作台的问题提示。"
              : "运行时仍需满足当前行动条件。"}
          </p>
        </div>
      </div>
    </aside>
  );
}
