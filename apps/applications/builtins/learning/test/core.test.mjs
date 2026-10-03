import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(tmpdir(), "mewvis-learning-test-"));
test.after(() => rm(temporary, { recursive: true, force: true }));
const compiled = await build({
  stdin: {
    contents:
      'export * from "./main/course"; export * from "./main/repository"; export * from "./main/assistantHistory"; export * from "./main/clearOldChats"; export * from "./main/generation"; export * from "./main/example"; export * from "./main/workflow"; export * from "./main/pbl"; export * from "./main/vendor/grading"; export * from "./main/mastery"; export * from "./main/study"; export * from "./main/chatRecovery"; export * from "./main/tutorSessions";',
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
});
const modulePath = join(temporary, "core.mjs");
await writeFile(modulePath, compiled.outputFiles[0].contents);
const {
  reviewQuestions,
  questionAnalysisPrompt,
  assertCurrentReview,
  validateContent,
  validateCourse,
  createCourse,
  parseCourseOutput,
  emptyProgress,
  restoreProgress,
  recordAttempt,
  resetAttempt,
  recoverMissingChat,
  readTutorSessionIndex,
  activateTutorSession,
  tutorSessionHistory,
  repository,
  upsertCourseEntry,
  assistantHistoryKey,
  readAssistantHistory,
  writeAssistantHistory,
  validateAssistantHistory,
  clearOldChats,
  courseKey,
  courseFromSnapshot,
  buildPrompt,
  exampleCourse,
  gradeChoiceQuestions,
  lessonMastery,
  validateLesson,
  validAnswer,
  newDraft,
  validateDraft,
  writeDraft,
  acceptTask,
  finishDraft,
  validateOutline,
  parseGrades,
  gradingPrompt,
  outlinePrompt,
  lessonPrompt,
  revisionPrompt,
  finalText,
  editDraftSlot,
  editDraftLesson,
  addDraftLesson,
  validatePlan,
  createProject,
  validateProject,
  saveProject,
  projectKey,
  adoptPlan,
  submitMilestone,
  parseProjectReview,
  adoptProjectReview,
  projectPrompt,
  projectReviewPrompt,
} = await import(pathToFileURL(modulePath).href);
const clientRoot = resolve(root, "../../../client");
const hostCompiled = await build({
  entryPoints: [join(clientRoot, "src/chat/core/index.ts")],
  tsconfig: join(clientRoot, "tsconfig.json"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
});
const hostModule = join(temporary, "chat.mjs");
await writeFile(hostModule, hostCompiled.outputFiles[0].contents);
const { createChatSession } = await import(pathToFileURL(hostModule).href);

async function realChatFixture() {
  let listener;
  let turn;
  let record = null;
  const session = await createChatSession({
    identity: { scope: "learning-test", id: crypto.randomUUID() },
    runtime: {
      subscribe: async (fn) => {
        listener = fn;
        return () => {
          listener = undefined;
        };
      },
      prepare: async (input) => {
        turn = input;
        return { dispatch: async () => {} };
      },
      abort: async () => {},
      answer: async () => {},
      release: async () => {},
    },
    storage: {
      load: async () => record,
      save: async (value) => {
        record = structuredClone(value);
      },
    },
    catalog: {
      load: async () => ({
        models: [
          {
            value: "fixture",
            label: "Fixture",
            selectedLabel: "Fixture",
            description: "Deterministic test response",
            isDefault: true,
          },
        ],
        permissionOptions: [{ mode: "ask", label: "Ask", isDefault: true }],
      }),
    },
  });
  return {
    session,
    emit: (event) =>
      listener?.({
        taskId: turn.taskId,
        event: { ...event, taskId: turn.taskId },
      }),
  };
}
const copy = () => structuredClone(exampleCourse);
function memory() {
  const values = new Map();
  return {
    values,
    async getItem(key) {
      return structuredClone(values.get(key) ?? null);
    },
    async setItem(key, value) {
      values.set(key, structuredClone(value));
    },
    async removeItem(key) {
      values.delete(key);
    },
    async clear() {
      values.clear();
    },
    async keys() {
      return [...values.keys()];
    },
  };
}
const snapshot = (patch = {}) => ({
  phase: "idle",
  activeTaskId: null,
  error: "",
  initializationError: "",
  messages: [
    { id: "u", role: "user", blocks: [{ type: "text", content: "生成课程" }] },
    {
      id: "a",
      role: "assistant",
      status: "done",
      blocks: [{ type: "text", content: JSON.stringify(exampleCourse) }],
    },
  ],
  ...patch,
});

test("model content normalizes IDs, rejects extra identity, and validates every answer", () => {
  const raw = copy();
  raw.lessons[0].id = "untrusted";
  raw.id = "outside";
  const content = validateContent(raw);
  assert.equal(content.lessons[0].id, "lesson-1");
  assert.equal(content.id, undefined);
  const generated = createCourse(content);
  assert.notEqual(generated.id, raw.id);
  assert.equal(validateCourse(generated).version, 2);
  raw.lessons[0].questions[0].answer = "missing";
  assert.throws(() => validateContent(raw), /正确答案/);
});
test("duplicate options, missing lessons, large input, and unsupported versions fail closed", () => {
  const raw = copy();
  raw.lessons[0].questions[0].options[1].value = "A";
  assert.throws(() => validateContent(raw), /不能重复/);
  assert.throws(() => validateContent({ ...copy(), lessons: [] }), /课时/);
  assert.throws(
    () => validateContent({ ...copy(), ignored: "长".repeat(70000) }),
    /过大/,
  );
  assert.throws(() => validateCourse({ ...copy(), version: 3 }), /版本/);
  assert.throws(() => validateCourse({ ...copy(), id: "../../test" }), /ID/);
});
test("JSON fences are accepted, truncated or prose-wrapped output is rejected", () => {
  assert.equal(
    parseCourseOutput("```json\n" + JSON.stringify(copy()) + "\n```").lessons
      .length,
    3,
  );
  assert.throws(() => parseCourseOutput('{"title":"partial"'), /完整课程/);
  assert.throws(
    () => parseCourseOutput("Here is a course: " + JSON.stringify(copy())),
    /完整课程/,
  );
});
test("only completed latest-turn output becomes a course", () => {
  assert.equal(courseFromSnapshot(snapshot()).lessons.length, 3);
  for (const patch of [
    { phase: "running" },
    { phase: "stopping" },
    { execution: { state: "cancelled" } },
    { execution: { state: "failed" } },
    { activeTaskId: "task" },
    { error: "cancelled" },
    { initializationError: "offline" },
  ])
    assert.equal(courseFromSnapshot(snapshot(patch)), null);
  const old = snapshot();
  old.messages.push({
    id: "u2",
    role: "user",
    blocks: [{ type: "text", content: "重新生成" }],
  });
  assert.equal(courseFromSnapshot(old), null);
  const partial = snapshot();
  partial.messages[1].status = "streaming";
  assert.equal(courseFromSnapshot(partial), null);
  const failed = snapshot();
  failed.messages[1].status = "error";
  assert.equal(courseFromSnapshot(failed), null);
});

test("real Chat engine streams a course, finishes, and persists the parsed result", async () => {
  const { session, emit } = await realChatFixture();
  try {
    const result = await session.send({
      text: "生成课程",
      requestId: "generation-1",
    });
    assert.equal(result.status, "dispatched");
    assert.equal(courseFromSnapshot(session.getSnapshot()), null);
    const text = JSON.stringify(copy());
    emit({ type: "text_delta", delta: text.slice(0, text.length / 2) });
    assert.equal(courseFromSnapshot(session.getSnapshot()), null);
    emit({ type: "text_delta", delta: text.slice(text.length / 2) });
    emit({ type: "done", text });
    const course = createCourse(courseFromSnapshot(session.getSnapshot()));
    const storage = memory();
    await repository(storage).save(course);
    assert.equal(
      (await repository(storage).list())[0].title,
      exampleCourse.title,
    );
    assert.equal((await session.flush()).ok, true);
  } finally {
    await session.close();
  }
});

test("real Chat cancellation rejects even syntactically complete streamed JSON", async () => {
  const { session, emit } = await realChatFixture();
  try {
    await session.send({ text: "生成课程" });
    emit({ type: "text_delta", delta: JSON.stringify(copy()) });
    assert.equal((await session.stop()).ok, true);
    assert.equal(courseFromSnapshot(session.getSnapshot()), null);
  } finally {
    await session.close();
  }
});
test("local grading distinguishes unanswered, wrong and correct answers", () => {
  const question = copy().lessons[0].questions[0];
  assert.equal(gradeChoiceQuestions([question], {})[0].earned, 0);
  assert.equal(
    gradeChoiceQuestions([question], { [question.id]: "A" })[0].correct,
    false,
  );
  assert.equal(
    gradeChoiceQuestions([question], { [question.id]: "B" })[0].earned,
    1,
  );
  assert.equal(
    gradeChoiceQuestions([question], {
      [question.id]: question.options[1].label,
    })[0].correct,
    false,
  );
});
test("saved course and progress survive a new repository instance", async () => {
  const storage = memory();
  const a = repository(storage);
  const course = copy();
  await a.save(course);
  const progress = emptyProgress(course);
  progress.completed = [course.lessons[0].id];
  progress.lessonId = course.lessons[1].id;
  progress.attempts[course.lessons[0].id] = {
    submittedAt: 123,
    answers: { [course.lessons[0].questions[0].id]: "B" },
  };
  await a.saveProgress(course, progress);
  const b = repository(storage);
  assert.equal((await b.list()).length, 1);
  assert.deepEqual(await b.progress(course), progress);
  await b.saveDraft(newDraft({ ...briefV2, topic: course.title }, course));
  assert.equal((await a.list())[0].status, "stashed");
  await a.save({ ...course, status: "ready" });
  assert.equal((await b.list())[0].status, "ready");
  assert.deepEqual(await b.progress(course), progress);
  assert.throws(
    () => validateCourse({ ...course, status: "unknown" }),
    /课程状态/,
  );
  await b.remove(course.id);
  assert.equal((await a.list()).length, 0);
  assert.equal(storage.values.size, 0);
});
test("assistant conversation keeps adopted results after stash and is removed with its course", async () => {
  const storage = memory();
  const course = copy();
  const history = [
    {
      id: crypto.randomUUID(),
      context: "课程设置",
      request: "让主题更清晰",
      outcome: "accepted",
      preview: { title: "机器学习基础", body: "从实际例子入门" },
    },
    {
      id: crypto.randomUUID(),
      context: "课程大纲",
      request: "继续优化学习路径",
      outcome: "revised",
      preview: { body: "先建立概念，再动手实践", items: ["认识模型", "完成练习"] },
    },
  ];
  await repository(storage).saveDraft(newDraft({ ...briefV2, topic: course.title }, course));
  await writeAssistantHistory(storage, course.id, history);
  assert.deepEqual(await readAssistantHistory(storage, course.id), history);
  await repository(storage).save(course);
  assert.deepEqual(await readAssistantHistory(storage, course.id), history);
  assert.throws(() => validateAssistantHistory([{ ...history[0], outcome: "unknown" }]), /状态/);
  await repository(storage).remove(course.id);
  assert.equal(await storage.getItem(assistantHistoryKey(course.id)), null);
});
test("malformed progress cannot introduce nonexistent lessons, answers, or duplicate completion", () => {
  const course = copy();
  const result = restoreProgress(course, {
    lessonId: "missing",
    completed: ["lesson-1", "missing", "lesson-1"],
    attempts: {
      "lesson-1": { submittedAt: 1, answers: { "lesson-1-q1": "Z" } },
    },
  });
  assert.equal(result.lessonId, "lesson-1");
  assert.deepEqual(result.completed, ["lesson-1"]);
  assert.deepEqual(result.attempts, {});
});
test("later submissions retain earlier work and grading updates do not add attempts", async () => {
  const course = copy();
  const lesson = course.lessons[0];
  const question = lesson.questions[0];
  let progress = emptyProgress(course);
  progress = recordAttempt(course, progress, lesson.id, {
    submittedAt: 10,
    answers: { [question.id]: question.options[1].value },
  });
  progress = recordAttempt(course, progress, lesson.id, {
    submittedAt: 20,
    answers: { [question.id]: question.answer },
  });
  assert.equal(progress.history[lesson.id].length, 1);
  assert.equal(progress.history[lesson.id][0].submittedAt, 10);
  progress = recordAttempt(course, progress, lesson.id, {
    ...progress.attempts[lesson.id],
    submittedAt: 20,
  });
  assert.equal(progress.history[lesson.id].length, 1);
  const storage = memory();
  await repository(storage).saveProgress(course, progress);
  assert.deepEqual(await repository(storage).progress(course), progress);
  const changed = structuredClone(course);
  changed.lessons[0].id = "replacement";
  assert.equal(
    restoreProgress(changed, progress).history[lesson.id],
    undefined,
  );
});
test("attempt history remains bounded within a course progress record", () => {
  const course = copy();
  const lesson = course.lessons[0];
  const question = lesson.questions[0];
  let progress = emptyProgress(course);
  for (let timestamp = 1; timestamp <= 30; timestamp++) {
    progress = recordAttempt(course, progress, lesson.id, {
      submittedAt: timestamp,
      answers: { [question.id]: question.answer },
    });
  }
  assert.equal(progress.attempts[lesson.id].submittedAt, 30);
  assert.deepEqual(
    progress.history[lesson.id].map((entry) => entry.submittedAt),
    [29, 28, 27, 26, 25, 24, 23, 22],
  );
  assert.ok(Buffer.byteLength(JSON.stringify(progress)) <= 220_000);
});
test("mastery reflects only graded questions and changes after short answer review", () => {
  const lesson = validateLesson(
    {
      title: "回忆",
      objective: "复习",
      content: "先回忆，再核对。",
      example: "说出所学内容。",
      takeaways: ["主动提取"],
      questions: [
        {
          type: "single_choice",
          points: 2,
          question: "第一步？",
          options: [
            { value: "A", label: "回忆" },
            { value: "B", label: "抄写" },
          ],
          answer: "A",
          explanation: "先回忆。",
        },
        {
          type: "short_answer",
          points: 3,
          question: "如何检查？",
          answer: "核对资料",
          rubric: "提到核对",
          explanation: "检查遗漏。",
        },
      ],
    },
    "lesson-1",
  );
  const attempt = {
    submittedAt: 1,
    answers: { "lesson-1-q1": "A", "lesson-1-q2": "核对" },
  };
  assert.deepEqual(lessonMastery(lesson, attempt), {
    percent: 100,
    assessed: 2,
    total: 5,
    pending: 1,
  });
  assert.deepEqual(
    lessonMastery(lesson, {
      ...attempt,
      grades: { "lesson-1-q2": { score: 1.5, feedback: "继续" } },
    }),
    { percent: 70, assessed: 5, total: 5, pending: 0 },
  );
});
test("the first launch removes every old application data key only once", async () => {
  const storage = memory();
  const r = repository(storage);
  for (const key of [
    courseKey("old"),
    "learning:progress:old",
    "learning:pbl:old",
    "learning:tutor:old:lesson",
    "learning:draft:v1",
    "learning:draft:v2",
    "unknown-old-key",
  ])
    storage.values.set(key, { legacy: true });
  let chatCleanups = 0;
  const clearChats = async () => {
    chatCleanups++;
    assert.deepEqual(await storage.keys(), []);
  };
  await r.initialize(clearChats);
  assert.deepEqual(await storage.keys(), ["learning:data-version"]);
  const course = copy();
  await r.save(course);
  await r.initialize(clearChats);
  assert.equal((await r.list())[0].id, course.id);
  assert.equal(storage.values.get("learning:data-version"), "course-flow-v5");
  assert.equal(chatCleanups, 1);
});
test("failed chat cleanup leaves no version marker and retries on next launch", async () => {
  const storage = memory();
  const r = repository(storage);
  storage.values.set("old", true);
  await assert.rejects(
    r.initialize(async () => {
      throw new Error("chat cleanup failed");
    }),
    /chat cleanup failed/,
  );
  assert.deepEqual(await storage.keys(), []);
  await r.initialize(async () => {});
  assert.deepEqual(await storage.keys(), ["learning:data-version"]);
});
test("tutor history keeps legacy sessions and lists only chats for the lesson", () => {
  const legacy = readTutorSessionIndex({ workspaceId: "workspace", chatId: "first" });
  assert.deepEqual(legacy, {
    workspaceId: "workspace",
    chatId: "first",
    sessionIds: ["first"],
  });
  const next = activateTutorSession(legacy, "workspace", "second");
  assert.deepEqual(next.sessionIds, ["first", "second"]);
  assert.equal(activateTutorSession(next, "workspace", "first").chatId, "first");
  assert.deepEqual(
    tutorSessionHistory(next, [
      { sceneId: "learning-tutor", chatId: "first", updatedAt: 1, createdAt: 1 },
      { sceneId: "learning-tutor", chatId: "other-lesson", updatedAt: 4, createdAt: 4 },
      { sceneId: "learning-task", chatId: "second", updatedAt: 3, createdAt: 3 },
      { sceneId: "learning-tutor", chatId: "second", updatedAt: 2, createdAt: 2 },
    ]).map((item) => item.chatId),
    ["second", "first"],
  );
});
test("old learning chats are removed without closing the shared chat client", async () => {
  const removed = [];
  let disposed = false;
  await clearOldChats(
    {
      workspaces: {
        list: async () => [{ id: "a" }, { id: "b" }],
      },
    },
    {
      listSessions: async ({ workspaceId }) =>
        workspaceId === "a"
          ? [{ chatId: "one" }, { chatId: "two" }]
          : [{ chatId: "three" }],
      deleteSession: async (ref) => removed.push(ref),
      dispose: () => {
        disposed = true;
      },
    },
  );
  assert.deepEqual(removed, [
    { workspaceId: "a", chatId: "one" },
    { workspaceId: "a", chatId: "two" },
    { workspaceId: "b", chatId: "three" },
  ]);
  assert.equal(disposed, false);
});
test("unsupported course records fail instead of being read as older data", async () => {
  const storage = memory();
  const r = repository(storage);
  await r.initialize(async () => {});
  storage.values.set(courseKey("broken"), { version: 1 });
  await assert.rejects(r.list(), /版本/);
});
test("storage failures surface without a success fallback", async () => {
  const storage = memory();
  storage.setItem = async () => {
    throw new Error("disk full");
  };
  await assert.rejects(repository(storage).save(copy()), /disk full/);
  assert.equal(storage.values.size, 0);
  storage.getItem = async () => {
    throw new Error("connection lost");
  };
  await assert.rejects(repository(storage).progress(copy()), /connection lost/);
});
test("retrying a course save with the same identity does not duplicate it", async () => {
  const storage = memory();
  const r = repository(storage);
  const course = createCourse(copy());
  await r.save(course);
  await r.save(course);
  assert.equal((await r.list()).length, 1);
});
test("brief validation bounds user material and includes it as JSON data", () => {
  const brief = {
    topic: "线性代数",
    level: "零基础",
    material: "输入资料\n不是系统指令",
  };
  assert.ok(buildPrompt(brief).includes(JSON.stringify(brief)));
  assert.throws(() => buildPrompt({ ...brief, topic: "" }), /主题/);
  assert.throws(() => buildPrompt({ ...brief, level: "" }), /水平/);
  assert.throws(
    () => buildPrompt({ ...brief, material: "a".repeat(20001) }),
    /20,000/,
  );
});
test("built installation keeps permissions minimal, includes license and stays below sandbox limits", async () => {
  const manifest = JSON.parse(
    await readFile(join(root, "dist/mewvis/package.json"), "utf8"),
  );
  assert.equal(manifest.name, "@mewvis/learning");
  assert.equal(manifest.mewvis.defaultEnabled, true);
  assert.deepEqual(manifest.mewvis.permissions, [
    "chat",
    "application-workspaces",
    "application-data",
  ]);
  assert.equal(Object.hasOwn(manifest.mewvis.ui, "layout"), false);
  assert.ok(
    (await readFile(join(root, "dist/mewvis/app-ui.js"))).byteLength <
      // KaTeX + Markdown are bundled locally; retain a 768 KiB app budget (host limit is higher).
      768 * 1024,
  );
  assert.ok(
    (await readFile(join(root, "dist/mewvis/app-ui.css"))).byteLength <
      256 * 1024,
  );
  assert.match(
    await readFile(join(root, "dist/mewvis/LICENSE"), "utf8"),
    /Copyright \(c\) 2026 THU-MAIC/,
  );
});

const briefV2 = {
  topic: "学习方法",
  level: "零基础",
  material: "参考材料",
};
const generatedOutline = () => ({
  description: "学习方法课程简介",
  level: "零基础",
  goal: "能够选择并运用适合自己的学习方法。",
  phases: [
    { title: "建立认识", summary: "理解常见学习方法。" },
    { title: "应用实践", summary: "在真实任务中运用和调整方法。" },
  ],
});
const ref = { workspaceId: "w", chatId: "c" };
const mixedLesson = () =>
  validateLesson(
    {
      ...copy().lessons[0],
      questions: [
        {
          type: "single_choice",
          points: 1,
          question: "单选",
          options: [
            { value: "A", label: "甲" },
            { value: "B", label: "乙" },
          ],
          answer: "A",
          explanation: "解析",
        },
        {
          type: "multiple_choice",
          points: 1,
          question: "多选",
          options: [
            { value: "A", label: "甲" },
            { value: "B", label: "乙" },
            { value: "C", label: "丙" },
          ],
          answer: ["A", "C"],
          explanation: "解析",
        },
        {
          type: "short_answer",
          points: 1,
          question: "解释主动回忆",
          answer: "主动从记忆中提取",
          rubric: "说清提取与反馈，各占半分",
          explanation: "重在提取",
        },
      ],
    },
    "mixed",
  );
test("mixed quiz validates explicit types and grades choices only", () => {
  const l = mixedLesson();
  for (const points of [undefined, 0, 0.3, 10.5, "2", Infinity]) {
    const invalid = structuredClone(l);
    invalid.questions[0].points = points;
    assert.throws(() => validateLesson(invalid, "bad"), /题目分值/);
  }
  const weighted = structuredClone(l);
  weighted.questions[0].points = 2.5;
  assert.equal(validateLesson(weighted, "weighted").questions[0].points, 2.5);
  assert.equal(validAnswer(l.questions[1], ["A", "A"]), false);
  assert.equal(validAnswer(l.questions[1], ["Z"]), false);
  assert.equal(validAnswer(l.questions[1], "A"), false);
  assert.equal(validAnswer(l.questions[2], "   "), false);
  assert.equal(validAnswer(l.questions[2], "a".repeat(2001)), false);
  const results = gradeChoiceQuestions(l.questions, {
    "mixed-q1": "A",
    "mixed-q2": ["C", "A"],
    "mixed-q3": "回答",
  });
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.correct));
  assert.equal(
    gradeChoiceQuestions(l.questions, { "mixed-q2": ["A"] })[1].correct,
    false,
  );
  const bad = structuredClone(l);
  bad.questions[1].answer = ["A", "A"];
  assert.throws(() => validateLesson(bad, "bad"), /正确答案/);
  bad.questions[1].type = "unknown";
  assert.throws(() => validateLesson(bad, "bad"), /题型/);
  const noRubric = structuredClone(l);
  delete noRubric.questions[2].rubric;
  assert.throws(() => validateLesson(noRubric, "bad"), /评分标准/);
});
test("saved courses preserve stable lesson identities", () => {
  const original = validateCourse(copy());
  const updated = validateCourse({
    ...original,
    lessons: [mixedLesson(), ...original.lessons.slice(1)],
  });
  assert.equal(updated.lessons[0].id, "mixed");
  assert.equal(updated.lessons[0].questions[2].type, "short_answer");
  const reordered = validateCourse({
    ...updated,
    lessons: [...updated.lessons].reverse(),
  });
  assert.equal(reordered.lessons.at(-1).questions[2].id, "mixed-q3");
  assert.throws(
    () =>
      validateCourse({ ...updated, lessons: [mixedLesson(), mixedLesson()] }),
    /重复/,
  );
});
test("outline edits, adoption and per-lesson retry survive draft reload without losing completed work", async () => {
  const storage = memory();
  let d = newDraft(briefV2);
  d.task = { kind: "outline", ref };
  d = acceptTask(d, JSON.stringify(generatedOutline()));
  assert.equal(d.outline.title, briefV2.topic);
  assert.equal(d.outline.phases.length, 2);
  assert.equal(d.outline.goal, generatedOutline().goal);
  assert.equal(d.outline.lessons.length, 0);
  assert.throws(() => finishDraft(d), /全部课时/);
  assert.doesNotMatch(outlinePrompt(briefV2), /"lessons"/);
  d.outline.lessons = Array.from({ length: 3 }, (_, i) => ({
    id: crypto.randomUUID(),
    title: `第 ${i + 1} 课`,
    objective: `填写第 ${i + 1} 课的学习目标`,
  }));
  d.outline.lessons[0].title = "调整后的标题";
  d.outline.lessons.reverse();
  d = await writeDraft(storage, d, courseKey(d.courseId));
  d = validateDraft(await storage.getItem(courseKey(d.courseId)));
  assert.equal(d.outline.lessons.at(-1).title, "调整后的标题");
  const first = d.outline.lessons[0];
  d.task = { kind: "lesson", targetId: first.id, ref };
  d = acceptTask(d, JSON.stringify(mixedLesson()));
  const retained = structuredClone(d.outline.lessons[0].lesson);
  d.task = { kind: "lesson", targetId: d.outline.lessons[1].id, ref };
  await writeDraft(storage, d, courseKey(d.courseId));
  assert.throws(() => acceptTask(d, '{"partial":'), /完整 JSON/);
  d = validateDraft(await storage.getItem(courseKey(d.courseId)));
  assert.deepEqual(d.outline.lessons[0].lesson, retained);
  assert.throws(() => finishDraft(d), /全部课时/);
  for (const slot of d.outline.lessons.filter((s) => !s.lesson)) {
    d.task = { kind: "lesson", targetId: slot.id, ref };
    d = acceptTask(d, JSON.stringify(copy().lessons[0]));
  }
  const course = finishDraft(d);
  assert.equal(course.material, briefV2.material);
  assert.equal(course.version, 2);
  assert.deepEqual(course.outline.phases, generatedOutline().phases);
  assert.equal(course.lessons[0].id, retained.id);
  assert.equal(course.lessons[2].title, "调整后的标题");
  assert.equal(finishDraft(d).id, course.id);
  assert.throws(
    () =>
      validateDraft({
        ...d,
        task: { kind: "lesson", targetId: "missing", ref },
      }),
    /不存在/,
  );
});
test("AI outline optimization preserves manually maintained lesson slots and content", () => {
  const course = copy();
  const original = newDraft({ ...briefV2, topic: course.title }, course);
  original.outline.goal = "手动调整的目标";
  original.task = { kind: "outline", ref };
  assert.doesNotMatch(
    outlinePrompt(original.brief, original.outline),
    /"lessons"/,
  );
  const updated = acceptTask(
    original,
    JSON.stringify({ ...generatedOutline(), goal: "优化后的总目标" }),
  );
  assert.equal(updated.outline.goal, "优化后的总目标");
  assert.deepEqual(updated.outline.lessons, original.outline.lessons);
  assert.equal(updated.outline.lessons[0].lesson.id, course.lessons[0].id);
  assert.equal(finishDraft(updated).lessons.length, course.lessons.length);
});
test("course creation order stays stable across inserts, edits, and reloads", async () => {
  const storage = memory();
  const repo = repository(storage);
  const oldest = { ...copy(), id: "oldest", createdAt: 100 };
  const newest = { ...copy(), id: "newest", createdAt: 300 };
  const middle = { ...newDraft(briefV2), courseId: "middle", createdAt: 200 };
  let entries = [];
  for (const entry of [newest, oldest, middle]) {
    if (entry.status === "stashed") await repo.saveDraft(entry);
    else await repo.save(entry);
    entries = upsertCourseEntry(entries, entry);
  }
  const ids = (items) => items.map((item) => item.courseId ?? item.id);
  assert.deepEqual(ids(entries), ["oldest", "middle", "newest"]);
  assert.deepEqual(ids(await repository(storage).list()), ids(entries));

  const edited = { ...newest, title: "更新课程名称" };
  await repo.save(edited);
  entries = upsertCourseEntry(entries, edited);
  const editedDraft = { ...middle, brief: { ...middle.brief, topic: "更新草稿" } };
  await repo.saveDraft(editedDraft);
  entries = upsertCourseEntry(entries, editedDraft);
  assert.deepEqual(ids(entries), ["oldest", "middle", "newest"]);
  assert.deepEqual(ids(await repository(storage).list()), ids(entries));

  // Equal creation times also retain the same order after an edit or reload.
  const tied = { ...oldest, id: "oldest-tie" };
  await repo.save(tied);
  entries = upsertCourseEntry(entries, tied);
  const before = ids(entries);
  entries = upsertCourseEntry(entries, oldest);
  assert.deepEqual(ids(entries), before);
  assert.deepEqual(ids(await repository(storage).list()), before);
});

