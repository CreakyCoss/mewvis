import "./styles.css";
import { useEffect, useRef, useState } from "react";
import { getApplicationDataClient } from "@isle/app-sdk/data";
import { getApplicationHost } from "@isle/app-sdk/browser";
import {
  createCourse,
  emptyProgress,
  restoreProgress,
  validateContent,
  type Course,
  type Progress,
} from "./course";
import { repository } from "./repository";
import { exampleCourse } from "./example";
import { Icon, Notice, Quiz, Text, Tutor, errorText } from "./components";
import { ProjectLab } from "./ProjectLab";
import { Studio } from "./Studio";

const repo = () => repository(getApplicationDataClient().storage);
type View = "library" | "studio" | "lesson";
export default function App() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState<Course | undefined>();
  const [view, setView] = useState<View>("library");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const [tab, setTab] = useState<"lesson" | "quiz" | "project">("lesson");
  const [showTutor, setShowTutor] = useState(true);
  const [theme, setTheme] = useState("light");
  const lock = useRef(false);
  const course = courses.find((c) => c.id === selected);
  const currentProgress = course
    ? (progress[course.id] ?? emptyProgress(course))
    : null;
  const lesson =
    course?.lessons.find((l) => l.id === currentProgress?.lessonId) ??
    course?.lessons[0];
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view, lesson?.id]);
  const load = async () => {
    setLoading(true);
    setLoadFailed(false);
    setError("");
    try {
      const result = await repo().list();
      const saved: Record<string, Progress> = {};
      for (const course of result.courses)
        saved[course.id] = await repo().progress(course);
      setCourses(result.courses);
      setProgress(saved);
      setWarnings(result.warnings);
    } catch (e) {
      setLoadFailed(true);
      setError(`读取课程失败：${errorText(e)}`);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const update = () =>
      setTheme(getApplicationHost().getHost()?.theme ?? "light");
    update();
    window.addEventListener("isle:theme", update);
    return () => window.removeEventListener("isle:theme", update);
  }, []);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const open = (course: Course) => {
    setSelected(course.id);
    setView("lesson");
    setTab("lesson");
    setError("");
  };
  const save = async (course: Course) => {
    await repo().save(course);
    setCourses((current) => [
      course,
      ...current.filter((c) => c.id !== course.id),
    ]);
    setProgress((current) => ({
      ...current,
      [course.id]: restoreProgress(course, current[course.id]),
    }));
  };
  const updateProgress = async (next: Progress) => {
    if (!course) return;
    await repo().saveProgress(course, next);
    setProgress((current) => ({ ...current, [course.id]: next }));
  };
  const jump = (id: string) =>
    void run(async () => {
      if (!currentProgress) return;
      await updateProgress({ ...currentProgress, lessonId: id });
      setTab("lesson");
    });
  const totalCompleted = Object.values(progress).reduce(
    (n, p) => n + p.completed.length,
    0,
  );
  const filtered = courses.filter((c) =>
    `${c.title} ${c.description}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className={`learning-app theme-${theme}`}>
      <nav className="learn-nav" aria-label="学习工作台导航">
        <button
          className="learn-brand"
          onClick={() => setView("library")}
          aria-label="学习工作台首页"
        >
          <span className="learn-brand-icon">
            <Icon name="book" size={22} />
          </span>
          <span>
            学习工作台<small>ISLE LEARNING</small>
          </span>
        </button>
        <div className="learn-nav-links">
          <button
            className={view !== "studio" ? "active" : ""}
            onClick={() => setView("library")}
          >
            <Icon name="book" size={17} />
            我的课程
          </button>
          <button
            className={view === "studio" ? "active" : ""}
            disabled={loading || loadFailed}
            onClick={() => {
              setEditing(undefined);
              setView("studio");
            }}
          >
            <Icon name="plus" size={17} />
            创建课程
          </button>
        </div>
        <span className="learn-nav-note">每天一点，学有所获</span>
      </nav>
      <main className={`learn-main ${view === "lesson" ? "is-lesson" : ""}`}>
        {error && (
          <Notice>
            {error}
            <button className="learn-inline-button" onClick={() => void load()}>
              重新读取
            </button>
          </Notice>
        )}
        {!!warnings.length && (
          <details className="learn-notice warning">
            <summary>{warnings.length} 门课程无法读取，原始数据已保留</summary>
            {warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </details>
        )}
        {loading ? (
          <div className="learn-loading" role="status">
            <span className="learn-loader" />
            正在打开你的学习空间…
          </div>
        ) : loadFailed ? (
          <div className="learn-empty">
            <h2>暂时无法打开课程库</h2>
            <p>请检查应用连接后重新读取。现有课程不会被覆盖。</p>
            <button className="learn-button" onClick={() => void load()}>
              重试读取课程
            </button>
          </div>
        ) : view === "studio" ? (
          <Studio initialCourse={editing} onSave={save} onSaved={open} />
        ) : view === "lesson" && course && lesson && currentProgress ? (
          <>
            <div className="learn-course-top">
              <button
                className="learn-button text"
                onClick={() => setView("library")}
              >
                <Icon name="back" size={16} />
                课程库
              </button>
              <span>{course.title}</span>
              <button
                className="learn-button"
                disabled={busy}
                onClick={() => {
                  setEditing(course);
                  setView("studio");
                }}
              >
                编辑 / 重新生成
              </button>
              {tab !== "project" && (
                <button
                  className="learn-button"
                  onClick={() => setShowTutor(!showTutor)}
                  aria-expanded={showTutor}
                >
                  {showTutor ? "收起导师" : "打开导师"}
                </button>
              )}
            </div>
            <div
              className={`learn-classroom ${showTutor && tab !== "project" ? "with-tutor" : ""}`}
            >
              <aside className="learn-outline" aria-label="课程目录">
                <span className="learn-eyebrow">COURSE OUTLINE</span>
                <h2>学习路线</h2>
                <p>
                  {currentProgress.completed.length} / {course.lessons.length}{" "}
                  课时已完成
                </p>
                <progress
                  max={course.lessons.length}
                  value={currentProgress.completed.length}
                  aria-label="课程完成进度"
                />
                <ol>
                  {course.lessons.map((item, i) => (
                    <li key={item.id}>
                      <button
                        disabled={busy}
                        className={item.id === lesson.id ? "active" : ""}
                        aria-current={
                          item.id === lesson.id ? "step" : undefined
                        }
                        onClick={() => jump(item.id)}
                      >
                        <span className="learn-step-number">
                          {currentProgress.completed.includes(item.id) ? (
                            <Icon name="check" size={15} />
                          ) : (
                            String(i + 1).padStart(2, "0")
                          )}
                        </span>
                        <span>
                          {item.title}
                          {currentProgress.completed.includes(item.id) && (
                            <small>已完成</small>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
                <div className="learn-outline-note">
                  按自己的节奏学习。读完一课，试着用自己的话解释一次。
                </div>
              </aside>
              <div className="learn-reading">
                <div className="learn-lesson-heading">
                  <span className="learn-eyebrow">
                    LESSON{" "}
                    {String(course.lessons.indexOf(lesson) + 1).padStart(
                      2,
                      "0",
                    )}{" "}
                    / {String(course.lessons.length).padStart(2, "0")}
                  </span>
                  <h1>{tab === "project" ? "课程项目实训" : lesson.title}</h1>
                  <p>{tab === "project" ? course.title : lesson.objective}</p>
                </div>
                <div
                  className="learn-tabs"
                  role="tablist"
                  aria-label="课时内容"
                >
                  <button
                    role="tab"
                    id="lesson-tab"
                    aria-controls="lesson-panel"
                    aria-selected={tab === "lesson"}
                    onClick={() => setTab("lesson")}
                  >
                    课程讲解
                  </button>
                  <button
                    role="tab"
                    id="quiz-tab"
                    aria-controls="lesson-panel"
                    aria-selected={tab === "quiz"}
                    onClick={() => setTab("quiz")}
                  >
                    课后测验<span>{lesson.questions.length}</span>
                  </button>
                  <button
                    role="tab"
                    id="project-tab"
                    aria-controls="lesson-panel"
                    aria-selected={tab === "project"}
                    onClick={() => setTab("project")}
                  >
                    项目实训
                  </button>
                </div>
                <div
                  id="lesson-panel"
                  role="tabpanel"
                  aria-labelledby={
                    tab === "lesson"
                      ? "lesson-tab"
                      : tab === "quiz"
                        ? "quiz-tab"
                        : "project-tab"
                  }
                >
                  {tab === "project" ? (
                    <ProjectLab key={course.id} course={course} />
                  ) : tab === "lesson" ? (
                    <article className="learn-article">
                      <Text value={lesson.content} />
                      <section className="learn-example">
                        <span className="learn-eyebrow">MAKE IT CONCRETE</span>
                        <h2>举个例子</h2>
                        <Text value={lesson.example} />
                      </section>
                      <section className="learn-takeaways">
                        <h2>带走这几个要点</h2>
                        <ul>
                          {lesson.takeaways.map((point, i) => (
                            <li key={i}>
                              <Icon name="check" size={17} />
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                      <div className="learn-actions">
                        <span className="learn-muted">
                          读懂了？试着检验一下。
                        </span>
                        <button
                          className="learn-button"
                          onClick={() => setTab("quiz")}
                        >
                          进入测验
                          <Icon name="arrow" size={16} />
                        </button>
                      </div>
                    </article>
                  ) : (
                    <Quiz
                      key={lesson.id}
                      lesson={lesson}
                      attempt={currentProgress.attempts[lesson.id]}
                      disabled={busy}
                      onSubmit={async (attempt) => {
                        if (lock.current)
                          throw new Error("正在保存，请稍后重试");
                        lock.current = true;
                        setBusy(true);
                        try {
                          await updateProgress({
                            ...currentProgress,
                            attempts: {
                              ...currentProgress.attempts,
                              [lesson.id]: attempt,
                            },
                          });
                        } finally {
                          lock.current = false;
                          setBusy(false);
                        }
                      }}
                    />
                  )}
                </div>
                {tab !== "project" && (
                  <footer className="learn-lesson-footer">
                    <span>
                      {currentProgress.completed.includes(lesson.id)
                        ? "本课已完成"
                        : "完成情况由你自己决定"}
                    </span>
                    <button
                      className="learn-button primary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const next =
                            course.lessons[course.lessons.indexOf(lesson) + 1];
                          await updateProgress({
                            ...currentProgress,
                            completed: [
                              ...new Set([
                                ...currentProgress.completed,
                                lesson.id,
                              ]),
                            ],
                            lessonId: next?.id ?? lesson.id,
                          });
                          setTab("lesson");
                        })
                      }
                    >
                      {busy
                        ? "保存中…"
                        : course.lessons.indexOf(lesson) <
                            course.lessons.length - 1
                          ? "完成本课，继续学习"
                          : currentProgress.completed.length ===
                              course.lessons.length
                            ? "已完成全部课程"
                            : "完成本课"}
                      <Icon name="check" size={17} />
                    </button>
                  </footer>
                )}
              </div>
              {showTutor && tab !== "project" && (
                <Tutor
                  key={`${course.id}:${lesson.id}`}
                  course={course}
                  lesson={lesson}
                />
              )}
            </div>
          </>
        ) : (
          <section className="learn-library">
            <div className="learn-page-heading">
              <div>
                <span className="learn-eyebrow">
                  YOUR PERSONAL LEARNING SPACE
                </span>
                <h1>把好奇，变成收获。</h1>
                <p>一个主题，一条学习路线。让每一次探索都有所积累。</p>
              </div>
              <button
                className="learn-button primary"
                onClick={() => {
                  setEditing(undefined);
                  setView("studio");
                }}
              >
                <Icon name="plus" size={18} />
                创建新课程
              </button>
            </div>
            <div className="learn-hero">
              <div>
                <span className="learn-chip">从这里开始 · 示例课程</span>
                <h2>
                  学会学习，
                  <br />
                  让知识真正留下来。
                </h2>
                <p>
                  从设定目标到主动回忆，
                  <br />
                  用三节短课，找到更适合自己的学习方法。
                </p>
                <button
                  className="learn-button hero-button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const existing = courses.find(
                        (c) => c.id === exampleCourse.id,
                      );
                      if (existing) {
                        open(existing);
                        return;
                      }
                      const demo = { ...exampleCourse, createdAt: Date.now() };
                      await save(demo);
                      open(demo);
                    })
                  }
                >
                  {busy
                    ? "正在打开…"
                    : courses.some((c) => c.id === exampleCourse.id)
                      ? "继续示例课程"
                      : "体验示例课程"}
                  <Icon name="arrow" size={18} />
                </button>
                <small>3 个课时 · 无需模型即可体验</small>
              </div>
              <div className="learn-hero-art" aria-hidden="true">
                <div className="learn-art-orbit" />
                <div className="learn-art-card back-card" />
                <div className="learn-art-card front-card">
                  <span>LEARN. REFLECT. GROW.</span>
                  <Icon name="book" size={66} />
                  <div className="learn-art-lines">
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="learn-art-bottom">
                    一小步，也算数。
                    <Icon name="check" size={20} />
                  </div>
                </div>
                <span className="learn-art-label">
                  <Icon name="spark" size={16} />
                  让理解发生
                </span>
              </div>
            </div>
            <div className="learn-library-heading">
              <div>
                <h2>
                  我的课程<span>{courses.length}</span>
                </h2>
                <p>
                  {totalCompleted
                    ? `已经完成 ${totalCompleted} 个课时，继续保持你的节奏。`
                    : "你的每一步进展，都会保存在这里。"}
                </p>
              </div>
              <div className="learn-library-controls">
                <input
                  aria-label="搜索课程"
                  type="search"
                  placeholder="搜索课程…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <label className="learn-file-button">
                  导入课程
                  <input
                    type="file"
                    accept=".json,application/json"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      void run(async () => {
                        if (file.size > 180_000)
                          throw new Error("课程文件不能超过 180 KB");
                        const imported = createCourse(
                          validateContent(JSON.parse(await file.text())),
                          "import",
                        );
                        await save(imported);
                        open(imported);
                      });
                    }}
                  />
                </label>
              </div>
            </div>
            {filtered.length ? (
              <div className="learn-course-grid">
                {filtered.map((item, index) => {
                  const done = progress[item.id]?.completed.length ?? 0;
                  return (
                    <article className="learn-course-card" key={item.id}>
                      <div className={`learn-card-cover cover-${index % 3}`}>
                        <Icon name="book" size={34} />
                        <span>
                          {item.origin === "example"
                            ? "示例课程"
                            : item.origin === "import"
                              ? "导入课程"
                              : "AI 生成"}
                        </span>
                        <b>
                          {String(item.lessons.length).padStart(2, "0")}
                          <small>课时</small>
                        </b>
                      </div>
                      <div className="learn-card-body">
                        <span className="learn-eyebrow">{item.level}</span>
                        <h3>{item.title}</h3>
                        <p>{item.description}</p>
                        <div className="learn-card-progress">
                          <span>
                            {done === item.lessons.length
                              ? "已完成"
                              : done
                                ? "学习中"
                                : "待开始"}
                          </span>
                          <span>
                            {done} / {item.lessons.length}
                          </span>
                        </div>
                        <progress
                          max={item.lessons.length}
                          value={done}
                          aria-label={`${item.title}学习进度`}
                        />
                        <div className="learn-actions">
                          <button
                            className="learn-button text"
                            onClick={() => open(item)}
                          >
                            {done ? "继续学习" : "开始学习"}
                            <Icon name="arrow" size={16} />
                          </button>
                          <button
                            className="learn-delete"
                            disabled={busy}
                            onClick={() => setConfirmDelete(item.id)}
                          >
                            移除
                          </button>
                        </div>
                        {confirmDelete === item.id && (
                          <div className="learn-delete-confirm">
                            <p>
                              移除此课程、学习进度与实训项目？聊天仍保留在历史中。
                            </p>
                            <button
                              className="learn-button danger"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await repo().remove(item.id);
                                  setCourses((all) =>
                                    all.filter((c) => c.id !== item.id),
                                  );
                                  setProgress((all) => {
                                    const next = { ...all };
                                    delete next[item.id];
                                    return next;
                                  });
                                  setConfirmDelete("");
                                })
                              }
                            >
                              确认移除
                            </button>
                            <button
                              className="learn-button"
                              onClick={() => setConfirmDelete("")}
                            >
                              取消
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="learn-empty">
                <span className="learn-empty-icon">
                  <Icon name="book" size={26} />
                </span>
                <h3>
                  {search ? "没有找到相关课程" : "你的下一次探索，从这里开始"}
                </h3>
                <p>
                  {search
                    ? "试试其他关键词，或清除搜索。"
                    : "创建一门专属课程，或从上方示例开始体验。"}
                </p>
                <button
                  className="learn-button"
                  onClick={() => {
                    if (search) setSearch("");
                    else {
                      setEditing(undefined);
                      setView("studio");
                    }
                  }}
                >
                  {search ? "清除搜索" : "创建第一门课程"}
                </button>
              </div>
            )}
            <footer className="learn-library-footer">
              <span>为理解而学，为好奇而来。</span>
              <span>课程与进度保存在应用中 · AI 内容请核对</span>
            </footer>
          </section>
        )}
      </main>
    </div>
  );
}
