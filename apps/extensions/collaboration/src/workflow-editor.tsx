import { useEffect, useRef, useState } from "react";
import type { Role } from "./roles";
import { avatarSource } from "./roles/avatars";
import type { Workflow } from "./workflows";
import { StepEditor } from "./step-editor";
const id = () => `s${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
export function WorkflowEditor({
  flow,
  roles,
  onChange,
}: {
  flow: Workflow;
  roles: Role[];
  onChange(value: Partial<Workflow>): void;
}) {
  const [selectedId, select] = useState(flow.steps[0]?.id);
  const active =
    flow.steps.find((step) => step.id === selectedId) ?? flow.steps[0];
  const index = active ? flow.steps.indexOf(active) : -1;
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    selectedButton.current?.scrollIntoView({ block: "nearest" });
  }, [active?.id]);
  const move = (delta: number) => {
    const steps = [...flow.steps],
      target = index + delta;
    if (index < 0 || target < 0 || target >= steps.length) return;
    [steps[index], steps[target]] = [steps[target], steps[index]];
    onChange({ steps });
  };
  const add = () => {
    const step = {
      id: id(),
      name: "",
      roleId: roles.length === 1 ? roles[0].id : "",
      instruction: "",
      input: "previous" as const,
    };
    onChange({ steps: [...flow.steps, step] });
    select(step.id);
  };
  return (
    <>
      <div className="flow-basics">
        <label>
          流程名称
          <input
            autoFocus
            maxLength={64}
            value={flow.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="例如：方案设计与评审"
          />
        </label>
        <label>
          适用场景
          <textarea
            rows={2}
            maxLength={2000}
            value={flow.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="什么任务适合使用这个流程？"
          />
        </label>
      </div>
      <div className="workflow-builder">
        <aside className="step-navigation" aria-label="流程步骤">
          <div className="section-heading">
            <h3>步骤</h3>
            <span className="meta">{flow.steps.length} / 32</span>
          </div>
          <ol>
            {flow.steps.map((step, order) => {
              const role = roles.find((role) => role.id === step.roleId);
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    className="step-nav-item"
                    ref={active?.id === step.id ? selectedButton : undefined}
                    aria-current={active?.id === step.id ? "step" : undefined}
                    onClick={() => select(step.id)}
                  >
                    <span className="step-number">{order + 1}</span>
                    <span className="step-nav-copy">
                      <strong>{step.name || "未命名步骤"}</strong>
                      <span className="meta">
                        {role && (
                          <img
                            width={16}
                            height={16}
                            src={avatarSource(role.avatar)}
                            alt=""
                          />
                        )}
                        {role?.name || "待选择角色"}
                      </span>
                      {(!step.name.trim() || !role) && (
                        <span className="incomplete">待完善</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <button
            className="add-step"
            disabled={!roles.length || flow.steps.length >= 32}
            onClick={add}
          >
            添加步骤
          </button>
          <p className="meta">按从上到下的顺序执行</p>
        </aside>
        <section className="step-detail" aria-label="当前步骤">
          {active ? (
            <>
              <div className="step-detail-heading">
                <div>
                  <span className="eyebrow">步骤 {index + 1}</span>
                  <h3>{active.name || "设置这一步的任务"}</h3>
                </div>
                <div className="step-actions">
                  <button
                    disabled={index === 0}
                    onClick={() => move(-1)}
                    aria-label="上移步骤"
                  >
                    上移
                  </button>
                  <button
                    disabled={index === flow.steps.length - 1}
                    onClick={() => move(1)}
                    aria-label="下移步骤"
                  >
                    下移
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      onChange({
                        steps: flow.steps.filter(
                          (step) => step.id !== active.id,
                        ),
                      });
                      select(
                        flow.steps[index + 1]?.id ?? flow.steps[index - 1]?.id,
                      );
                    }}
                  >
                    移除
                  </button>
                </div>
              </div>
              <StepEditor
                key={active.id}
                step={active}
                roles={roles}
                onChange={(value) =>
                  onChange({
                    steps: flow.steps.map((step) =>
                      step.id === active.id ? { ...step, ...value } : step,
                    ),
                  })
                }
              />
            </>
          ) : (
            <div className="empty-state">
              <h3>添加第一个步骤</h3>
              <p className="meta">选择执行角色，写下它需要完成的任务。</p>
              <button disabled={!roles.length} onClick={add}>
                添加步骤
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
