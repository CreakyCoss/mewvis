import "./styles.css";
import { useEffect, useRef, useState } from "react";
import { getApplicationDataClient } from "@isle/app-sdk/data";
import { getApplicationHost, writeClipboardText } from "@isle/app-sdk/browser";
import {
  createCourse,
  emptyProgress,
  recordAttempt,
  restoreProgress,
  validateContent,
  type Course,
  type Progress,
} from "./course";
import { repository } from "./repository";
import { clearOldChats } from "./clearOldChats";
import { exampleCourse } from "./example";
import {
  Icon,
  Notice,
  Quiz,
  Text,
  Tutor,
  errorText,
  type FocusTarget,
} from "./components";
import { RecallCards } from "./RecallCards";
import { ProjectLab } from "./ProjectLab";
import { CourseDialog } from "./CourseDialog";
import { type CourseEntry, type Draft } from "./workflow";

const repo = () => repository(getApplicationDataClient().storage);
const entryId = (item: CourseEntry) =>
  item.status === "stashed" ? item.courseId : item.id;
const entryTitle = (item: CourseEntry) =>
  item.status === "stashed"
    ? (item.outline?.title ?? item.brief.topic)
    : item.title;
const entryDescription = (item: CourseEntry) =>
  item.status === "stashed"
    ? (item.outline?.description ?? "课程内容待完成")
    : item.description;