test("saving edits to a ready course preserves status, creation time, and progress", async () => {
  const storage = memory();
  const repo = repository(storage);
  const course = { ...copy(), createdAt: 123 };
  await repo.save(course);
  const progress = emptyProgress(course);
  progress.completed = [course.lessons[0].id];
  await repo.saveProgress(course, progress);
  const draft = newDraft({ ...briefV2, topic: course.title }, course);
  draft.outline.title = "编辑后保存的课程";
  await repo.save(finishDraft(draft));
  const [saved] = await repository(storage).list();
  assert.equal(saved.status, "ready");
  assert.equal(saved.id, course.id);
  assert.equal(saved.createdAt, 123);
  assert.equal(saved.title, "编辑后保存的课程");
  assert.deepEqual(saved.lessons.map((lesson) => lesson.id), course.lessons.map((lesson) => lesson.id));
  assert.deepEqual((await repo.progress(saved)).completed, progress.completed);

  delete draft.outline.lessons[0].lesson;
  assert.throws(() => finishDraft(draft), /课时/);
  assert.equal((await repo.list())[0].status, "ready");
});

test("temporary courses use course records and resume independently", async () => {
  const storage = memory();
  const course = copy();
  await repository(storage).save(course);
  const fresh = newDraft(briefV2, undefined, 1);
  fresh.projectEnabled = true;
  const edit = newDraft({ ...briefV2, topic: course.title }, course);
  await repository(storage).saveDraft(fresh);
  await repository(storage).saveDraft(edit);
  assert.equal(
    (await storage.getItem(courseKey(fresh.courseId))).courseId,
    fresh.courseId,
  );
  assert.equal(
    validateDraft(await storage.getItem(courseKey(fresh.courseId)))
      .creationStep,
    1,
  );
  assert.equal(
    validateDraft(await storage.getItem(courseKey(fresh.courseId)))
      .projectEnabled,
    true,
  );
  assert.equal(validateDraft({ ...fresh, creationStep: 2 }).creationStep, 2);
  assert.equal(validateDraft({ ...fresh, creationStep: 3 }).creationStep, 3);
  assert.throws(() => validateDraft({ ...fresh, creationStep: 4 }), /步骤/);
  assert.throws(
    () => validateDraft({ ...fresh, creationStep: undefined }),
    /步骤/,
  );
  assert.throws(() => validateDraft({ ...fresh, creationStep: 5 }), /步骤/);
  assert.equal(
    (await storage.getItem(courseKey(course.id))).courseId,
    course.id,
  );
  await repository(storage).remove(course.id);
  assert.equal(await storage.getItem(courseKey(course.id)), null);
  assert.equal(
    (await storage.getItem(courseKey(fresh.courseId))).courseId,
    fresh.courseId,
  );
});
test("unfinished outline and project fields survive stash without becoming a completed course", async () => {
  const storage = memory();
  const draft = {
    ...newDraft(briefV2, undefined, 3),
    outline: {
      title: briefV2.topic,
      level: briefV2.level,
      description: "已写的简介",
      goal: "",
      phases: [{ title: "", summary: "" }],
      lessons: [],
    },
    projectEnabled: true,
    projectPlan: {
      title: "实训草案",
      scenario: "",
      role: "分析者",
      outcome: "",
      milestones: [1, 2].map((number) => ({
        id: `stage-${number}`,
        title: "",
        goal: "",
        steps: [""],
        deliverable: "",
        criteria: [{ id: `stage-${number}-c1`, description: "" }],
      })),
    },
  };
  await writeDraft(storage, draft, courseKey(draft.courseId));
  const restored = validateDraft(await storage.getItem(courseKey(draft.courseId)));
  assert.equal(restored.outline.description, "已写的简介");
  assert.equal(restored.projectPlan.title, "实训草案");
  assert.equal(restored.projectPlan.milestones.length, 2);
  assert.throws(() => finishDraft(restored), /课时/);
});
test("rewriting one saved lesson invalidates only its progress and tutor identity", () => {
  const course = copy();
  let d = newDraft(briefV2, course);
  const progress = emptyProgress(course);
  progress.completed = course.lessons.map((l) => l.id);
  for (const l of course.lessons)
    progress.attempts[l.id] = {
      answers: Object.fromEntries(l.questions.map((q) => [q.id, q.answer])),
      submittedAt: 10,
    };
  const id = d.outline.lessons[1].id;
  d.task = { kind: "lesson", targetId: id, ref };
  d = acceptTask(d, JSON.stringify(course.lessons[1]));
  const revised = finishDraft(d);
  assert.equal(revised.id, course.id);
  assert.notEqual(revised.lessons[1].id, course.lessons[1].id);
  const next = restoreProgress(revised, progress);
  assert.deepEqual(next.completed, [
    course.lessons[0].id,
    course.lessons[2].id,
  ]);
  assert.equal(Object.keys(next.attempts).length, 2);
});
test("AI lesson revision accepts validated field patches and preserves other lessons", () => {
  const course = copy();
  const original = course.lessons[0];
  let draft = newDraft(briefV2, course);
  const slotId = draft.outline.lessons[0].id;
  draft.task = {
    kind: "revise",
    targetId: slotId,
    instruction: "只更新示例",
    ref,
  };
  assert.match(revisionPrompt(draft, slotId), /只更新示例/);
  assert.equal(validateDraft(draft).task.instruction, "只更新示例");
  assert.throws(
    () => acceptTask(draft, JSON.stringify({ changes: { id: "bad" } })),
    /无效字段/,
  );
  assert.throws(
    () =>
      acceptTask(
        draft,
        JSON.stringify({ changes: { example: original.example } }),
      ),
    /没有实际变化/,
  );
  const revised = acceptTask(
    draft,
    JSON.stringify({ changes: { example: "新例子" } }),
  );
  assert.equal(revised.task, undefined);
  assert.equal(revised.outline.lessons[0].lesson.example, "新例子");
  assert.equal(revised.outline.lessons[0].lesson.content, original.content);
  assert.notEqual(revised.outline.lessons[0].lesson.id, original.id);
  assert.equal(revised.outline.lessons[1].lesson.id, course.lessons[1].id);
});
test("AI grading binds every score to the submitted attempt and validates coverage and bounds", () => {
  const l = mixedLesson();
  const attempt = {
    submittedAt: 123,
    answers: {
      "mixed-q1": "A",
      "mixed-q2": ["A", "C"],
      "mixed-q3": "我的答案",
    },
  };
  const output = {
    submissionId: "123",
    grades: [{ questionId: "mixed-q3", score: 0.5, feedback: "补充反馈部分" }],
  };
  assert.equal(
    parseGrades(JSON.stringify(output), l, attempt)["mixed-q3"].score,
    0.5,
  );
  assert.ok(gradingPrompt(l, attempt).includes("我的答案"));
  const weightedLesson = structuredClone(l);
  weightedLesson.questions[2].points = 3;
  assert.ok(gradingPrompt(weightedLesson, attempt).includes('"points":3'));
  assert.equal(
    parseGrades(
      JSON.stringify({ ...output, grades: [{ ...output.grades[0], score: 2.5 }] }),
      weightedLesson,
      attempt,
    )["mixed-q3"].score,
    2.5,
  );
  assert.throws(
    () => parseGrades(
      JSON.stringify({ ...output, grades: [{ ...output.grades[0], score: 3.5 }] }),
      weightedLesson,
      attempt,
    ),
    /范围/,
  );
  assert.throws(
    () =>
      parseGrades(
        JSON.stringify({ ...output, submissionId: "122" }),
        l,
        attempt,
      ),
    /不匹配/,
  );
  assert.throws(
    () => parseGrades(JSON.stringify({ ...output, grades: [] }), l, attempt),
    /评分结果/,
  );
  assert.throws(
    () =>
      parseGrades(
        JSON.stringify({
          ...output,
          grades: [{ ...output.grades[0], questionId: "mixed-q1" }],
        }),
        l,
        attempt,
      ),
    /不匹配/,
  );
  for (const score of [-1, 1.1, "1"])
    assert.throws(
      () =>
        parseGrades(
          JSON.stringify({
            ...output,
            grades: [{ ...output.grades[0], score }],
          }),
          l,
          attempt,
        ),
      /范围/,
    );
  const course = validateCourse({ ...copy(), version: 2, lessons: [l] });
  const progress = {
    ...emptyProgress(course),
    attempts: {
      mixed: {
        ...attempt,
        grades: parseGrades(JSON.stringify(output), l, attempt),
        gradingSession: ref,
      },
    },
  };
  assert.deepEqual(restoreProgress(course, progress), progress);
  progress.attempts.mixed.grades["mixed-q3"].score = 10;
  assert.equal(
    restoreProgress(course, progress).attempts.mixed.grades,
    undefined,
  );
});
test("draft storage rejects oversize data and propagates write failure without replacing saved draft", async () => {
  const storage = memory();
  const d = newDraft(briefV2, copy());
  await writeDraft(storage, d, courseKey(d.courseId));
  storage.setItem = async () => {
    throw new Error("disk full");
  };
  await assert.rejects(
    writeDraft(
      storage,
      { ...d, brief: { ...briefV2, topic: "新需求" } },
      courseKey(d.courseId),
    ),
    /disk full/,
  );
  assert.equal(
    (await storage.getItem(courseKey(d.courseId))).brief.topic,
    briefV2.topic,
  );
  assert.throws(() => validateDraft({ ...d, version: 10 }), /版本/);
  assert.ok(outlinePrompt(briefV2).includes("大纲"));
  assert.ok(lessonPrompt(d, d.outline.lessons[0].id).includes("short_answer"));
});
test("real Chat staged output never adopts streaming, cancelled, or previous-turn results", async () => {
  const { session, emit } = await realChatFixture();
  try {
    await session.send({ text: outlinePrompt(briefV2) });
    const output = JSON.stringify(generatedOutline());
    emit({ type: "text_delta", delta: output });
    assert.equal(finalText(session.getSnapshot()), null);
    emit({ type: "done", text: output });
    const d = acceptTask(
      { ...newDraft(briefV2), task: { kind: "outline", ref } },
      finalText(session.getSnapshot()),
    );
    assert.equal(d.outline.lessons.length, 0);
    await session.send({ text: "重试大纲" });
    assert.equal(finalText(session.getSnapshot()), null);
    await session.stop();
    assert.equal(finalText(session.getSnapshot()), null);
  } finally {
    await session.close();
  }
});

