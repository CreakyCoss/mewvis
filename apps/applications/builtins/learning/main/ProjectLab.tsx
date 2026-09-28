import { useEffect, useRef, useState } from "react";
import { getApplicationDataClient } from "@isle/app-sdk/data";
import type { Course } from "./course";
import { Notice, Text, errorText } from "./components";
import { ModelTask, createModelTask, closeModelTask } from "./ModelTask";
import {
  type Project,
  type ProjectPlan,
  type Milestone,
  type Review,
  createProject,
  validateProject,
  saveProject,
  projectKey,
  adoptPlan,
  submitMilestone,
  parseProjectReview,
  adoptProjectReview,
  projectProfile,
  projectReviewProfile,
  projectPrompt,
  projectReviewPrompt,
} from "./pbl";

function ReviewView({
  review,
  criteria,
}: {
  review: Review;
  criteria: Milestone["criteria"];
}) {
  return (
    <div className="learn-project-review">
      <Text value={review.summary} />
      <ul>
        {review.checks.map((c) => (
          <li key={c.criterionId}>
            <strong>
              {c.met ? "已满足" : "待改进"}：
              {criteria.find((item) => item.id === c.criterionId)?.description}
            </strong>
            <p>{c.feedback}</p>
          </li>
        ))}
      </ul>
      {review.suggestions.length > 0 && (
        <>
          <h4>修改建议</h4>
          <ul>
            {review.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
export function ProjectLab({
  course,
  mode,
}: {
  course: Course;
  mode: "design" | "learn";
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [planDraft, setPlanDraft] = useState<ProjectPlan | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const storage = () => getApplicationDataClient().storage;
  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const raw = await storage().getItem(projectKey(course.id));
      const next =
        raw === null ? createProject(course) : validateProject(raw, course.id);
      setProject(next);
      setPlanDraft(next.plan ?? null);
      setInput(next.progress[next.selected]?.draft ?? "");
    } catch (e) {
      setError(`读取实训失败，原记录保留：${errorText(e)}`);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const exclusive = async (action: () => Promise<void>) => {
    if (lock.current) throw new Error("正在保存，请稍后重试");
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const run = (action: () => Promise<void>) =>
    void exclusive(action).catch((e) => setError(errorText(e)));
  const persist = async (next: Project) => {
    const saved = await saveProject(storage(), next);
    setProject(saved);
    setPlanDraft(saved.plan ?? null);
    return saved;
  };
  const preparePlan = async () => {
    if (!project) return;
    const ref = await createModelTask(projectProfile);
    try {
      await persist({ ...project, generation: ref });
    } catch (e) {
      await closeModelTask(ref).catch(() => {});
      throw e;
    }
  };
  const milestone = project?.plan?.milestones.find(
    (s) => s.id === project.selected,
  );
  const stage = milestone && project?.progress[milestone.id];
  const withDraft = (): Project =>
    milestone && stage && project
      ? {
          ...project,
          progress: {
            ...project.progress,
            [milestone.id]: { ...stage, draft: input },
          },
        }
      : project!;
  const prepareReview = async () => {
    if (!project || !milestone || !stage?.submission) return;
    const ref = await createModelTask(projectReviewProfile);
    try {
      await persist({
        ...withDraft(),
        progress: {
          ...withDraft().progress,
          [milestone.id]: {
            ...stage,
            draft: input,
            submission: { ...stage.submission, reviewSession: ref },
          },
        },
      });
    } catch (e) {
      await closeModelTask(ref).catch(() => {});
      throw e;
    }
  };
  const courseChanged =
    project &&
    JSON.stringify(project.sourceLessons) !==
      JSON.stringify(
        course.lessons.map(({ id, title, objective }) => ({
          id,
          title,
          objective,
        })),
      );
  const hasSubmissions = Object.values(project?.progress ?? {}).some(
    (s) => !!s.submission,
  );
  const updatePlan = (next: ProjectPlan) => setPlanDraft(next);
  const updateMilestone = (id: string, change: Partial<Milestone>) => {
    if (!planDraft) return;
    updatePlan({
      ...planDraft,
      milestones: planDraft.milestones.map((s) =>
        s.id === id ? { ...s, ...change } : s,
      ),
    });
  };
  return (
    <section className="learn-project" aria-label="项目实训">
      <div className="learn-section-title">
        <div>
          <span className="learn-eyebrow">LEARN BY DOING</span>
          <h2>
            {mode === "design" ? "设计课程实训项目" : "把知识，用在一个项目里"}
          </h2>
        </div>
        <span className="learn-chip">PBL 文字实训</span>
      </div>
      {error && <Notice>{error}</Notice>}
      {notice && (
        <p role="status" className="learn-save-status">
          {notice}
        </p>
      )}
      {!project ? (
        <button
          className="learn-button"
          disabled={busy}
          onClick={() => void load()}
        >
          重新读取实训
        </button>
      ) : (
        <>
          {courseChanged && (
            <p className="learn-notice warning">
              课程内容已更新，此项目保留创建时的课程目标与已有成果。
            </p>
          )}
          {!project.plan ? (
            mode === "learn" ? (
              <div className="learn-project-empty">
                <h3>这门课程还没有实训项目</h3>
                <p>
                  请先在课程列表中打开「编辑课程」，到「项目实训」完成设计。
                </p>
              </div>
            ) : (
              <>
                <p className="learn-muted">
                  根据课程目标生成一个有明确角色、阶段任务和验收标准的项目。成果以文字或代码文本提交，不执行代码或访问外部文件。
                </p>
                {!project.generation ? (
                  <button
                    className="learn-button primary"
                    disabled={busy}
                    onClick={() => run(preparePlan)}
                  >
                    设计实训项目
                  </button>
                ) : (
                  <div inert={busy}>
                    <ModelTask
                      taskRef={project.generation}
                      title="设计项目计划"
                      prompt={projectPrompt(project)}
                      preview={(raw) => {
                        const plan = adoptPlan(project, raw).plan!;
                        return (
                          <>
                            <h3>{plan.title}</h3>
                            <p>{plan.scenario}</p>
                            <p>你的角色：{plan.role}</p>
                            <p>最终成果：{plan.outcome}</p>
                            <ol>
                              {plan.milestones.map((s) => (
                                <li key={s.id}>
                                  <strong>{s.title}</strong>
                                  <p>{s.goal}</p>
                                  <p>交付：{s.deliverable}</p>
                                  <ul>
                                    {s.criteria.map((c) => (
                                      <li key={c.id}>{c.description}</li>
                                    ))}
                                  </ul>
                                </li>
                              ))}
                            </ol>
                          </>
                        );
                      }}
                      onAccept={(raw) =>
                        exclusive(async () => {
                          await persist(adoptPlan(project, raw));
                          setInput("");
                        })
                      }
                      onRetryConnection={() => exclusive(preparePlan)}
                    />
                  </div>
                )}
              </>
            )
          ) : mode === "design" ? (
            <div className="learn-project-design">
              <p className="learn-muted">
                在这里设计和调整项目。学习者在课程学习页按阶段完成成果与评审。
              </p>
              {hasSubmissions && (
                <p className="learn-notice warning">
                  已有学习成果，项目计划已锁定，避免改变现有验收标准。
                </p>
              )}
              {planDraft && (
                <fieldset disabled={busy || hasSubmissions}>
                  <label>
                    项目标题
                    <input
                      maxLength={120}
                      value={planDraft.title}
                      onChange={(e) =>
                        updatePlan({ ...planDraft, title: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    项目情境
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={planDraft.scenario}
                      onChange={(e) =>
                        updatePlan({ ...planDraft, scenario: e.target.value })
                      }
                    />
                  </label>
                  <div className="learn-fields">
                    <label>
                      学习者角色
                      <input
                        maxLength={500}
                        value={planDraft.role}
                        onChange={(e) =>
                          updatePlan({ ...planDraft, role: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      最终成果
                      <input
                        maxLength={1000}
                        value={planDraft.outcome}
                        onChange={(e) =>
                          updatePlan({ ...planDraft, outcome: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <h3>实训阶段</h3>
                  {planDraft.milestones.map((s, i) => (
                    <section className="learn-project-design-stage" key={s.id}>
                      <h4>阶段 {i + 1}</h4>
                      <label>
                        阶段名称
                        <input
                          maxLength={120}
                          value={s.title}
                          onChange={(e) =>
                            updateMilestone(s.id, { title: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        阶段目标
                        <textarea
                          rows={2}
                          maxLength={1000}
                          value={s.goal}
                          onChange={(e) =>
                            updateMilestone(s.id, { goal: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        实践步骤（每行一步）
                        <textarea
                          rows={4}
                          value={s.steps.join("\n")}
                          onChange={(e) =>
                            updateMilestone(s.id, {
                              steps: e.target.value.split("\n").slice(0, 6),
                            })
                          }
                        />
                      </label>
                      <label>
                        需要提交
                        <input
                          maxLength={1000}
                          value={s.deliverable}
                          onChange={(e) =>
                            updateMilestone(s.id, {
                              deliverable: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        验收标准（每行一项）
                        <textarea
                          rows={3}
                          value={s.criteria
                            .map((c) => c.description)
                            .join("\n")}
                          onChange={(e) =>
                            updateMilestone(s.id, {
                              criteria: e.target.value
                                .split("\n")
                                .slice(0, 5)
                                .map((description, j) => ({
                                  id: `${s.id}-c${j + 1}`,
                                  description,
                                })),
                            })
                          }
                        />
                      </label>
                    </section>
                  ))}
                  <button
                    className="learn-button primary"
                    disabled={
                      busy ||
                      JSON.stringify(planDraft) === JSON.stringify(project.plan)
                    }
                    onClick={() =>
                      run(async () => {
                        await persist({ ...project, plan: planDraft });
                        setNotice("项目计划已保存");
                      })
                    }
                  >
                    保存项目计划
                  </button>
                </fieldset>
              )}
            </div>
          ) : (
            <>
              <div className="learn-project-context">
                <h3>{project.plan.title}</h3>
                <Text value={project.plan.scenario} />
                <p>
                  <strong>你的角色：</strong>
                  {project.plan.role}
                </p>
                <p>
                  <strong>最终成果：</strong>
                  {project.plan.outcome}
                </p>
              </div>
              <progress
                aria-label="实训完成进度"
                max={project.plan.milestones.length}
                value={
                  Object.values(project.progress).filter((p) => p.completed)
                    .length
                }
              />
              <p className="learn-muted">
                已完成{" "}
                {
                  Object.values(project.progress).filter((p) => p.completed)
                    .length
                }{" "}
                / {project.plan.milestones.length} 个阶段
              </p>
              <nav className="learn-project-stages" aria-label="实训阶段">
                {project.plan.milestones.map((s, i) => (
                  <button
                    key={s.id}
                    className={`learn-button ${project.selected === s.id ? "primary" : ""}`}
                    aria-current={
                      project.selected === s.id ? "step" : undefined
                    }
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const next = await persist({
                          ...withDraft(),
                          selected: s.id,
                        });
                        setInput(next.progress[s.id].draft);
                      })
                    }
                  >
                    {i + 1}. {s.title}
                    {project.progress[s.id].completed ? " ✓" : ""}
                  </button>
                ))}
              </nav>
              {milestone && stage && (
                <>
                  <section className="learn-project-brief">
                    <h3>{milestone.title}</h3>
                    <p>{milestone.goal}</p>
                    <h4>实践步骤</h4>
                    <ol>
                      {milestone.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                    <h4>需要提交</h4>
                    <p>{milestone.deliverable}</p>
                    <h4>验收标准</h4>
                    <ul>
                      {milestone.criteria.map((c) => (
                        <li key={c.id}>{c.description}</li>
                      ))}
                    </ul>
                  </section>
                  <label htmlFor="project-deliverable">
                    <strong>我的成果</strong> · 文字或代码，最多 6,000 字
                  </label>
                  <textarea
                    id="project-deliverable"
                    rows={9}
                    maxLength={6000}
                    disabled={busy}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      setNotice("");
                    }}
                    placeholder="写下你的方案、代码或分析。修改后保存草稿，完成后提交评审。"
                  />
                  <p className="learn-muted">
                    {input.length.toLocaleString()} / 6,000 字 ·{" "}
                    {input === stage.draft ? "草稿已保存" : "有未保存修改"}
                    。切换阶段会保存草稿；离开实训前请先保存。
                  </p>
                  <div className="learn-actions">
                    <button
                      className="learn-button"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await persist(withDraft());
                          setNotice("成果草稿已保存");
                        })
                      }
                    >
                      保存成果草稿
                    </button>
                    <button
                      className="learn-button primary"
                      disabled={
                        busy ||
                        !input.trim() ||
                        input.trim() === stage.submission?.text
                      }
                      onClick={() =>
                        run(async () => {
                          if (stage.submission?.reviewSession)
                            await closeModelTask(
                              stage.submission.reviewSession,
                            );
                          const next = await persist(
                            submitMilestone(project, milestone.id, input),
                          );
                          setInput(next.progress[milestone.id].draft);
                          setNotice("成果已提交，可以请求导师评审");
                        })
                      }
                    >
                      {stage.submission ? "提交修改后的成果" : "提交成果"}
                    </button>
                  </div>
                  {stage.submission && (
                    <>
                      <details className="learn-project-submitted">
                        <summary>
                          查看当前已提交版本 ·{" "}
                          {new Date(
                            stage.submission.submittedAt,
                          ).toLocaleString()}
                        </summary>
                        <Text value={stage.submission.text} />
                      </details>
                      {stage.submission.review && (
                        <>
                          <h4>已保存的导师评审</h4>
                          <ReviewView
                            review={stage.submission.review}
                            criteria={milestone.criteria}
                          />
                        </>
                      )}
                      <p className="learn-muted">
                        评审会将项目说明、阶段要求和已提交成果发送给所选模型。AI
                        反馈供学习参考，代码只按文本评阅。
                      </p>
                      {!stage.submission.reviewSession ? (
                        <button
                          className="learn-button"
                          disabled={busy}
                          onClick={() => run(prepareReview)}
                        >
                          请求导师评审
                        </button>
                      ) : (
                        <details
                          className="learn-project-review-chat"
                          open={!stage.submission.review}
                        >
                          <summary>导师评审会话 · 可重试</summary>
                          <div inert={busy}>
                            <ModelTask
                              key={stage.submission.reviewSession.chatId}
                              taskRef={stage.submission.reviewSession}
                              title="评审阶段成果"
                              prompt={projectReviewPrompt(
                                project,
                                milestone.id,
                              )}
                              preview={(raw) => (
                                <ReviewView
                                  criteria={milestone.criteria}
                                  review={parseProjectReview(
                                    raw,
                                    project,
                                    milestone.id,
                                  )}
                                />
                              )}
                              onAccept={(raw) =>
                                exclusive(async () => {
                                  await persist(
                                    adoptProjectReview(
                                      withDraft(),
                                      milestone.id,
                                      raw,
                                    ),
                                  );
                                  setNotice("导师评审已保存");
                                })
                              }
                              onRetryConnection={() => exclusive(prepareReview)}
                            />
                          </div>
                        </details>
                      )}
                      <div className="learn-actions">
                        <span className="learn-muted">
                          {stage.completed
                            ? "本阶段已完成"
                            : "逐项验收通过后，可确认完成本阶段"}
                        </span>
                        <button
                          className="learn-button"
                          disabled={
                            busy ||
                            stage.completed ||
                            input.trim() !== stage.submission.text ||
                            !stage.submission.review?.checks.every((c) => c.met)
                          }
                          onClick={() =>
                            run(async () => {
                              await persist({
                                ...withDraft(),
                                progress: {
                                  ...withDraft().progress,
                                  [milestone.id]: {
                                    ...stage,
                                    draft: input,
                                    completed: true,
                                  },
                                },
                              });
                              setNotice("阶段完成状态已保存");
                            })
                          }
                        >
                          标记阶段完成
                        </button>
                      </div>
                      <p className="learn-muted">
                        重新提交将替换本阶段的提交版本，并清除旧评审和完成标记；其他阶段保留。
                      </p>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
