import { useState } from "react";
import type { Milestone, ProjectPlan } from "./pbl";

export function starterProjectPlan(topic: string): ProjectPlan {
  return {
    title: `${topic}综合实践`,
    scenario: "",
    role: "项目实践者",
    outcome: "",
    milestones: [1, 2].map((number) => ({
      id: `stage-${number}`,
      title: "",
      goal: "",
      steps: [""],
      deliverable: "",
      criteria: [{ id: `stage-${number}-c1`, description: "" }],
    })),
  };
}

export function ProjectDesigner({
  plan,
  onChange,
  locked = false,
}: {
  plan: ProjectPlan;
  onChange: (plan: ProjectPlan) => void;
  locked?: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(
    plan.milestones[0]?.id ?? null,
  );
  const updateStage = (id: string, patch: Partial<Milestone>) =>
    onChange({
      ...plan,
      milestones: plan.milestones.map((stage) =>
        stage.id === id ? { ...stage, ...patch } : stage,
      ),
    });
  return (
    <section className="learn-project-designer" aria-label="项目方案">
      {locked && (
        <p className="learn-notice warning">
          已有学习成果，项目方案已锁定，以保留原有验收标准。
        </p>
      )}
      <fieldset disabled={locked}>
        <h3>项目基础信息</h3>
        <div className="learn-project-base-grid">
          <label>
            项目名称
            <input
              maxLength={120}
              value={plan.title}
              onChange={(e) => onChange({ ...plan, title: e.target.value })}
            />
          </label>
          <label>
            学习者角色
            <input
              maxLength={500}
              value={plan.role}
              onChange={(e) => onChange({ ...plan, role: e.target.value })}
            />
          </label>
        </div>
        <label>
          项目情境
          <input
            maxLength={2000}
            value={plan.scenario}
            onChange={(e) => onChange({ ...plan, scenario: e.target.value })}
          />
        </label>
        <label>
          最终成果
          <input
            maxLength={1000}
            value={plan.outcome}
            onChange={(e) => onChange({ ...plan, outcome: e.target.value })}
          />
        </label>
        <div className="learn-project-stage-heading">
          <h3>实践阶段</h3>
          <button
            type="button"
            className="learn-button compact"
            disabled={plan.milestones.length >= 6}
            onClick={() => {
              const id = crypto.randomUUID();
              onChange({
                ...plan,
                milestones: [
                  ...plan.milestones,
                  {
                    id,
                    title: "",
                    goal: "",
                    steps: [""],
                    deliverable: "",
                    criteria: [{ id: crypto.randomUUID(), description: "" }],
                  },
                ],
              });
              setExpanded(id);
            }}
          >
            + 添加阶段
          </button>
        </div>
        <ol className="learn-project-stage-list">
          {plan.milestones.map((stage, index) => (
            <li key={stage.id} className={expanded === stage.id ? "expanded" : ""}>
              <button
                type="button"
                className="learn-project-stage-toggle"
                aria-expanded={expanded === stage.id}
                onClick={() =>
                  setExpanded(expanded === stage.id ? null : stage.id)
                }
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{stage.title || `阶段 ${index + 1}`}</strong>
                <span>{expanded === stage.id ? "收起" : "展开"}</span>
              </button>
              {expanded === stage.id && (
                <div className="learn-project-stage-fields">
                  <label>
                    阶段名称
                    <input
                      maxLength={120}
                      value={stage.title}
                      onChange={(e) =>
                        updateStage(stage.id, { title: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    阶段目标
                    <input
                      maxLength={1000}
                      value={stage.goal}
                      onChange={(e) =>
                        updateStage(stage.id, { goal: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    实践步骤（每行一步）
                    <textarea
                      rows={3}
                      value={stage.steps.join("\n")}
                      onChange={(e) =>
                        updateStage(stage.id, {
                          steps: e.target.value.split("\n").slice(0, 6),
                        })
                      }
                    />
                  </label>
                  <label>
                    交付物
                    <input
                      maxLength={1000}
                      value={stage.deliverable}
                      onChange={(e) =>
                        updateStage(stage.id, { deliverable: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    验收标准（每行一项）
                    <textarea
                      rows={3}
                      value={stage.criteria.map((item) => item.description).join("\n")}
                      onChange={(e) =>
                        updateStage(stage.id, {
                          criteria: e.target.value
                            .split("\n")
                            .slice(0, 5)
                            .map((description, i) => ({
                              id: stage.criteria[i]?.id ?? crypto.randomUUID(),
                              description,
                            })),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="learn-button text"
                    disabled={plan.milestones.length <= 2}
                    onClick={() => {
                      onChange({
                        ...plan,
                        milestones: plan.milestones.filter(
                          (item) => item.id !== stage.id,
                        ),
                      });
                      setExpanded(null);
                    }}
                  >
                    移除阶段
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      </fieldset>
    </section>
  );
}
