type QuestionBase = {
  id: string;
  question: string;
  explanation: string;
  points: number;
};
export type Question = QuestionBase &
  (
    | {
        type: "single_choice";
        options: { value: string; label: string }[];
        answer: string;
      }
    | {
        type: "multiple_choice";
        options: { value: string; label: string }[];
        answer: string[];
      }
    | { type: "short_answer"; options: []; answer: string; rubric: string }
  );
export type Answers = Record<string, string | string[]>;
export type AIGrade = { score: number; feedback: string };
export type Lesson = {
  id: string;
  title: string;
  objective: string;
  content: string;
  example: string;
  takeaways: string[];
  questions: Question[];
};
export type CourseContent = {
  title: string;
  description: string;
  level: string;
  material?: string;
  lessons: Lesson[];
  outline?: CourseOutline;
  projectEnabled?: boolean;
};
export type CourseOutline = {
  goal: string;
  phases: { title: string; summary: string }[];
};
export type Course = CourseContent & {
  version: 2;
  id: string;
  createdAt: number;
  origin: "ai" | "example" | "import";
  status: "ready";
};
export type Attempt = {
  answers: Answers;
  submittedAt: number;
  grades?: Record<string, AIGrade>;
  gradingSession?: { workspaceId: string; chatId: string };
};
export type Progress = {
  lessonId: string;
  completed: string[];
  attempts: Record<string, Attempt>;
  /** Earlier submissions, newest first. The current submission stays in attempts. */
  history: Record<string, Attempt[]>;
};
export type Brief = {
  topic: string;
  level: string;
  material: string;
};
export const MAX_COURSE_BYTES = 180_000;
export const MAX_PROGRESS_BYTES = 220_000;
export const MAX_ATTEMPT_HISTORY = 8;
export const emptyProgress = (course: Course): Progress => ({
  lessonId: course.lessons[0].id,
  completed: [],
  attempts: {},
  history: {},
});
export const object = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label}必须是对象`);
  return value as Record<string, unknown>;
};
export function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`${label}需为 1–${max} 个字符`);
  return value.trim();
}
export function list(
  value: unknown,
  label: string,
  min: number,
  max: number,
): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    throw new Error(`${label}需包含 ${min}–${max} 项`);
  return value;
}
export function checkSize(value: unknown): void {
  if (
    new TextEncoder().encode(JSON.stringify(value)).byteLength >
    MAX_COURSE_BYTES
  )
    throw new Error("课程内容过大，请减少课时或文字后重试（上限 180 KB）");
}
function questionPoints(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0.5 ||
    value > 10 ||
    !Number.isInteger(value * 2)
  )
    throw new Error("题目分值须为 0.5–10 分，按 0.5 分递增");
  return value;
}
export function validateLesson(value: unknown, id: string): Lesson {
  const lesson = object(value, "课时");
  const questions = list(lesson.questions, "每课测验", 1, 3).map(
    (entry, j): Question => {
      const q = object(entry, "题目");
      const base = {
        id: `${id}-q${j + 1}`,
        question: text(q.question, "题干", 1000),
        explanation: text(q.explanation, "答案解析", 2000),
        points: questionPoints(q.points),
      };
      const type = q.type ?? "single_choice";
      if (type === "short_answer")
        return {
          ...base,
          type,
          options: [],
          answer: text(q.answer, "参考答案", 2000),
          rubric: text(q.rubric, "评分标准", 2000),
        };
      if (type !== "single_choice" && type !== "multiple_choice")
        throw new Error("不支持的题型");
      const options = list(q.options, "选项", 2, 5).map((entry) => {
        const option = object(entry, "选项");
        return {
          value: text(option.value, "选项标识", 16),
          label: text(option.label, "选项内容", 500),
        };
      });
      if (new Set(options.map((o) => o.value)).size !== options.length)
        throw new Error("选项标识不能重复");
      const answer =
        type === "single_choice"
          ? [text(q.answer, "正确答案", 16)]
          : list(q.answer, "多选正确答案", 1, 5).map((v) =>
              text(v, "正确答案", 16),
            );
      if (
        new Set(answer).size !== answer.length ||
        answer.some((v) => !options.some((o) => o.value === v))
      )
        throw new Error("正确答案必须对应不重复的选项标识");
      return type === "single_choice"
        ? { ...base, type, options, answer: answer[0] }
        : { ...base, type, options, answer };
    },
  );
  return {
    id,
    title: text(lesson.title, "课时标题", 120),
    objective: text(lesson.objective, "学习目标", 500),
    content: text(lesson.content, "课时正文", 8000),
    example: text(lesson.example, "示例", 4000),
    takeaways: list(lesson.takeaways, "知识要点", 1, 6).map((s) =>
      text(s, "知识要点", 500),
    ),
    questions,
  };
}
/** Model identities are never accepted; stored v2 identities are validated separately. */
export function validateContent(value: unknown): CourseContent {
  checkSize(value);
  const root = object(value, "课程");
  if (
    root.material !== undefined &&
    (typeof root.material !== "string" || root.material.length > 20000)
  )
    throw new Error("参考资料最多 20,000 字");
  return {
    title: text(root.title, "课程名称", 120),
    description: text(root.description, "课程简介", 1000),
    level: text(root.level, "适合水平", 40),
    ...(typeof root.material === "string"
      ? { material: root.material.trim() }
      : {}),
    lessons: list(root.lessons, "课时", 1, 8).map((entry, i) =>
      validateLesson(entry, `lesson-${i + 1}`),
    ),
    ...(root.outline ? { outline: validateCourseOutline(root.outline) } : {}),
    ...(typeof root.projectEnabled === "boolean"
      ? { projectEnabled: root.projectEnabled }
      : {}),
  };
}
export function validateCourseOutline(value: unknown): CourseOutline {
  const root = object(value, "课程大纲");
  return {
    goal: text(root.goal, "课程目标", 1000),
    phases: list(root.phases, "学习路径", 1, 6).map((entry) => {
      const phase = object(entry, "学习阶段");
      return {
        title: text(phase.title, "阶段名称", 120),
        summary: text(phase.summary, "阶段说明", 500),
      };
    }),
  };
}
export function validId(value: unknown): string {
  const id = text(value, "ID", 80);
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("ID 无效");
  return id;
}
export function parseCourseOutput(raw: string): CourseContent {
  if (raw.length > MAX_COURSE_BYTES)
    throw new Error("模型输出过长，请缩短课程后重新生成");
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(
      "尚未得到完整课程。请等待生成结束，或让 AI 按指定 JSON 格式重新输出。",
    );
  }
  return validateContent(parsed);
}
export function createCourse(
  content: CourseContent,
  origin: Course["origin"] = "ai",
): Course {
  return {
    ...validateContent(content),
    version: 2,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    origin,
    status: "ready",
  };
}
export function validateCourse(value: unknown): Course {
  const raw = object(value, "已保存课程");
  if (raw.version !== 2) throw new Error("不支持此课程版本，请更新学习工作台");
  const id = text(raw.id, "课程 ID", 80);
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("课程 ID 无效");
  if (typeof raw.createdAt !== "number" || !Number.isFinite(raw.createdAt))
    throw new Error("课程时间无效");
  if (!["ai", "example", "import"].includes(String(raw.origin)))
    throw new Error("课程来源无效");
  if (raw.status !== "ready") throw new Error("课程状态无效");
  const content = validateContent(raw);
  content.lessons = (raw.lessons as unknown[]).map((entry) =>
    validateLesson(entry, validId(object(entry, "课时").id)),
  );
  if (new Set(content.lessons.map((l) => l.id)).size !== content.lessons.length)
    throw new Error("课时 ID 不能重复");
  return {
    ...content,
    version: 2,
    id,
    createdAt: raw.createdAt,
    origin: raw.origin as Course["origin"],
    status: raw.status,
  };
}
export function restoreProgress(course: Course, value: unknown): Progress {
  const fallback = emptyProgress(course);
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fallback;
  const raw = value as Partial<Progress>;
  const ids = new Set(course.lessons.map((l) => l.id));
  const attempts: Progress["attempts"] = {};
  const history: Progress["history"] = {};
  for (const lesson of course.lessons) {
    const current = restoreAttempt(lesson, raw.attempts?.[lesson.id]);
    if (current) attempts[lesson.id] = current;
    const prior = raw.history?.[lesson.id];
    if (!Array.isArray(prior)) continue;
    const seen = new Set(current ? [current.submittedAt] : []);
    const rows = prior
      .slice(0, MAX_ATTEMPT_HISTORY * 3)
      .map((entry) => restoreAttempt(lesson, entry))
      .filter((entry): entry is Attempt => !!entry)
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .filter((entry) => {
        if (seen.has(entry.submittedAt)) return false;
        seen.add(entry.submittedAt);
        return true;
      })
      .slice(0, MAX_ATTEMPT_HISTORY);
    if (rows.length) history[lesson.id] = rows;
  }
  const restored: Progress = {
    lessonId:
      typeof raw.lessonId === "string" && ids.has(raw.lessonId)
        ? raw.lessonId
        : fallback.lessonId,
    completed: Array.isArray(raw.completed)
      ? [...new Set(raw.completed.filter((id) => ids.has(id)))]
      : [],
    attempts,
    history,
  };
  while (
    new TextEncoder().encode(JSON.stringify(restored)).byteLength >
    MAX_PROGRESS_BYTES
  ) {
    const oldest = Object.entries(restored.history)
      .filter(([, rows]) => rows.length)
      .sort(
        (a, b) =>
          a[1][a[1].length - 1].submittedAt - b[1][b[1].length - 1].submittedAt,
      )[0];
    if (!oldest) break;
    oldest[1].pop();
    if (!oldest[1].length) delete restored.history[oldest[0]];
  }
  return restored;
}

function restoreAttempt(lesson: Lesson, value: unknown): Attempt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const attempt = value as Partial<Attempt>;
  if (
    typeof attempt.submittedAt !== "number" ||
    !Number.isFinite(attempt.submittedAt)
  )
    return null;
  const answers: Answers = {};
  for (const q of lesson.questions) {
    const answer = attempt.answers?.[q.id];
    if (validAnswer(q, answer)) answers[q.id] = answer;
  }
  if (Object.keys(answers).length !== lesson.questions.length) return null;
  const restored: Attempt = { answers, submittedAt: attempt.submittedAt };
  if (attempt.grades) {
    const grades: Record<string, AIGrade> = {};
    for (const q of lesson.questions.filter((q) => q.type === "short_answer")) {
      const g = attempt.grades[q.id];
      if (
        g &&
        typeof g.score === "number" &&
        Number.isFinite(g.score) &&
        g.score >= 0 &&
        g.score <= q.points &&
        typeof g.feedback === "string" &&
        !!g.feedback.trim() &&
        g.feedback.length <= 2000
      )
        grades[q.id] = { score: g.score, feedback: g.feedback };
    }
    if (Object.keys(grades).length) restored.grades = grades;
  }
  const ref = attempt.gradingSession;
  if (
    ref &&
    typeof ref.chatId === "string" &&
    typeof ref.workspaceId === "string" &&
    ref.chatId.length <= 200 &&
    ref.workspaceId.length <= 200
  )
    restored.gradingSession = {
      chatId: ref.chatId,
      workspaceId: ref.workspaceId,
    };
  return restored;
}

export function recordAttempt(
  course: Course,
  progress: Progress,
  lessonId: string,
  attempt: Attempt,
): Progress {
  const lesson = course.lessons.find((item) => item.id === lessonId);
  if (!lesson) throw new Error("课时不存在");
  const normalized = restoreAttempt(lesson, attempt);
  if (!normalized) throw new Error("本次作答无效");
  const current = progress.attempts[lessonId];
  const history = { ...progress.history };
  if (current && current.submittedAt !== normalized.submittedAt) {
    history[lessonId] = [
      {
        answers: current.answers,
        submittedAt: current.submittedAt,
        ...(current.grades ? { grades: current.grades } : {}),
      },
      ...(history[lessonId] ?? []),
    ];
  }
  return restoreProgress(course, {
    ...progress,
    attempts: { ...progress.attempts, [lessonId]: normalized },
    history,
  });
}

export function validAnswer(
  q: Question,
  answer: unknown,
): answer is string | string[] {
  if (q.type === "short_answer")
    return (
      typeof answer === "string" && !!answer.trim() && answer.length <= 2000
    );
  if (q.type === "single_choice")
    return (
      typeof answer === "string" && q.options.some((o) => o.value === answer)
    );
  return (
    Array.isArray(answer) &&
    answer.length > 0 &&
    answer.length <= q.options.length &&
    new Set(answer).size === answer.length &&
    answer.every(
      (v) => typeof v === "string" && q.options.some((o) => o.value === v),
    )
  );
}
