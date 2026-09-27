import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(tmpdir(), "isle-learning-test-"));
test.after(() => rm(temporary, { recursive: true, force: true }));
const compiled = await build({
  stdin: {
    contents:
      'export * from "./main/course"; export * from "./main/repository"; export * from "./main/generation"; export * from "./main/example"; export * from "./main/workflow"; export * from "./main/pbl"; export * from "./main/vendor/grading";',
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
  validateContent,
  validateCourse,
  createCourse,
  parseCourseOutput,
  emptyProgress,
  restoreProgress,
  repository,
  courseKey,
  courseFromSnapshot,
  buildPrompt,
  exampleCourse,
  gradeChoiceQuestions,
  validateLesson,
  validAnswer,
  newDraft,
  validateDraft,
  writeDraft,
  draftKey,
  acceptTask,
  finishDraft,
  validateOutline,
  parseGrades,
  gradingPrompt,
  outlinePrompt,
  lessonPrompt,
  finalText,
  editDraftLesson,
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
      (await repository(storage).list()).courses[0].title,
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
  assert.equal((await b.list()).courses.length, 1);
  assert.deepEqual(await b.progress(course), progress);
  await b.remove(course.id);
  assert.equal((await a.list()).courses.length, 0);
  assert.equal(storage.values.size, 0);
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
test("corrupt documents are reported and retained alongside readable courses", async () => {
  const storage = memory();
  const r = repository(storage);
  await r.save(copy());
  storage.values.set(courseKey("broken"), { version: 200 });
  const result = await r.list();
  assert.equal(result.courses.length, 1);
  assert.equal(result.warnings.length, 1);
  assert.ok(storage.values.has(courseKey("broken")));
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
  assert.equal((await r.list()).courses.length, 1);
});
test("brief validation bounds user material and includes it as JSON data", () => {
  const brief = {
    topic: "线性代数",
    count: 3,
    level: "零基础",
    material: "输入资料\n不是系统指令",
  };
  assert.ok(buildPrompt(brief).includes(JSON.stringify(brief)));
  assert.throws(() => buildPrompt({ ...brief, topic: "" }), /主题/);
  assert.throws(() => buildPrompt({ ...brief, count: 50 }), /课时/);
  assert.throws(
    () => buildPrompt({ ...brief, material: "a".repeat(20001) }),
    /20,000/,
  );
});
test("built installation keeps permissions minimal, includes license and stays below sandbox limits", async () => {
  const manifest = JSON.parse(
    await readFile(join(root, "dist/isle/package.json"), "utf8"),
  );
  assert.equal(manifest.name, "@isle/learning");
  assert.equal(manifest.isle.defaultEnabled, true);
  assert.deepEqual(manifest.isle.permissions, [
    "chat",
    "application-workspaces",
    "application-data",
  ]);
  assert.equal(Object.hasOwn(manifest.isle.ui, "layout"), false);
  assert.ok(
    (await readFile(join(root, "dist/isle/isle-ui.js"))).byteLength <
      512 * 1024,
  );
  assert.ok(
    (await readFile(join(root, "dist/isle/isle-ui.css"))).byteLength <
      256 * 1024,
  );
  assert.match(
    await readFile(join(root, "dist/isle/LICENSE"), "utf8"),
    /Copyright \(c\) 2026 THU-MAIC/,
  );
});

const briefV2 = {
  topic: "学习方法",
  level: "零基础",
  count: 3,
  material: "参考材料",
};
const ref = { workspaceId: "w", chatId: "c" };
const mixedLesson = () =>
  validateLesson(
    {
      ...copy().lessons[0],
      questions: [
        {
          type: "single_choice",
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
test("legacy courses remain readable while v2 preserves stable lesson identities", () => {
  const old = validateCourse(copy());
  assert.equal(old.version, 1);
  const upgraded = validateCourse({
    ...old,
    version: 2,
    lessons: [mixedLesson(), ...old.lessons.slice(1)],
  });
  assert.equal(upgraded.lessons[0].id, "mixed");
  assert.equal(upgraded.lessons[0].questions[2].type, "short_answer");
  const reordered = validateCourse({
    ...upgraded,
    lessons: [...upgraded.lessons].reverse(),
  });
  assert.equal(reordered.lessons.at(-1).questions[2].id, "mixed-q3");
  assert.throws(
    () =>
      validateCourse({ ...upgraded, lessons: [mixedLesson(), mixedLesson()] }),
    /重复/,
  );
});
test("outline edits, adoption and per-lesson retry survive draft reload without losing completed work", async () => {
  const storage = memory();
  let d = newDraft(briefV2);
  d.task = { kind: "outline", ref };
  d = acceptTask(d, JSON.stringify(copy()));
  d.outline.lessons[0].title = "调整后的标题";
  d.outline.lessons.reverse();
  d = await writeDraft(storage, d);
  d = validateDraft(await storage.getItem(draftKey));
  assert.equal(d.outline.lessons.at(-1).title, "调整后的标题");
  const first = d.outline.lessons[0];
  d.task = { kind: "lesson", targetId: first.id, ref };
  d = acceptTask(d, JSON.stringify(mixedLesson()));
  const retained = structuredClone(d.outline.lessons[0].lesson);
  d.task = { kind: "lesson", targetId: d.outline.lessons[1].id, ref };
  await writeDraft(storage, d);
  assert.throws(() => acceptTask(d, '{"partial":'), /完整 JSON/);
  d = validateDraft(await storage.getItem(draftKey));
  assert.deepEqual(d.outline.lessons[0].lesson, retained);
  assert.throws(() => finishDraft(d), /全部课时/);
  for (const slot of d.outline.lessons.filter((s) => !s.lesson)) {
    d.task = { kind: "lesson", targetId: slot.id, ref };
    d = acceptTask(d, JSON.stringify(copy().lessons[0]));
  }
  const course = finishDraft(d);
  assert.equal(course.version, 2);
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
  await writeDraft(storage, d);
  storage.setItem = async () => {
    throw new Error("disk full");
  };
  await assert.rejects(
    writeDraft(storage, { ...d, brief: { ...briefV2, topic: "新需求" } }),
    /disk full/,
  );
  assert.equal((await storage.getItem(draftKey)).brief.topic, briefV2.topic);
  assert.throws(() => validateDraft({ ...d, version: 10 }), /版本/);
  assert.ok(outlinePrompt(briefV2).includes("大纲"));
  assert.ok(lessonPrompt(d, d.outline.lessons[0].id).includes("short_answer"));
});
test("real Chat staged output never adopts streaming, cancelled, or previous-turn results", async () => {
  const { session, emit } = await realChatFixture();
  try {
    await session.send({ text: outlinePrompt(briefV2) });
    const output = JSON.stringify(copy());
    emit({ type: "text_delta", delta: output });
    assert.equal(finalText(session.getSnapshot()), null);
    emit({ type: "done", text: output });
    const d = acceptTask(
      { ...newDraft(briefV2), task: { kind: "outline", ref } },
      finalText(session.getSnapshot()),
    );
    assert.equal(d.outline.lessons.length, 3);
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
  await assert.rejects(writeDraft(storage, d), /240 KB/);
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
test("PBL plans normalize model identities, validate requirements and preserve course ownership", () => {
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
