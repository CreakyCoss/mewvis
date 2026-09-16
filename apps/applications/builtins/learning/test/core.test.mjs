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
      'export * from "./main/course"; export * from "./main/repository"; export * from "./main/generation"; export * from "./main/example"; export * from "./main/vendor/grading";',
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
  assert.equal(validateCourse(generated).version, 1);
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
  assert.throws(() => validateCourse({ ...copy(), version: 2 }), /版本/);
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
  assert.equal(manifest.isle.ui.layout, "fullscreen");
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
