import "./styles.css";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Circle,
  MoreHorizontal,
  Pencil,
  Plus,
  Upload,
} from "lucide-react";
import { getApplicationDataClient } from "@isle/app-sdk/data";
import { getApplicationHost, writeClipboardText } from "@isle/app-sdk/browser";
import {
  createCourse,
  emptyProgress,
  recordAttempt,
  resetAttempt,
  restoreProgress,
  validateContent,
  type Attempt,
  type Course,
  type Progress,
} from "./course";
import { repository, upsertCourseEntry } from "./repository";
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
import { GradingPanel, MistakePanel, PracticeHistory } from "./StudyPanels";
import { assertCurrentReview } from "./study";
import { closeModelTask } from "./ModelTask";
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
  const [confirmDelete, setConfirmDelete] = useState("");
  const [confirmCompletion, setConfirmCompletion] = useState(false);
  const [copiedCourse, setCopiedCourse] = useState("");
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [tab, setTab] = useState<"lesson" | "quiz" | "project">("lesson");
  const [tutorExpanded, setTutorExpanded] = useState(false);
  const [retryRequest, setRetryRequest] = useState<{
    courseId: string;
    lessonId: string;
    ids: string[];
    nonce: number;
  } | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const [theme, setTheme] = useState("light");
  const lock = useRef(false);
  const initialization = useRef<Promise<void> | null>(null);
  const readingRef = useRef<HTMLDivElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const deleteReturnFocusRef = useRef<HTMLElement | null>(null);
  const selectedEntry = courses.find((c) => entryId(c) === selected);
  const course = selectedEntry?.status === "ready" ? selectedEntry : undefined;
  const currentProgress = course
    ? (progress[course.id] ?? emptyProgress(course))
    : null;
  const lesson =
    course?.lessons.find((l) => l.id === currentProgress?.lessonId) ??
    course?.lessons[0];
  const nextLesson =
    course && lesson
      ? course.lessons[course.lessons.indexOf(lesson) + 1]
      : undefined;
  const lessonCompleted =
    !!lesson && !!currentProgress?.completed.includes(lesson.id);
  useEffect(() => {
    setConfirmCompletion(false);
  }, [view, course?.id, lesson?.id, tab]);
  const deleteTarget = courses.find((item) => entryId(item) === confirmDelete);
  useEffect(() => {
    if (!confirmDelete) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    deleteCancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !lock.current) setConfirmDelete("");
      if (event.key !== "Tab") return;
      const buttons = Array.from(
        deleteDialogRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      );
      if (!buttons.length) {
        event.preventDefault();
        return;
      }
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (deleteReturnFocusRef.current?.isConnected)
        deleteReturnFocusRef.current.focus();
      else if (previous?.isConnected) previous.focus();
      else document.querySelector<HTMLElement>(".learn-nav-create")?.focus();
      deleteReturnFocusRef.current = null;
    };
  }, [confirmDelete]);
  useEffect(() => {
    if (view !== "lesson")
      window.scrollTo({ top: 0, behavior: "instant" });
  }, [view, lesson?.id]);
  useEffect(() => {
    if (view === "lesson")
      readingRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [view, lesson?.id, tab]);
  useEffect(() => {
    if (view !== "lesson" || !focus) return;
    const scroller = readingRef.current;
    const target = document.getElementById(
      focus === "quiz" ? "quiz-tab" : `learning-focus-${focus}`,
    );
    if (!scroller || !target || !scroller.contains(target)) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    scroller.scrollTo({
      top: scroller.scrollTop + targetRect.top - scrollerRect.top -
        (scroller.clientHeight - targetRect.height) / 2,
      behavior: "smooth",
    });
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
    setCourses((current) => upsertCourseEntry(current, saved));
    return saved;
  };
  const save = async (course: Course) => {
    await repo().save(course);
    const storedProgress = await repo().progress(course);
    setCourses((current) => upsertCourseEntry(current, course));
    setProgress((current) => ({
      ...current,
      [course.id]: restoreProgress(
        course,
        current[course.id] ?? storedProgress,
      ),
    }));
  };
  const removeCourse = async (item: CourseEntry) => {
    const id = entryId(item);
    await repo().remove(id);
    setCourses((all) => all.filter((entry) => entryId(entry) !== id));
    setProgress((all) => {
      const next = { ...all };
      delete next[id];
      return next;
    });
    if (selected === id) setSelected("");
    setConfirmDelete("");
  };
  const updateProgress = async (next: Progress) => {
    if (!course) return;
    await repo().saveProgress(course, next);
    progressRef.current = { ...progressRef.current, [course.id]: next };
    setProgress((current) => ({ ...current, [course.id]: next }));
  };
  const jump = (id: string) =>
    void run(async () => {
      if (!currentProgress) return;
      await updateProgress({ ...currentProgress, lessonId: id });
      setTab("lesson");
      setFocus(null);
    });
  const saveAttempt = async (attempt: Attempt, review = false) => {
    if (!course || !lesson) return;
    if (lock.current) throw new Error("正在保存，请稍后重试");
    lock.current = true;
    setBusy(true);
    try {
      const latest = progressRef.current[course.id] ?? emptyProgress(course);
      if (review) assertCurrentReview(latest.attempts[lesson.id], attempt);
      await updateProgress(recordAttempt(course, latest, lesson.id, attempt));
      if (!review) setRetryRequest(null);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const restartPractice = async () => {
    if (!course || !lesson) return;
    if (lock.current) throw new Error("正在保存，请稍后重试");
    lock.current = true;
    setBusy(true);
    try {
      const latest = progressRef.current[course.id] ?? emptyProgress(course);
      const previous = latest.attempts[lesson.id];
      await updateProgress(resetAttempt(course, latest, lesson.id));
      setRetryRequest(null);
      // Chat cleanup must never prevent archiving answers or starting fresh.
      if (previous?.gradingSession)
        void closeModelTask(previous.gradingSession).catch(() => {});
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const retryIds =
    retryRequest?.courseId === course?.id &&
    retryRequest?.lessonId === lesson?.id
      ? retryRequest?.ids
      : undefined;

  return (
    <div
      className={`learning-app theme-${theme} ${view === "lesson" ? "is-studying" : "is-library"}`}
    >
      {view === "library" && (
        <nav className="learn-nav" aria-label="学习工作台导航">
          <button
            className="learn-brand"
            onClick={() => setView("library")}
            aria-label="学习工作台首页"
          >
            <span className="learn-brand-icon">
              <BookOpen size={30} strokeWidth={2.1} aria-hidden="true" />
            </span>
            <span>
              学习工作台<small>ISLE LEARNING</small>
            </span>
          </button>
          <div className="learn-nav-links">
            <label className="learn-nav-import">
              <Upload size={17} aria-hidden="true" />
              导入课程
              <input
                type="file"
                accept=".json,application/json"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
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
            <button
              className="learn-nav-create"
              disabled={loading || loadFailed}
              onClick={() => {
                setEditing(undefined);
                setCreateOpen(true);
              }}
            >
              <Plus size={17} aria-hidden="true" />
              创建课程
            </button>
          </div>
        </nav>
      )}
      <main className={`learn-main ${view === "lesson" ? "is-lesson" : ""}`}>
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
            <header className="learn-course-top learn-study-header">
              <button
                type="button"
                className="learn-dialog-back"
                aria-label="返回课程库"
                title="返回课程库"
                onClick={() => setView("library")}
              >
                <Icon name="chevronLeft" size={16} />
              </button>
              <div className="learn-course-header-title">
                <h2 title={course.title}>{course.title}</h2>
              </div>
              <div className="learn-study-actions">
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
            </header>
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
                        aria-label={
                          currentProgress.completed.includes(item.id)
                            ? `${item.title}，已完成`
                            : undefined
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
                        <span>{item.title}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </aside>
              <div ref={readingRef} className="learn-reading">
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
                  <div className="learn-lesson-title-row">
                    <h1
                      title={tab === "project" ? "课程项目实训" : lesson.title}
                    >
                      {tab === "project" ? "课程项目实训" : lesson.title}
                      {tab !== "project" && lessonCompleted && (
                        <span className="learn-lesson-completed">已完成</span>
                      )}
                    </h1>
                    {tab !== "project" && (!lessonCompleted || nextLesson) && (
                      <button
                        className="learn-button primary"
                        title={
                          lessonCompleted
                            ? "进入下一课"
                            : confirmCompletion
                              ? "再次点击完成本课；移开焦点或按 Esc 取消"
                              : "点击后再次确认，完成本课并继续学习"
                        }
                        aria-label={
                          lessonCompleted
                            ? "进入下一课"
                            : confirmCompletion
                              ? "确认完成本课"
                              : "完成本课"
                        }
                        disabled={busy}
                        onBlur={() => setConfirmCompletion(false)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape")
                            setConfirmCompletion(false);
                        }}
                        onClick={() => {
                          if (busy || lock.current) return;
                          if (lessonCompleted && nextLesson) {
                            jump(nextLesson.id);
                            return;
                          }
                          if (!confirmCompletion) {
                            setConfirmCompletion(true);
                            return;
                          }
                          setConfirmCompletion(false);
                          void run(async () => {
                            await updateProgress({
                              ...currentProgress,
                              completed: [
                                ...new Set([
                                  ...currentProgress.completed,
                                  lesson.id,
                                ]),
                              ],
                              lessonId: nextLesson?.id ?? lesson.id,
                            });
                            setTab("lesson");
                          });
                        }}
                      >
                        {busy
                          ? "保存中…"
                          : lessonCompleted
                            ? "下一课"
                            : confirmCompletion
                              ? "确认完成"
                              : "完成本课"}
                        <Icon
                          name={
                            lessonCompleted && nextLesson ? "arrow" : "check"
                          }
                          size={15}
                        />
                      </button>
                    )}
                  </div>
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
                      key={`${lesson.id}:${currentProgress.attempts[lesson.id]?.submittedAt ?? "blank"}:${retryIds ? retryRequest?.nonce : "latest"}`}
                      lesson={lesson}
                      attempt={currentProgress.attempts[lesson.id]}
                      retryIds={retryIds}
                      disabled={busy}
                      onSubmit={saveAttempt}
                      onReset={restartPractice}
                    />
                  )}
                </div>
              </div>
              <Tutor
                key={`${course.id}:${lesson.id}`}
                course={course}
                lesson={lesson}
                panels={{
                  grading: (
                    <GradingPanel
                      key={
                        currentProgress.attempts[lesson.id]?.submittedAt ??
                        "empty"
                      }
                      lesson={lesson}
                      attempt={currentProgress.attempts[lesson.id]}
                      disabled={busy}
                      onSubmit={(attempt) => saveAttempt(attempt, true)}
                    />
                  ),
                  mistakes: (
                    <MistakePanel
                      lesson={lesson}
                      attempt={currentProgress.attempts[lesson.id]}
                      disabled={busy}
                      onRetry={(ids) =>
                        void run(async () => {
                          setRetryRequest({
                            courseId: course.id,
                            lessonId: lesson.id,
                            ids,
                            nonce: Date.now(),
                          });
                          setTab("quiz");
                          setTutorExpanded(false);
                        })
                      }
                    />
                  ),
                  history: (
                    <PracticeHistory
                      lesson={lesson}
                      attempt={currentProgress.attempts[lesson.id]}
                      history={currentProgress.history[lesson.id] ?? []}
                    />
                  ),
                }}
                expanded={tutorExpanded}
                onToggleExpand={() => setTutorExpanded((value) => !value)}
              />
            </div>
          </>
        ) : (
          <section className="learn-library">
            {courses.length ? (
              <div className="learn-course-grid">
                {courses.map((item) => {
                  const id = entryId(item);
                  const title = entryTitle(item);
                  const stashed = item.status === "stashed";
                  const lessonCount = stashed
                    ? (item.outline?.lessons.length ?? 0)
                    : item.lessons.length;
                  const done = stashed
                    ? 0
                    : (progress[item.id]?.completed.length ?? 0);
                  const status = stashed
                    ? "暂存"
                    : done >= lessonCount
                      ? "已学完"
                      : done > 0
                        ? "学习中"
                        : "未开始";
                  return (
                    <article className="learn-course-card" key={id}>
                      <div className="learn-card-body">
                        <div className="learn-card-top">
                          <span
                            className="learn-card-accent"
                            aria-hidden="true"
                          />
                          <details className="learn-card-menu">
                            <summary aria-label={`更多课程操作：${title}`}>
                              <MoreHorizontal size={20} aria-hidden="true" />
                            </summary>
                            <div className="learn-card-menu-content">
                              {item.status === "ready" && (
                                <button
                                  disabled={busy}
                                  aria-label={`复制课程 JSON：${title}`}
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
                                      setCopiedCourse(id);
                                    })
                                  }
                                >
                                  {copiedCourse === id
                                    ? "已复制课程 JSON"
                                    : "复制课程 JSON"}
                                </button>
                              )}
                              <button
                                disabled={busy}
                                aria-label={`移除课程：${title}`}
                                onClick={(event) => {
                                  const menu =
                                    event.currentTarget.closest("details");
                                  deleteReturnFocusRef.current =
                                    menu?.querySelector("summary") ?? null;
                                  menu?.removeAttribute("open");
                                  setConfirmDelete(id);
                                }}
                              >
                                移除课程
                              </button>
                            </div>
                          </details>
                        </div>
                        <h3>{title}</h3>
                        <p>{entryDescription(item)}</p>
                        <div className="learn-card-tags">
                          <span
                            className="learn-card-tag is-status"
                            data-status={status}
                          >
                            <Circle
                              size={6}
                              fill="currentColor"
                              strokeWidth={0}
                              aria-hidden="true"
                            />
                            {status}
                          </span>
                          <span className="learn-card-tag is-level">
                            <Circle
                              size={6}
                              fill="currentColor"
                              strokeWidth={0}
                              aria-hidden="true"
                            />
                            {stashed
                              ? (item.outline?.level ?? item.brief.level)
                              : item.level}
                          </span>
                          {lessonCount > 0 && (
                            <span className="learn-card-tag">
                              <BookOpen size={14} aria-hidden="true" />
                              {lessonCount} 课时
                            </span>
                          )}
                        </div>
                        <div className="learn-card-actions">
                          <button
                            className="learn-button learn-card-edit"
                            onClick={() => edit(item)}
                          >
                            <Pencil size={16} aria-hidden="true" />
                            {stashed ? "继续编辑" : "编辑课程"}
                          </button>
                          {item.status === "ready" && (
                            <button
                              className="learn-button learn-card-study"
                              onClick={() => open(item)}
                            >
                              {done >= lessonCount
                                ? "回顾课程"
                                : done > 0
                                  ? "继续学习"
                                  : "开始学习"}
                            </button>
                          )}
                        </div>
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
                <h3>你的下一次探索，从这里开始</h3>
                <p>创建自己的课程，或先体验一门示例课程。</p>
                <div className="learn-empty-actions">
                  <button
                    className="learn-button primary"
                    onClick={() => {
                      setEditing(undefined);
                      setCreateOpen(true);
                    }}
                  >
                    创建课程
                  </button>
                  <button
                    className="learn-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
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
              </div>
            )}
          </section>
        )}
      </main>
      {deleteTarget && (
        <div
          className="learn-confirm-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy)
              setConfirmDelete("");
          }}
        >
          <div
            ref={deleteDialogRef}
            className="learn-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="learn-remove-title"
            aria-describedby="learn-remove-description"
          >
            <h2 id="learn-remove-title">移除课程</h2>
            <p id="learn-remove-description">
              确认移除「{entryTitle(deleteTarget)}
              」？课程内容、学习进度、实训数据与课程助手记录会一并删除，且无法撤销。
            </p>
            <div className="learn-confirm-actions">
              <button
                ref={deleteCancelRef}
                className="learn-button"
                disabled={busy}
                onClick={() => setConfirmDelete("")}
              >
                取消
              </button>
              <button
                className="learn-button danger"
                disabled={busy}
                onClick={() => void run(() => removeCourse(deleteTarget))}
              >
                {busy ? "正在移除…" : "确认移除"}
              </button>
            </div>
          </div>
        </div>
      )}
      {createOpen && (
        <CourseDialog
          key={editing ? entryId(editing) : "new"}
          initialCourse={editing}
          onClose={() => setCreateOpen(false)}
          onSave={save}
          onSaveDraft={saveDraft}
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
