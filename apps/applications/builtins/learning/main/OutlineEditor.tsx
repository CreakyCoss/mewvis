import type { Brief } from "./course";
import type { Outline } from "./workflow";

export function emptyOutline(brief: Brief): Outline {
  return {
    title: brief.topic,
    level: brief.level,
    description: "",
    goal: "",
    phases: [{ title: "", summary: "" }],
    lessons: [],
  };
}

export function OutlineEditor({
  brief,
  outline,
  onChange,
}: {
  brief: Brief;
  outline: Outline | null;
  onChange: (outline: Outline) => void;
}) {
  const value = outline ?? emptyOutline(brief);
  const change = (patch: Partial<Outline>) => onChange({ ...value, ...patch });
  const goals = value.goal.split("\n");
  return (
    <section className="learn-course-outline" aria-label="课程大纲">
      <h2>课程大纲</h2>
      <div className="learn-outline-field">
        <label htmlFor="course-outline-description">课程简介</label>
        <textarea
          id="course-outline-description"
          rows={3}
          maxLength={1000}
          value={value.description}
          placeholder="简要介绍这门课程的学习内容"
          onChange={(event) => change({ description: event.target.value })}
        />
      </div>
      <div className="learn-outline-field">
        <div className="learn-outline-field-heading">
          <label>学习目标</label>
          <button
            type="button"
            className="learn-button text compact"
            disabled={goals.length >= 6}
            onClick={() => change({ goal: [...goals, ""].join("\n") })}
          >
            + 添加目标
          </button>
        </div>
        <ol className="learn-outline-edit-list">
          {goals.map((goal, index) => (
            <li key={index}>
              <span className="learn-outline-edit-number">{index + 1}</span>
              <input
                aria-label={`学习目标 ${index + 1}`}
                maxLength={500}
                value={goal}
                onChange={(event) =>
                  change({
                    goal: goals
                      .map((item, i) => (i === index ? event.target.value : item))
                      .join("\n"),
                  })
                }
              />
              {goals.length > 1 && (
                <button
                  type="button"
                  className="learn-button text"
                  aria-label={`移除学习目标 ${index + 1}`}
                  onClick={() =>
                    change({ goal: goals.filter((_, i) => i !== index).join("\n") })
                  }
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>
      <div className="learn-outline-field">
        <div className="learn-outline-field-heading">
          <label>学习路径</label>
          <button
            type="button"
            className="learn-button text compact"
            disabled={value.phases.length >= 6}
            onClick={() =>
              change({
                phases: [...value.phases, { title: "", summary: "" }],
              })
            }
          >
            + 添加阶段
          </button>
        </div>
        <ol className="learn-outline-edit-list is-phases">
          {value.phases.map((phase, index) => (
            <li key={index}>
              <span className="learn-outline-edit-number">{index + 1}</span>
              <div>
                <input
                  aria-label={`第 ${index + 1} 阶段名称`}
                  maxLength={120}
                  value={phase.title}
                  placeholder="阶段名称"
                  onChange={(event) =>
                    change({
                      phases: value.phases.map((item, i) =>
                        i === index ? { ...item, title: event.target.value } : item,
                      ),
                    })
                  }
                />
                <input
                  aria-label={`第 ${index + 1} 阶段说明`}
                  maxLength={500}
                  value={phase.summary}
                  placeholder="这个阶段的学习方向"
                  onChange={(event) =>
                    change({
                      phases: value.phases.map((item, i) =>
                        i === index
                          ? { ...item, summary: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </div>
              {value.phases.length > 1 && (
                <button
                  type="button"
                  className="learn-button text"
                  aria-label={`移除第 ${index + 1} 阶段`}
                  onClick={() =>
                    change({
                      phases: value.phases.filter((_, i) => i !== index),
                    })
                  }
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
