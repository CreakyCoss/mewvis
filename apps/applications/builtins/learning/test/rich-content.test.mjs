import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(tmpdir(), "learning-rich-content-"));
test.after(() => rm(temporary, { recursive: true, force: true }));
const compiled = await build({
  stdin: {
    contents:
      'export * from "./main/richContent"; export * from "./main/course"; export * from "./main/workflow"; export * from "./main/repository"; export * from "./main/functionCourse"; export * from "./main/example"; export * from "./main/RichLesson"; export { renderToStaticMarkup } from "react-dom/server"; export { createElement } from "react";',
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  write: false,
});
const file = join(temporary, "rich.cjs");
await writeFile(file, compiled.outputFiles[0].contents);
const {
  functionCourse,
  exampleCourse,
  validateBlocks,
  blocksToText,
  validateContent,
  validateCourse,
  validateLesson,
  createCourse,
  defaultExperiment,
  validateExperiment,
  checkExperiment,
  renderFormula,
  emptyProgress,
  restoreProgress,
  repository,
  newDraft,
  editDraftLesson,
  finishDraft,
  acceptTask,
  revisionPrompt,
  lessonPrompt,
  draftWithLessonForm,
  assertUnchangedLessonForm,
  RichLesson,
  renderToStaticMarkup,
  createElement,
} = (await import(pathToFileURL(file).href)).default;
const clone = (value) => structuredClone(value);
const brief = { topic: "用函数理解变化", level: "零基础", material: "" };
const richLesson = () => clone(functionCourse.lessons[1]);
function memory() {
  const data = new Map();
  return {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => data.set(key, clone(value)),
    removeItem: async (key) => data.delete(key),
    keys: async () => [...data.keys()],
    clear: async () => data.clear(),
  };
}

test("rich lessons round-trip through saved courses, import, drafts and no-op edits", async () => {
  const course = clone(functionCourse);
  assert.deepEqual(validateCourse(JSON.parse(JSON.stringify(course))), course);
  const imported = createCourse(
    validateContent(JSON.parse(JSON.stringify(course))),
    "import",
  );
  assert.deepEqual(imported.lessons[1].blocks, course.lessons[1].blocks);
  assert.deepEqual(
    imported.lessons[1].experiment,
    course.lessons[1].experiment,
  );
  const draft = newDraft(brief, course),
    slot = draft.outline.lessons[1];
  const edited = editDraftLesson(draft, slot.id, slot.lesson);
  assert.equal(edited.outline.lessons[1].lesson.id, slot.lesson.id);
  assert.deepEqual(finishDraft(edited).lessons, course.lessons);
  assert.deepEqual(
    validateCourse(exampleCourse),
    exampleCourse,
    "legacy text remains unchanged",
  );
  const storage = memory();
  await storage.setItem("learning:data-version", "course-flow-v5");
  await repository(storage).save(course);
  await repository(storage).initialize(() => {
    throw new Error("must not clean up current data");
  });
  assert.deepEqual((await repository(storage).list())[0], course);
});

test("blocks derive the plain text context and reject malformed or oversized content", () => {
  const mixedIds = validateBlocks([
    { type: "text", text: "新节点" },
    { id: "block-1", type: "text", text: "原有节点" },
  ]);
  assert.notEqual(mixedIds[0].id, mixedIds[1].id);
  assert.equal(mixedIds[1].id, "block-1");
  const lesson = richLesson();
  assert.equal(lesson.content, blocksToText(lesson.blocks));
  lesson.content = "stale text from model";
  assert.equal(
    validateLesson(lesson, lesson.id).content,
    blocksToText(lesson.blocks),
  );
  for (const blocks of [
    [],
    Array.from({ length: 21 }, (_, i) => ({
      id: `b-${i}`,
      type: "text",
      text: "x",
    })),
    [{ type: "html", html: "<script>bad()</script>" }],
    [lesson.blocks[0], lesson.blocks[0]],
  ])
    assert.throws(() => validateBlocks(blocks));
  assert.throws(
    () => validateBlocks([{ ...lesson.blocks[2], nodes: [{ label: "one" }] }]),
    /2–8/,
  );
  assert.throws(
    () => validateBlocks([{ ...lesson.blocks[1], latex: "\\frac{" }]),
    /公式无效/,
  );
  assert.throws(
    () =>
      validateLesson(
        {
          ...lesson,
          blocks: [
            { type: "text", text: "a".repeat(5000) },
            { type: "code", code: "b".repeat(4000) },
          ],
        },
        lesson.id,
      ),
    /8?000/,
  );
});

test("renderers escape HTML, prevent remote images and untrusted math links, and preserve code", () => {
  const math = renderFormula(String.raw`\frac{x^2}{2} + \sqrt{y}`);
  assert.match(math, /<math/);
  assert.match(math, /<mfrac>/);
  assert.match(math, /<msqrt>/);
  assert.doesNotMatch(
    renderFormula(String.raw`\href{javascript:alert(1)}{click}`),
    /href\s*=/,
  );
  const html = renderToStaticMarkup(
    createElement(RichLesson, {
      blocks: validateBlocks([
        {
          type: "text",
          text: "**粗体**\n\n<script>alert(1)</script>\n\n[坏链接](javascript:alert(1))\n\n![外部图片](https://example.com/tracker.png)",
        },
        {
          type: "code",
          language: "HTML",
          code: '<img src=x onerror="alert(1)">',
        },
        {
          type: "formula",
          latex: "y = kx + b",
          caption: "<script>literal</script>",
        },
      ]),
    }),
  );
  assert.match(html, /<strong>粗体<\/strong>/);
  assert.doesNotMatch(html, /<script|<img|href="javascript:/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script&gt;literal/);
});

test("controlled experiments validate finite bounds, slider grids and reachable goals", () => {
  const base = defaultExperiment();
  assert.deepEqual(validateExperiment(base), base);
  for (const patch of [
    {
      parameters: {
        ...base.parameters,
        k: { min: 0.0000005, max: 1.0000005, step: 0.1, initial: 0.0000005 },
      },
    },
    { template: "custom-js" },
    { target: { x: 2, y: 99, tolerance: 0.05 } },
    { target: { x: 2, y: 5, tolerance: 0 } },
    {
      parameters: {
        ...base.parameters,
        k: { min: -3, max: 3, step: 0, initial: 1 },
      },
    },
    {
      parameters: {
        ...base.parameters,
        k: { min: 1, max: -1, step: 1, initial: 1 },
      },
    },
    {
      parameters: {
        ...base.parameters,
        k: { min: -100, max: 100, step: 0.01, initial: 1 },
      },
    },
    {
      parameters: {
        ...base.parameters,
        k: { min: -3, max: 3, step: 1, initial: 0.5 },
      },
    },
    {
      parameters: {
        ...base.parameters,
        b: { min: 0, max: 1, step: 0.3, initial: 0 },
      },
    },
    { target: { x: NaN, y: 5, tolerance: 0.05 } },
  ])
    assert.throws(() => validateExperiment({ ...base, ...patch }));
  assert.throws(
    () =>
      validateExperiment({
        ...base,
        parameters: {
          k: { min: 0, max: 1, step: 1, initial: 0 },
          b: { min: 0, max: 1, step: 1, initial: 0 },
        },
        target: { x: 1, y: 0.5, tolerance: 0.01 },
      }),
    /无法完成任务/,
    "a continuous solution is insufficient for discrete sliders",
  );
  assert.equal(checkExperiment(base, { k: 1, b: 1 }).passed, false);
  assert.equal(checkExperiment(base, { k: 2, b: 1 }).passed, true);
  assert.equal(checkExperiment(base, { k: 1, b: 3 }).passed, true);
  assert.throws(() => checkExperiment(base, { k: 2.05, b: 1 }), /步长/);
  assert.throws(() => checkExperiment(base, { k: 4, b: -3 }), /范围/);
  const tolerance = { ...base, target: { x: 0.1, y: 1.35, tolerance: 0.05 } };
  assert.equal(
    checkExperiment(tolerance, { k: 3, b: 1 }).passed,
    true,
    "floating point at tolerance boundary",
  );
});

test("experiment records persist independently of quizzes and are tied to lesson content", async () => {
  const course = clone(functionCourse),
    lesson = course.lessons[1];
  const storage = memory();
  const progress = emptyProgress(course);
  progress.completed = [course.lessons[0].id];
  progress.experiments = { [lesson.id]: { k: 2, b: 1, checkedAt: 123 } };
  await repository(storage).saveProgress(course, progress);
  const reloaded = await repository(storage).progress(course);
  assert.deepEqual(reloaded, progress);
  assert.deepEqual(reloaded.attempts, {});
  const malformed = clone(progress);
  malformed.experiments[lesson.id] = {
    k: Infinity,
    b: 1,
    checkedAt: 123,
    passed: true,
  };
  assert.equal(restoreProgress(course, malformed).experiments, undefined);
  const draft = newDraft(brief, course),
    slot = draft.outline.lessons[1];
  const updated = finishDraft(
    editDraftLesson(draft, slot.id, {
      ...lesson,
      experiment: {
        ...lesson.experiment,
        target: { x: 2, y: 4, tolerance: 0.05 },
      },
    }),
  );
  const restored = restoreProgress(updated, progress);
  assert.equal(restored.experiments, undefined);
  assert.deepEqual(restored.completed, progress.completed);
  const saved = clone(await storage.getItem(`learning:progress:${course.id}`));
  storage.setItem = async () => {
    throw new Error("disk full");
  };
  await assert.rejects(
    repository(storage).saveProgress(course, { ...progress, experiments: {} }),
    /disk full/,
  );
  assert.deepEqual(
    await storage.getItem(`learning:progress:${course.id}`),
    saved,
  );
});

test("AI adoption supports rich blocks and experiments without silently losing prior content", () => {
  const course = clone(functionCourse),
    draft = newDraft(brief, course),
    slot = draft.outline.lessons[1];
  draft.task = {
    kind: "revise",
    targetId: slot.id,
    instruction: "完善公式说明",
    ref: { workspaceId: "w", chatId: "c" },
  };
  assert.match(lessonPrompt(draft, slot.id), /linear-function/);
  assert.match(revisionPrompt(draft, slot.id), /完整 blocks/);
  assert.throws(
    () =>
      acceptTask(draft, JSON.stringify({ changes: { content: "替换正文" } })),
    /通过 blocks/,
  );
  const blocks = clone(slot.lesson.blocks);
  blocks[1].caption = "当 x 增加 1，y 增加 k。";
  const adopted = acceptTask(draft, JSON.stringify({ changes: { blocks } }));
  assert.equal(
    adopted.outline.lessons[1].lesson.blocks[1].caption,
    blocks[1].caption,
  );
  assert.deepEqual(
    adopted.outline.lessons[1].lesson.experiment,
    slot.lesson.experiment,
  );
  assert.deepEqual(adopted.outline.lessons[0], draft.outline.lessons[0]);
  assert.equal(
    acceptTask(draft, JSON.stringify({ changes: { experiment: null } })).outline
      .lessons[1].lesson.experiment,
    undefined,
  );
  assert.throws(
    () =>
      acceptTask(
        draft,
        JSON.stringify({
          changes: { experiment: { template: "javascript", code: "alert(1)" } },
        }),
      ),
    /模板/,
  );
});

test("AI snapshots include unsaved rich edits and refuse to overwrite newer form changes", () => {
  const draft = newDraft(brief, clone(functionCourse)),
    slot = draft.outline.lessons[1];
  const form = clone(slot.lesson);
  form.blocks[1].caption = "手动补充的说明";
  const snapshot = draftWithLessonForm(draft, slot.id, form);
  assert.equal(snapshot.outline.lessons[1].lesson.id, slot.lesson.id);
  assert.equal(
    snapshot.outline.lessons[1].lesson.blocks[1].caption,
    "手动补充的说明",
  );
  assert.notEqual(
    draft.outline.lessons[1].lesson.blocks[1].caption,
    "手动补充的说明",
  );
  snapshot.task = {
    kind: "revise",
    targetId: slot.id,
    instruction: "更新示例",
    ref: { workspaceId: "w", chatId: "c" },
  };
  const adopted = acceptTask(
    snapshot,
    JSON.stringify({ changes: { example: "新的示例" } }),
  );
  assert.equal(
    adopted.outline.lessons[1].lesson.blocks[1].caption,
    "手动补充的说明",
  );
  const expected = JSON.stringify(form);
  assert.doesNotThrow(() => assertUnchangedLessonForm(expected, clone(form)));
  form.blocks[1].caption = "生成期间继续修改";
  assert.throws(
    () => assertUnchangedLessonForm(expected, form),
    /生成期间课时已修改/,
  );
  assert.throws(
    () => assertUnchangedLessonForm(expected, undefined),
    /生成期间课时已修改/,
  );
});