test("draft byte limit rejects otherwise valid large lessons before any write", async () => {
  const storage = memory();
  const d = newDraft(briefV2, copy());
  d.outline.lessons = Array.from({ length: 8 }, (_, i) => {
    const id = `large-${i}`;
    const lesson = {
      ...copy().lessons[0],
      id,
      content: "字".repeat(8000),
      example: "字".repeat(4000),
    };
    return { id, title: lesson.title, objective: lesson.objective, lesson };
  });
  await assert.rejects(writeDraft(storage, d, courseKey(d.courseId)), /240 KB/);
  assert.equal(storage.values.size, 0);
});

const projectPlan = () => ({
  title: "写一份学习指南",
  scenario: "给新同学设计学习指南",
  role: "学习教练",
  outcome: "一份可以执行的指南",
  milestones: [1, 2].map((n) => ({
    title: `阶段 ${n}`,
    goal: "形成可执行计划",
    steps: ["确定目标", "安排练习"],
    deliverable: "一段具体计划",
    criteria: ["包含可检验目标", "包含练习与反馈"],
  })),
});
const reviewOutput = (p, stageId, met = true) => ({
  projectId: p.id,
  stageId,
  submissionId: p.progress[stageId].submission.id,
  summary: "结构清晰",
  checks: p.plan.milestones
    .find((s) => s.id === stageId)
    .criteria.map((c) => ({
      criterionId: c.id,
      met,
      feedback: "依据提交文本判断",
    })),
  suggestions: met ? [] : ["补充具体目标"],
});
test("manual lesson edits preserve identity on no-op and revise only changed content", () => {
  const original = copy();
  const d = newDraft(briefV2, original);
  const slot = d.outline.lessons[0];
  const noop = editDraftLesson(d, slot.id, slot.lesson);
  assert.equal(noop.outline.lessons[0].lesson.id, slot.lesson.id);
  const changed = editDraftLesson(d, slot.id, {
    ...slot.lesson,
    content: "修正后的正文",
    questions: mixedLesson().questions,
  });
  const course = finishDraft(changed);
  assert.notEqual(course.lessons[0].id, original.lessons[0].id);
  assert.equal(course.lessons[0].questions[2].type, "short_answer");
  assert.equal(course.lessons[1].id, original.lessons[1].id);
  assert.throws(
    () => editDraftLesson(d, slot.id, { ...slot.lesson, questions: [] }),
    /测验/,
  );
  assert.throws(
    () =>
      editDraftLesson(
        { ...d, task: { kind: "outline", ref } },
        slot.id,
        slot.lesson,
      ),
    /结束/,
  );
  assert.throws(() => editDraftLesson(d, "missing", slot.lesson), /不存在/);
});
test("new lessons enter the draft only with complete validated content", () => {
  const draft = newDraft(briefV2, copy());
  const before = draft.outline.lessons.length;
  const id = crypto.randomUUID();
  assert.throws(
    () => addDraftLesson(draft, { ...mixedLesson(), content: "" }, id),
    /课时正文/,
  );
  assert.equal(draft.outline.lessons.length, before);
  const next = addDraftLesson(draft, mixedLesson(), id);
  assert.equal(next.outline.lessons.length, before + 1);
  assert.equal(next.outline.lessons.at(-1).id, id);
  assert.equal(next.outline.lessons.at(-1).lesson.title, mixedLesson().title);
  assert.throws(() => addDraftLesson(next, mixedLesson(), id), /已存在/);
  const generating = {
    ...draft,
    outline: {
      ...draft.outline,
      lessons: [
        ...draft.outline.lessons,
        { id, title: "第 3 课", objective: "填写本课学习目标" },
      ],
    },
    task: { kind: "lesson", targetId: id, creating: true, ref },
  };
  assert.equal(validateDraft(generating).task.creating, true);
  assert.equal(
    acceptTask(generating, JSON.stringify(mixedLesson())).outline.lessons.at(-1)
      .lesson.title,
    mixedLesson().title,
  );
});
test("changing a lesson's title or objective clears only that lesson's finished content", () => {
  const d = newDraft(briefV2, copy());
  const slot = d.outline.lessons[0];
  const unchanged = editDraftSlot(d, slot.id, slot.title, slot.objective);
  assert.equal(unchanged.outline.lessons[0].lesson.id, slot.lesson.id);
  const renamed = editDraftSlot(d, slot.id, "新的课时标题", slot.objective);
  assert.equal(renamed.outline.lessons[0].lesson, undefined);
  assert.equal(
    renamed.outline.lessons[1].lesson.id,
    d.outline.lessons[1].lesson.id,
  );
  assert.throws(
    () => editDraftSlot(d, slot.id, "", slot.objective),
    /课时标题/,
  );
});
test("PBL plans normalize model identities, validate requirements and preserve course ownership", () => {
  const emptySource = createProject({
    id: crypto.randomUUID(),
    title: "尚未添加课时的课程",
    lessons: [],
  });
  assert.equal(
    validateProject(emptySource, emptySource.courseId).sourceLessons.length,
    0,
  );
  const raw = projectPlan();
  raw.id = "injected";
  raw.milestones[0].id = "other";
  const plan = validatePlan(raw);
  assert.equal(plan.id, undefined);
  assert.equal(plan.milestones[0].id, "stage-1");
  assert.throws(() => validatePlan({ ...raw, milestones: [] }), /阶段/);
  raw.milestones[0].criteria = [];
  assert.throws(() => validatePlan(raw), /验收/);
  const p = adoptPlan(createProject(copy()), JSON.stringify(projectPlan()));
  assert.throws(() => adoptPlan(p, JSON.stringify(projectPlan())), /不能覆盖/);
  assert.throws(() => validateProject(p, "another-course"), /所属课程/);
  assert.ok(projectPrompt(p).includes(copy().title));
});
test("PBL draft, submission and reviewed completion restore from storage; removing course clears its project", async () => {
  const storage = memory();
  const course = copy();
  await repository(storage).save(course);
  let p = adoptPlan(createProject(course), JSON.stringify(projectPlan()));
  p.progress["stage-1"].draft = "尚未提交的成果";
  p = await saveProject(storage, p);
  p = validateProject(await storage.getItem(projectKey(course.id)), course.id);
  assert.equal(p.progress["stage-1"].draft, "尚未提交的成果");
  p = submitMilestone(p, "stage-1", "包含目标和练习的计划");
  p = adoptProjectReview(
    p,
    "stage-1",
    JSON.stringify(reviewOutput(p, "stage-1")),
  );
  p.progress["stage-1"].completed = true;
  p.selected = "stage-2";
  await saveProject(storage, p);
  const reopened = validateProject(
    await storage.getItem(projectKey(course.id)),
    course.id,
  );
  assert.equal(reopened.selected, "stage-2");
  assert.equal(reopened.progress["stage-1"].completed, true);
  assert.deepEqual(
    reopened.progress["stage-1"].submission.review,
    p.progress["stage-1"].submission.review,
  );
  await repository(storage).remove(course.id);
  assert.equal(await storage.getItem(projectKey(course.id)), null);
});
test("PBL reviewer rejects wrong project, stage, old submission and incomplete criteria", () => {
  let p = adoptPlan(createProject(copy()), JSON.stringify(projectPlan()));
  p = submitMilestone(p, "stage-1", "第一版");
  const output = reviewOutput(p, "stage-1");
  for (const field of ["projectId", "stageId", "submissionId"])
    assert.throws(
      () =>
        parseProjectReview(
          JSON.stringify({ ...output, [field]: "other" }),
          p,
          "stage-1",
        ),
      /提交批次/,
    );
  assert.throws(
    () =>
      parseProjectReview(
        JSON.stringify({ ...output, checks: [output.checks[0]] }),
        p,
        "stage-1",
      ),
    /逐项验收/,
  );
  assert.throws(
    () =>
      parseProjectReview(
        JSON.stringify({
          ...output,
          checks: [output.checks[0], output.checks[0]],
        }),
        p,
        "stage-1",
      ),
    /重复/,
  );
  assert.throws(
    () =>
      parseProjectReview(
        JSON.stringify({
          ...output,
          checks: output.checks.map((c) => ({ ...c, met: "true" })),
        }),
        p,
        "stage-1",
      ),
    /无效/,
  );
  p = adoptProjectReview(p, "stage-1", JSON.stringify(output));
  p.progress["stage-1"].completed = true;
  const old = p.progress["stage-1"].submission.id;
  p = submitMilestone(p, "stage-1", "第二版");
  assert.notEqual(p.progress["stage-1"].submission.id, old);
  assert.equal(p.progress["stage-1"].submission.review, undefined);
  assert.equal(p.progress["stage-1"].completed, false);
  assert.throws(
    () => parseProjectReview(JSON.stringify(output), p, "stage-1"),
    /提交批次/,
  );
  assert.ok(projectReviewPrompt(p, "stage-1").includes("第二版"));
});
test("PBL completion requires reviewed criteria; failed writes and malformed records preserve prior data", async () => {
  const storage = memory();
  let p = adoptPlan(createProject(copy()), JSON.stringify(projectPlan()));
  p.progress["stage-1"].completed = true;
  assert.equal(
    validateProject(p, p.courseId).progress["stage-1"].completed,
    false,
  );
  p = submitMilestone(p, "stage-1", "计划");
  p = adoptProjectReview(
    p,
    "stage-1",
    JSON.stringify(reviewOutput(p, "stage-1", false)),
  );
  p.progress["stage-1"].completed = true;
  assert.equal(
    validateProject(p, p.courseId).progress["stage-1"].completed,
    false,
  );
  await saveProject(storage, p);
  const saved = await storage.getItem(projectKey(p.courseId));
  storage.setItem = async () => {
    throw new Error("disk full");
  };
  await assert.rejects(
    saveProject(storage, { ...p, selected: "stage-2" }),
    /disk full/,
  );
  assert.deepEqual(await storage.getItem(projectKey(p.courseId)), saved);
  assert.throws(() => submitMilestone(p, "stage-1", " "), /成果/);
  assert.throws(() => submitMilestone(p, "stage-1", "字".repeat(6001)), /成果/);
  assert.throws(
    () => validateProject({ ...p, version: 42 }, p.courseId),
    /版本/,
  );
});


