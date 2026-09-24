import type { Role } from "./roles";
import type { Step } from "./workflows";
export function StepEditor({
  step,
  roles,
  onChange,
}: {
  step: Step;
  roles: Role[];
  onChange(value: Partial<Step>): void;
}) {
  return (
    <div className="step-fields">
      <div className="grid">
        <label>
          步骤名称
          <input
            maxLength={64}
            value={step.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </label>
        <label>
          执行角色
          <select
            value={step.roleId}
            onChange={(e) => onChange({ roleId: e.target.value })}
          >
            <option value="">请选择角色</option>
            {step.roleId && !roles.some((r) => r.id === step.roleId) ? (
              <option value={step.roleId}>插件角色已删除</option>
            ) : null}
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name || "未命名角色"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        任务说明
        <textarea
          rows={5}
          maxLength={8000}
          value={step.instruction}
          onChange={(e) =>
            onChange({
              instruction: e.target.value,
            })
          }
          placeholder="这个角色在本步骤需要完成什么"
        />
      </label>
      <details className="advanced">
        <summary>
          上下文与结果判断{" "}
          <span className="meta">
            {step.judgment ? "已启用判断" : "按需配置"}
          </span>
        </summary>
        <div className="advanced-body">
          <label>
            前序结果
            <select
              value={step.input}
              onChange={(e) =>
                onChange({
                  input: e.target.value as Step["input"],
                })
              }
            >
              <option value="original">仅使用原始任务</option>
              <option value="previous">附加上一步结果</option>
              <option value="all">附加全部前序结果</option>
            </select>
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={Boolean(step.judgment)}
              onChange={(event) =>
                onChange({
                  judgment: event.target.checked
                    ? { question: "", output: { type: "boolean" } }
                    : undefined,
                })
              }
            />
            完成后判断结果
          </label>
          {step.judgment && (
            <div className="step">
              <label>
                判断问题
                <textarea
                  maxLength={4000}
                  value={step.judgment.question}
                  onChange={(event) =>
                    onChange({
                      judgment: {
                        ...step.judgment!,
                        question: event.target.value,
                      },
                    })
                  }
                  placeholder="例如：这份方案是否具备可以开始实施的条件？"
                />
              </label>
              <label>
                结果类型
                <select
                  value={step.judgment.output.type}
                  onChange={(event) => {
                    const type = event.target.value;
                    const output: NonNullable<Step["judgment"]>["output"] =
                      type === "choice"
                        ? { type, options: ["通过", "需要修改"] }
                        : type === "score"
                          ? {
                              type,
                              levels: ["不满足", "部分满足", "充分满足"],
                            }
                          : { type: "boolean" };
                    onChange({
                      judgment: { ...step.judgment!, output },
                    });
                  }}
                >
                  <option value="boolean">是 / 否</option>
                  <option value="choice">选择选项</option>
                  <option value="score">档位评分</option>
                </select>
              </label>
              {step.judgment.output.type !== "boolean" && (
                <label>
                  选项或档位（每行一个，评分从低到高）
                  <textarea
                    value={(step.judgment.output.type === "choice"
                      ? step.judgment.output.options
                      : step.judgment.output.levels
                    ).join("\n")}
                    onChange={(event) => {
                      const values = event.target.value.split("\n");
                      const output: NonNullable<Step["judgment"]>["output"] =
                        step.judgment!.output.type === "choice"
                          ? { type: "choice", options: values }
                          : { type: "score", levels: values };
                      onChange({
                        judgment: { ...step.judgment!, output },
                      });
                    }}
                  />
                </label>
              )}
              <small>
                判断材料为本步骤输出；标准由判断能力内部选择。判断结果会附加到本步骤结果，供后续步骤引用，不自动改变执行顺序。
              </small>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