type View = "library" | "lesson";
export default function App() {
  const [courses, setCourses] = useState<CourseEntry[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState<CourseEntry | undefined>();
  const [view, setView] = useState<View>("library");
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const [copiedCourse, setCopiedCourse] = useState("");
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [tab, setTab] = useState<"lesson" | "quiz" | "project">("lesson");
  const [tutorExpanded, setTutorExpanded] = useState(false);
  const [theme, setTheme] = useState("light");
  const lock = useRef(false);
  const initialization = useRef<Promise<void> | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const selectedEntry = courses.find((c) => entryId(c) === selected);
  const course = selectedEntry?.status === "ready" ? selectedEntry : undefined;
  const currentProgress = course
    ? (progress[course.id] ?? emptyProgress(course))
    : null;
  const lesson =
    course?.lessons.find((l) => l.id === currentProgress?.lessonId) ??
    course?.lessons[0];
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [view, lesson?.id]);
  useEffect(() => {
    if (view !== "lesson" || !focus) return;
    const target = document.getElementById(
      focus === "quiz" ? "quiz-tab" : `learning-focus-${focus}`,
    );
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [view, tab, focus, lesson?.id]);
  const load = async () => {
    setLoading(true);
    setLoadFailed(false);
    setError("");
    try {
      if (!initialization.current)
        initialization.current = repo()
          .initialize(clearOldChats)
          .catch((error) => {
            initialization.current = null;
            throw error;
          });
      await initialization.current;
      const courses = await repo().list();
      const saved: Record<string, Progress> = {};
      for (const course of courses)
        if (course.status === "ready")
          saved[course.id] = await repo().progress(course);
      setCourses(courses);
      setProgress(saved);
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
    setTutorExpanded(false);
    setFocus(null);
    setError("");
  };
  const edit = (item: CourseEntry) => {
    setEditing(item);
    setCreateOpen(true);
  };
  const saveDraft = async (draft: Draft): Promise<Draft> => {
    const saved = await repo().saveDraft(draft);
    setCourses((current) => [
      saved,
      ...current.filter((item) => entryId(item) !== saved.courseId),
    ]);
    return saved;
  };
  const save = async (course: Course) => {
    await repo().save(course);
    const storedProgress = await repo().progress(course);
    setCourses((current) => [
      course,
      ...current.filter((c) => entryId(c) !== course.id),
    ]);
    setProgress((current) => ({
      ...current,
      [course.id]: restoreProgress(
        course,
        current[course.id] ?? storedProgress,
      ),
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
      setFocus(null);
    });
  const totalCompleted = Object.values(progress).reduce(
    (n, p) => n + p.completed.length,
    0,
  );
  const filtered = courses.filter((c) =>
    `${entryTitle(c)} ${entryDescription(c)}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const focusSection = (target: FocusTarget) => {
    setTutorExpanded(false);
    setTab(target === "quiz" ? "quiz" : "lesson");
    setFocus(target);
  };

  return (
    <div
      className={`learning-app theme-${theme} ${view === "lesson" ? "is-studying" : ""}`}
    >
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
            className={view === "library" ? "active" : ""}
            onClick={() => setView("library")}
          >
            <Icon name="book" size={17} />
            我的课程
          </button>
          <button
            disabled={loading || loadFailed}
            onClick={() => {
              setEditing(undefined);
              setCreateOpen(true);
            }}
          >
            <Icon name="plus" size={17} />
            创建课程
          </button>
        </div>
        {view === "library" && !loading && !loadFailed && (
          <span className="learn-nav-note">
            {courses.length} 门课程 · 已完成 {totalCompleted} 个课时
          </span>
        )}
      </nav>
      <main
        ref={mainRef}
        className={`learn-main ${view === "lesson" ? "is-lesson" : ""}`}
      >
        {error && (
          <Notice>
            {error}
            <button className="learn-inline-button" onClick={() => void load()}>
              重新读取
            </button>
          </Notice>
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
              <span className="learn-course-breadcrumb">{course.title}</span>
              {(course.projectEnabled || tab === "project") && (
                <button
                  className={`learn-button ${tab === "project" ? "primary" : ""}`}
                  onClick={() => {
                    setTab(tab === "project" ? "lesson" : "project");
                    setFocus(null);
                  }}
                >
                  {tab === "project" ? "返回课时" : "项目实训"}
                </button>
              )}
            </div>
            <div
              className={`learn-classroom with-tutor ${tab === "project" ? "is-project" : ""} ${tutorExpanded ? "mobile-tutor-expanded" : ""}`}
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
                  {tab === "project"
                    ? "实训进度与课时阅读分开记录。"
                    : currentProgress.completed.length === course.lessons.length
                      ? "课程已完成。可以回看讲解或重练测验。"
                      : `当前任务：阅读第 ${course.lessons.indexOf(lesson) + 1} 课，再完成练习。`}
                </div>
              </aside>
              <div className="learn-reading">
                <div
                  id="learning-focus-objective"
                  className={`learn-lesson-heading ${focus === "objective" ? "learn-focused" : ""}`}
                >
                  <span className="learn-eyebrow">
                    {tab === "project" ? (
                      "COURSE PROJECT"
                    ) : (
                      <>
                        LESSON{" "}
                        {String(course.lessons.indexOf(lesson) + 1).padStart(
                          2,
                          "0",
                        )}{" "}
                        / {String(course.lessons.length).padStart(2, "0")}
                      </>
                    )}
                  </span>
                  <h1>{tab === "project" ? "课程项目实训" : lesson.title}</h1>
                  <p>{tab === "project" ? course.title : lesson.objective}</p>
                </div>
                {tab !== "project" && (
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
                  </div>
                )}
                <div
                  id={tab === "project" ? "project-panel" : "lesson-panel"}
                  role={tab === "project" ? "region" : "tabpanel"}
                  aria-label={tab === "project" ? "课程项目实训" : undefined}
                  aria-labelledby={
                    tab === "lesson"
                      ? "lesson-tab"
                      : tab === "quiz"
                        ? "quiz-tab"
                        : undefined
                  }
                >
                  {tab === "project" ? (
                    <ProjectLab key={course.id} course={course} mode="learn" />
                  ) : tab === "lesson" ? (
                    <article className="learn-article">
                      <Text value={lesson.content} />
                      <section
                        id="learning-focus-example"
                        className={`learn-example ${focus === "example" ? "learn-focused" : ""}`}
                      >
                        <span className="learn-eyebrow">MAKE IT CONCRETE</span>
                        <h2>举个例子</h2>
                        <Text value={lesson.example} />
                      </section>
                      <section
                        id="learning-focus-takeaways"
                        className={`learn-takeaways ${focus === "takeaways" ? "learn-focused" : ""}`}
                      >
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
                      <div
                        id="learning-focus-recall"
                        className={focus === "recall" ? "learn-focused" : ""}
                      >
                        <RecallCards
                          key={lesson.id}
                          points={lesson.takeaways}
                        />
                      </div>
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
                      history={currentProgress.history[lesson.id] ?? []}
                      disabled={busy}
                      onSubmit={async (attempt) => {
                        if (lock.current)
                          throw new Error("正在保存，请稍后重试");
                        lock.current = true;
                        setBusy(true);
                        try {
                          await updateProgress(
                            recordAttempt(
                              course,
                              currentProgress,
                              lesson.id,
                              attempt,
                            ),
                          );
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
              <Tutor
                key={`${course.id}:${lesson.id}`}
                course={course}
                lesson={lesson}
                onFocus={focusSection}
                expanded={tutorExpanded}
                onToggleExpand={() => setTutorExpanded((value) => !value)}
              />
            </div>
          </>
        ) : (
          <section className="learn-library">
            <div className="learn-library-filter">
              <h1>课程列表</h1>
              <div className="learn-library-filter-actions">
                <label className="learn-file-button learn-button">
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
                <input
                  aria-label="搜索课程"
                  type="search"
                  placeholder="搜索课程…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            {filtered.length ? (
              <div className="learn-course-grid">
                {filtered.map((item) => {
                  if (item.status === "stashed")
                    return (
                      <article
                        className="learn-course-card"
                        key={item.courseId}
                      >
                        <div className="learn-card-body">
                          <div className="learn-card-meta">
                            <span>
                              <Icon name="book" size={16} />
                              {item.outline?.level ?? item.brief.level}
                            </span>
                            <span
                              className="learn-chip"
                              aria-label="课程状态：暂存"
                            >
                              暂存
                            </span>
                          </div>
                          <h3>{entryTitle(item)}</h3>
                          <p>{entryDescription(item)}</p>
                          <div className="learn-card-next">
                            <span>继续编辑</span>
                            <strong>
                              {item.creationStep === 0
                                ? "继续设置课程"
                                : !item.outline
                                  ? "继续规划课程大纲"
                                  : item.creationStep === 1
                                    ? "查看课程大纲"
                                    : item.creationStep === 3 &&
                                        item.outline.lessons.length > 0 &&
                                        item.outline.lessons.every(
                                          (slot) => slot.lesson,
                                        )
                                      ? "完成项目实训设置并保存"
                                      : `共 ${item.outline.lessons.length} 课时`}
                            </strong>
                          </div>
                          <div className="learn-card-actions">
                            <button
                              className="learn-button primary"
                              onClick={() => edit(item)}
                            >
                              继续编辑
                              <Icon name="arrow" size={16} />
                            </button>
                            <button
                              className="learn-button"
                              onClick={() => setConfirmDelete(item.courseId)}
                            >
                              移除课程
                            </button>
                          </div>
                          {confirmDelete === item.courseId && (
                            <div className="learn-delete-confirm">
                              <p>移除此暂存课程？</p>
                              <button
                                className="learn-button danger"
                                disabled={busy}
                                onClick={() =>
                                  void run(async () => {
                                    await repo().remove(item.courseId);
                                    setCourses((all) =>
                                      all.filter(
                                        (entry) =>
                                          entryId(entry) !== item.courseId,
                                      ),
                                    );
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
                  const done = progress[item.id]?.completed.length ?? 0;
                  const current = item.lessons.find(
                    (lesson) => lesson.id === progress[item.id]?.lessonId,
                  );
                  return (
                    <article className="learn-course-card" key={item.id}>
                      <div className="learn-card-body">
                        <div className="learn-card-meta">
                          <span>
                            <Icon name="book" size={16} />
                            {item.level}
                          </span>
                          <span>
                            {item.origin === "example"
                              ? "示例课程"
                              : item.origin === "import"
                                ? "导入课程"
                                : "AI 生成"}
                          </span>
                        </div>
                        <h3>{item.title}</h3>
                        <span
                          className="learn-chip"
                          aria-label="课程状态：已完成"
                        >
                          已完成
                        </span>
                        <p>{item.description}</p>
                        <div className="learn-card-next">
                          <span>
                            {done === item.lessons.length
                              ? "学习完成"
                              : "继续学习"}
                          </span>
                          <strong>
                            {done === item.lessons.length
                              ? "可回看讲解或重新练习"
                              : (current?.title ?? item.lessons[0].title)}
                          </strong>
                        </div>
                        <div className="learn-card-progress">
                          <span>
                            {done === item.lessons.length
                              ? "已完成"
                              : "课程进度"}
                          </span>
                          <span>
                            {done} / {item.lessons.length} 课
                          </span>
                        </div>
                        <progress
                          max={item.lessons.length}
                          value={done}
                          aria-label={`${item.title}学习进度`}
                        />
                        <div className="learn-card-actions">
                          <button
                            className="learn-button primary"
                            onClick={() => open(item)}
                          >
                            {done ? "继续学习" : "开始学习"}
                            <Icon name="arrow" size={16} />
                          </button>
                          <button
                            className="learn-button"
                            onClick={() => edit(item)}
                          >
                            编辑课程
                          </button>
                          <details className="learn-card-menu">
                            <summary aria-label={`更多课程操作：${item.title}`}>
                              更多
                            </summary>
                            <div className="learn-card-menu-content">
                              <button
                                disabled={busy}
                                onClick={() =>
                                  void run(async () => {
                                    await writeClipboardText(
                                      JSON.stringify(
                                        validateContent({
                                          title: item.title,
                                          description: item.description,
                                          level: item.level,
                                          outline: item.outline,
                                          lessons: item.lessons,
                                        }),
                                        null,
                                        2,
                                      ),
                                    );
                                    setCopiedCourse(item.id);
                                  })
                                }
                              >
                                {copiedCourse === item.id
                                  ? "已复制课程 JSON"
                                  : "复制课程 JSON"}
                              </button>
                              <button
                                disabled={busy}
                                onClick={() => setConfirmDelete(item.id)}
                              >
                                移除课程
                              </button>
                            </div>
                          </details>
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
                                    all.filter((c) => entryId(c) !== item.id),
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
                    : "先体验一门三课时的示例课程，也可以创建自己的学习路线。"}
                </p>
                {search ? (
                  <button
                    className="learn-button"
                    onClick={() => setSearch("")}
                  >
                    清除搜索
                  </button>
                ) : (
                  <div className="learn-empty-actions">
                    <button
                      className="learn-button primary"
                      onClick={() => {
                        setEditing(undefined);
                        setCreateOpen(true);
                      }}
                    >
                      创建第一门课程
                    </button>
                    <button
                      className="learn-button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const existing = courses.find(
                            (course) =>
                              course.status === "ready" &&
                              course.id === exampleCourse.id,
                          );
                          if (existing?.status === "ready") {
                            open(existing);
                            return;
                          }
                          const demo = {
                            ...exampleCourse,
                            createdAt: Date.now(),
                          };
                          await save(demo);
                          open(demo);
                        })
                      }
                    >
                      体验示例课程
                    </button>
                  </div>
                )}
                {!search && <small>示例课程无需模型即可学习</small>}
              </div>
            )}
            <footer className="learn-library-footer">
              <span>为理解而学，为好奇而来。</span>
              <span>课程与进度保存在应用中 · AI 内容请核对</span>
            </footer>
          </section>
        )}
      </main>
      {createOpen && (
        <CourseDialog
          key={editing ? entryId(editing) : "new"}
          initialCourse={editing}
          onClose={() => setCreateOpen(false)}
          onSave={save}
          onSaveDraft={saveDraft}
          onStashed={() => {
            setCreateOpen(false);
            setView("library");
          }}
          onSaved={(saved) => {
            setCreateOpen(false);
            setEditing(undefined);
            open(saved);
          }}
        />
      )}
    </div>
  );
}