test("study mistake panel excludes pending short answers and includes reviewed weak answers", () => {
  const lesson = mixedLesson();
  const attempt = { submittedAt: 123, answers: Object.fromEntries(lesson.questions.map((q) => [q.id, q.type === "short_answer" ? "我的回答" : q.answer])) };
  assert.deepEqual(reviewQuestions(lesson, attempt), []);
  const short = lesson.questions.find((q) => q.type === "short_answer");
  attempt.grades = { [short.id]: { score: 0, feedback: "需要补充" } };
  assert.deepEqual(reviewQuestions(lesson, attempt).map((q) => q.id), [short.id]);
  attempt.grades[short.id].score = short.points;
  assert.deepEqual(reviewQuestions(lesson, attempt), []);
  const choice = lesson.questions.find((q) => q.type === "single_choice");
  attempt.answers[choice.id] = choice.options.find((o) => o.value !== choice.answer).value;
  assert.deepEqual(reviewQuestions(lesson, attempt).map((q) => q.id), [choice.id]);
});

test("question analysis prompts cover every question type and the current answer", () => {
  const lesson = mixedLesson();
  const [single, multiple, short] = lesson.questions;
  const singlePrompt = questionAnalysisPrompt(lesson, single, 0, "B");
  assert.match(singlePrompt, /第 1 题（单选题）/);
  assert.match(singlePrompt, /B\. 乙/);
  assert.match(singlePrompt, /我的作答：B/);
  const multiplePrompt = questionAnalysisPrompt(lesson, multiple, 1, ["A", "C"]);
  assert.match(multiplePrompt, /第 2 题（多选题）/);
  assert.match(multiplePrompt, /我的作答：A、C/);
  assert.match(questionAnalysisPrompt(lesson, multiple, 1, []), /我的作答：尚未作答/);
  const shortPrompt = questionAnalysisPrompt(lesson, short, 2, "  我的解释  ");
  assert.match(shortPrompt, /第 3 题（简答题）/);
  assert.match(shortPrompt, /我的作答：我的解释/);
  assert.doesNotMatch(shortPrompt, /选项：/);
  assert.match(questionAnalysisPrompt(lesson, short, 2, undefined), /我的作答：尚未作答/);
});

