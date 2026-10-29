import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { Plus } from "lucide-react";
import { uid } from "../../shared/utils";
import { ValueInput } from "../components/ValueInput";
import { type NarrativeModel, type StoryVariable } from "../model";

export function VariablesView({
  model,
  update,
  setError,
}: {
  model: NarrativeModel;
  update(change: (model: NarrativeModel) => void): void;
  setError(message: string): void;
}) {
  function variableReferenced(id: string) {
    return model.nodes.some((n) =>
      n.choices.some((c) =>
        [...c.conditions, ...c.effects].some((r) => r.variable === id),
      ),
    );
  }

  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>状态变量</h1>
          <p>
            为选项条件和后果定义标记、数值或文本。已被引用的变量需先解除引用才能改类型或删除。
          </p>
        </div>
        <button
          className="button primary"
          disabled={model.variables.length >= 80}
          onClick={() =>
            update((m) => {
              m.variables.push({
                id: uid("variable"),
                name: "新标记",
                type: "boolean",
                initial: false,
              });
            })
          }
        >
          <Plus size={15} />
          添加变量
        </button>
      </div>
      {model.variables.map((v, index) => (
        <section className="settings-section" key={v.id}>
          <div className="story-variable-grid">
            <label className="form-field">
              变量名称
              <input
                aria-label={`变量 ${index + 1} 名称`}
                value={v.name}
                maxLength={300}
                onChange={(e) =>
                  update((m) => {
                    m.variables[index].name = e.target.value;
                  })
                }
              />
            </label>
            <label className="form-field">
              变量类型
              <NativeSelect
                aria-label={`变量 ${index + 1} 类型`}
                disabled={variableReferenced(v.id)}
                value={v.type}
                onChange={(event) =>
                  update((m) => {
                    const type = event.target.value as StoryVariable["type"];
                    m.variables[index].type = type;
                    m.variables[index].initial =
                      type === "boolean" ? false : type === "number" ? 0 : "";
                  })
                }
                size="sm"
              >
                <NativeSelectOption value="boolean">
                  是否标记
                </NativeSelectOption>
                <NativeSelectOption value="number">整数数值</NativeSelectOption>
                <NativeSelectOption value="text">文本</NativeSelectOption>
              </NativeSelect>
            </label>
            <label className="form-field">
              初始值
              <ValueInput
                label={`变量 ${index + 1} 初始值`}
                type={v.type}
                value={v.initial}
                change={(value) =>
                  update((m) => {
                    m.variables[index].initial = value;
                  })
                }
              />
            </label>
          </div>
          <button
            className="text-button danger-text"
            onClick={() => {
              if (variableReferenced(v.id)) {
                setError("变量正在被选项条件或后果引用，请先解除引用。");
                return;
              }
              update((m) => {
                m.variables.splice(index, 1);
              });
            }}
          >
            删除变量
          </button>
        </section>
      ))}
      {!model.variables.length && (
        <p className="hint">
          纯分支剧情不需要变量。出现条件选项或选择后果时再添加。
        </p>
      )}
    </section>
  );
}
