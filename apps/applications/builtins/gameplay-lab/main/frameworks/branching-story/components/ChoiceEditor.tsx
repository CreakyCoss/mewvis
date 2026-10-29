import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { copy } from "../../../shared/utils";
import {
  type NarrativeModel,
  type StoryChoice,
  type StoryCondition,
  type StoryEffect,
} from "../model";
import { operations } from "./labels";
import { ValueInput } from "./ValueInput";
export function ChoiceEditor({
  choice,
  index,
  model,
  change,
  remove,
}: {
  choice: StoryChoice;
  index: number;
  model: NarrativeModel;
  change(change: (choice: StoryChoice) => void): void;
  remove(): void;
}) {
  const first = model.variables[0];
  function ruleItem(
    rule: StoryCondition | StoryEffect,
    i: number,
    kind: "conditions" | "effects",
  ) {
    const variable = model.variables.find((v) => v.id === rule.variable),
      condition = kind === "conditions",
      c = rule as StoryCondition,
      e = rule as StoryEffect;
    const prefix = `选项 ${index + 1} ${condition ? "条件" : "后果"} ${i + 1}`;
    return (
      <div className="story-rule-row" key={i}>
        <NativeSelect
          aria-label={`${prefix} 变量`}
          value={rule.variable}
          onChange={(event) =>
            change((choice) => {
              const v = model.variables.find(
                (v) => v.id === event.target.value,
              )!;
              const r = choice[kind][i];
              r.variable = v.id;
              r.value = copy(v.initial);
              if ("op" in r) r.op = "eq";
              else r.operation = "set";
            })
          }
          size="sm"
        >
          {!variable && (
            <NativeSelectOption value={rule.variable}>
              缺失变量
            </NativeSelectOption>
          )}
          {model.variables.map((v) => (
            <NativeSelectOption key={v.id} value={v.id}>
              {v.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {condition ? (
          <NativeSelect
            aria-label={`${prefix} 比较`}
            value={c.op}
            onChange={(event) =>
              change((choice) => {
                choice.conditions[i].op = event.target
                  .value as StoryCondition["op"];
              })
            }
            size="sm"
          >
            {Object.entries(operations)
              .filter(
                ([op]) =>
                  variable?.type === "number" || ["eq", "neq"].includes(op),
              )
              .map(([op, name]) => (
                <NativeSelectOption key={op} value={op}>
                  {name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        ) : (
          <NativeSelect
            aria-label={`${prefix} 操作`}
            value={e.operation}
            onChange={(event) =>
              change((choice) => {
                choice.effects[i].operation = event.target
                  .value as StoryEffect["operation"];
              })
            }
            size="sm"
          >
            <NativeSelectOption value="set">设置为</NativeSelectOption>
            {variable?.type === "number" && (
              <NativeSelectOption value="add">增加 / 减少</NativeSelectOption>
            )}
          </NativeSelect>
        )}
        <ValueInput
          label={`${prefix} 值`}
          type={variable?.type ?? "text"}
          value={rule.value}
          change={(value) =>
            change((choice) => {
              choice[kind][i].value = value;
            })
          }
        />
        <button
          className="text-button danger-text"
          aria-label={`移除${prefix}`}
          onClick={() =>
            change((choice) => {
              choice[kind].splice(i, 1);
            })
          }
        >
          移除
        </button>
      </div>
    );
  }
  return (
    <section
      className="story-choice-editor"
      aria-label={`选项 ${index + 1}`}
      data-content-key={`choice:${choice.id}`}
      tabIndex={-1}
    >
      <div className="section-title">
        <h3>选项 {index + 1}</h3>
        <button className="text-button danger-text" onClick={remove}>
          移除选项
        </button>
      </div>
      <label className="form-field">
        选项文字
        <input
          aria-label={`选项 ${index + 1} 文字`}
          value={choice.label}
          maxLength={300}
          onChange={(e) =>
            change((c) => {
              c.label = e.target.value;
            })
          }
        />
      </label>
      <label className="form-field">
        前往剧情
        <NativeSelect
          aria-label={`选项 ${index + 1} 目标`}
          value={choice.target}
          onChange={(event) =>
            change((c) => {
              c.target = event.target.value;
            })
          }
          size="sm"
        >
          <NativeSelectOption value="">请选择目标剧情</NativeSelectOption>
          {model.nodes.map((n) => (
            <NativeSelectOption key={n.id} value={n.id}>
              {n.title}
              {n.ending ? " · 结局" : ""}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <h3>可选条件 · 全部满足</h3>
      {choice.conditions.map((r, i) => ruleItem(r, i, "conditions"))}
      <button
        className="text-button"
        disabled={!first || choice.conditions.length >= 20}
        onClick={() =>
          change((c) => {
            c.conditions.push({
              variable: first!.id,
              op: "eq",
              value: copy(first!.initial),
            });
          })
        }
      >
        添加条件
      </button>
      <h3>选择后的状态变化 · 按顺序执行</h3>
      {choice.effects.map((r, i) => ruleItem(r, i, "effects"))}
      <button
        className="text-button"
        disabled={!first || choice.effects.length >= 20}
        onClick={() =>
          change((c) => {
            c.effects.push({
              variable: first!.id,
              operation: "set",
              value: copy(first!.initial),
            });
          })
        }
      >
        添加后果
      </button>
      {!first && (
        <p className="hint">需要条件或后果时，先在“状态变量”定义标记或数值。</p>
      )}
    </section>
  );
}
