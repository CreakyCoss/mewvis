export type Question = {
  id: string;
  type: "single_choice";
  question: string;
  options: { value: string; label: string }[];
  answer: string;
  explanation: string;
  points: number;
};
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
  lessons: Lesson[];
};
export type Course = CourseContent & {
  version: 1;
  id: string;
  createdAt: number;
  origin: "ai" | "example" | "import";
};
export type Attempt = { answers: Record<string, string>; submittedAt: number };
export type Progress = {
  lessonId: string;
  completed: string[];
  attempts: Record<string, Attempt>;
};
export type Brief = {
  topic: string;
  level: string;
  count: number;
  material: string;
};
export const MAX_COURSE_BYTES = 180_000;
export const emptyProgress = (course: Course): Progress => ({
  lessonId: course.lessons[0].id,
  completed: [],
  attempts: {},
});
const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label}必须是对象`);
  return value as Record<string, unknown>;
};
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`${label}需为 1–${max} 个字符`);
  return value.trim();
}
function list(
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
/** Normalize only explicit supported fields; never render model HTML or execute code. */
export function validateContent(value: unknown): CourseContent {
  checkSize(value);
  const root = object(value, "课程");
  const lessons = list(root.lessons, "课时", 1, 8).map((entry, i): Lesson => {
    const lesson = object(entry, `第 ${i + 1} 课`);
    const id = `lesson-${i + 1}`;
    const questions = list(lesson.questions, "每课测验", 1, 3).map(
      (entry, j): Question => {
        const q = object(entry, "题目");
        const options = list(q.options, "选项", 2, 5).map((entry) => {
          const option = object(entry, "选项");
          return {
            value: text(option.value, "选项标识", 16),
            label: text(option.label, "选项内容", 500),
          };
        });
        if (new Set(options.map((o) => o.value)).size !== options.length)
          throw new Error("选项标识不能重复");
        const answer = text(q.answer, "正确答案", 16);
        if (!options.some((o) => o.value === answer))
          throw new Error("正确答案必须对应一个选项标识");
        return {
          id: `${id}-q${j + 1}`,
          type: "single_choice",
          question: text(q.question, "题干", 1000),
          options,
          answer,
          explanation: text(q.explanation, "答案解析", 2000),
          points: 1,
        };
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
  });
  return {
    title: text(root.title, "课程名称", 120),
    description: text(root.description, "课程简介", 1000),
    level: text(root.level, "适合水平", 40),
    lessons,
  };
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
    version: 1,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    origin,
  };
}
export function validateCourse(value: unknown): Course {
  const raw = object(value, "已保存课程");
  if (raw.version !== 1) throw new Error("不支持此课程版本，请更新学习工作台");
  const id = text(raw.id, "课程 ID", 80);
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("课程 ID 无效");
  if (typeof raw.createdAt !== "number" || !Number.isFinite(raw.createdAt))
    throw new Error("课程时间无效");
  if (!["ai", "example", "import"].includes(String(raw.origin)))
    throw new Error("课程来源无效");
  return {
    ...validateContent(raw),
    version: 1,
    id,
    createdAt: raw.createdAt,
    origin: raw.origin as Course["origin"],
  };
}
export function restoreProgress(course: Course, value: unknown): Progress {
  const fallback = emptyProgress(course);
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fallback;
  const raw = value as Partial<Progress>;
  const ids = new Set(course.lessons.map((l) => l.id));
  const attempts: Progress["attempts"] = {};
  for (const lesson of course.lessons) {
    const attempt = raw.attempts?.[lesson.id];
    if (
      !attempt ||
      typeof attempt.submittedAt !== "number" ||
      !Number.isFinite(attempt.submittedAt)
    )
      continue;
    const answers: Record<string, string> = {};
    for (const q of lesson.questions) {
      const answer = attempt.answers?.[q.id];
      if (q.options.some((o) => o.value === answer)) answers[q.id] = answer;
    }
    if (Object.keys(answers).length === lesson.questions.length)
      attempts[lesson.id] = { answers, submittedAt: attempt.submittedAt };
  }
  return {
    lessonId:
      typeof raw.lessonId === "string" && ids.has(raw.lessonId)
        ? raw.lessonId
        : fallback.lessonId,
    completed: Array.isArray(raw.completed)
      ? [...new Set(raw.completed.filter((id) => ids.has(id)))]
      : [],
    attempts,
  };
}