test("a background review cannot replace a newer practice attempt", () => {
  const review = { submittedAt: 100, answers: {} };
  assert.doesNotThrow(() => assertCurrentReview({ ...review }, review));
  assert.throws(() => assertCurrentReview({ submittedAt: 200, answers: {} }, review), /作答已更新/);
  assert.throws(() => assertCurrentReview(undefined, review), /作答已更新/);
});


test("restart archives complete answers and grades, clears current work, and survives reload", async () => {
  const course = copy();
  const lesson = mixedLesson();
  course.lessons = [lesson];
  const attempt = {
    submittedAt: 100,
    answers: { "mixed-q1": "B", "mixed-q2": ["A", "C"], "mixed-q3": "先回忆，再核对和纠正。" },
    grades: { "mixed-q3": { score: 0.5, feedback: "还需要说明反馈的作用" } },
    gradingSession: { workspaceId: "workspace", chatId: "missing-empty-chat" },
  };
  const submitted = recordAttempt(course, emptyProgress(course), lesson.id, attempt);
  const restarted = resetAttempt(course, submitted, lesson.id);
  assert.equal(restarted.attempts[lesson.id], undefined);
  assert.deepEqual(restarted.history[lesson.id][0].answers, attempt.answers);
  assert.deepEqual(restarted.history[lesson.id][0].grades, attempt.grades);
  assert.equal(restarted.history[lesson.id][0].gradingSession, undefined);
  assert.equal(submitted.attempts[lesson.id].submittedAt, 100, "input is not mutated");
  assert.deepEqual(resetAttempt(course, restarted, lesson.id), restarted);
  const storage = memory();
  await repository(storage).saveProgress(course, restarted);
  const restored = await repository(storage).progress(course);
  assert.deepEqual(restored, restarted);
  assert.throws(() => assertCurrentReview(restored.attempts[lesson.id], attempt), /作答已更新/);
  const next = recordAttempt(course, restored, lesson.id, { submittedAt: 200, answers: { ...attempt.answers, "mixed-q3": "新的解释" } });
  assert.equal(next.history[lesson.id].length, 1);
  assert.equal(next.history[lesson.id][0].answers["mixed-q3"], "先回忆，再核对和纠正。");
  const again = resetAttempt(course, next, lesson.id);
  assert.deepEqual(again.history[lesson.id].map((entry) => entry.submittedAt), [200, 100]);
});

test("missing empty chats recover once while existing history and unrelated failures are preserved", async () => {
  let created = 0;
  const create = async () => ({ id: `replacement-${++created}` });
  const existing = { id: "existing", messages: ["kept"] };
  assert.equal(await recoverMissingChat(async () => existing, create), existing);
  assert.equal(created, 0);
  const replacement = await recoverMissingChat(async () => { throw new Error("未找到聊天记录"); }, create);
  assert.equal(replacement.id, "replacement-1");
  for (const message of ["网络连接失败", "无权访问工作区", "聊天记录损坏"]) {
    await assert.rejects(recoverMissingChat(async () => { throw new Error(message); }, create), new RegExp(message));
  }
  assert.equal(created, 1);
  await assert.rejects(recoverMissingChat(async () => { throw new Error("未找到聊天记录"); }, async () => { throw new Error("保存失败"); }), /保存失败/);
});
