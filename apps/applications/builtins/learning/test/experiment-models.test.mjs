import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(tmpdir(), "learning-model-tests-"));
test.after(() => rm(temporary, { recursive: true, force: true }));
const compiled = await build({
  stdin: {
    contents:
      'export * from "./main/expression"; export * from "./main/experiments"; export * from "./main/experimentPresets"; export * from "./main/interactiveCourse"; export * from "./main/functionCourse"; export * from "./main/course"; export * from "./main/workflow"; export * from "./main/repository"; export * from "./main/richContent"; export * from "./main/RichLesson"; export { renderToStaticMarkup } from "react-dom/server"; export { createElement } from "react";',
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  write: false,
});
const file = join(temporary, "models.cjs");
await writeFile(file, compiled.outputFiles[0].contents);
const {
  parseExpression,
  createExperimentPreset,
  experimentPresets,
  initialValues,
  evaluateExperiment,
  validateExperiment,
  validateExperimentPreview,
  checkModel,
  sampleExperiment,
  validateValues,
  nextObservation,
  restoreExperimentAttempt,
  upgradeLinearExperiment,
  interactiveCourse,
  functionCourse,
  validateCourse,
  validateLesson,
  restoreProgress,
  emptyProgress,
  repository,
  newDraft,
  editDraftLesson,
  acceptTask,
  revisionPrompt,
  renderFormula,
  Prose,
  FormulaContent,
  renderToStaticMarkup,
  createElement,
} = (await import(pathToFileURL(file).href)).default;
const clone = (value) => structuredClone(value);

test("scalar expressions use conventional precedence and bounded whitelisted operations", () => {
  for (const [source, expected] of [
    ["-2^2", -4],
    ["(-2)^2", 4],
    ["2^-2", 0.25],
    ["2^3^2", 512],
    ["1e-3 + 2e-3", 0.003],
    ["sqrt(9)+abs(-2)", 5],
    ["max(1,2,3)-min(4,5)", -1],
    ["round(2.4)+floor(3.9)+ceil(1.1)", 7],
    ["sin(pi/2)+log(e)", 2],
  ]) {
    const parsed = parseExpression(source);
    assert.ok(Math.abs(parsed.evaluate({}) - expected) < 1e-10, source);
    assert.match(renderFormula(parsed.latex), /<math/);
  }
  assert.equal(parseExpression("U/R").evaluate({ U: 12, R: 200 }), 0.06);
  assert.deepEqual(parseExpression("a*x^2+b*x+c").symbols, [
    "a",
    "x",
    "b",
    "c",
  ]);
  for (const source of [
    "globalThis",
    "constructor",
    "window.location",
    "x[0]",
    "x=2",
    "2;3",
    "alert(1)",
    "eval(1)",
    "import(1)",
    "sin(1,2)",
    "min(1)",
    "2x",
    "2**3",
    "1+",
    "(".repeat(30) + "1" + ")".repeat(30),
    "1+".repeat(100) + "1",
    "1".repeat(501),
  ])
    assert.throws(() => parseExpression(source), undefined, source);
  for (const source of ["1/0", "sqrt(-1)", "log(0)", "exp(1000)", "(-1)^0.5"])
    assert.throws(
      () => parseExpression(source).evaluate({}),
      undefined,
      source,
    );
  assert.throws(() => parseExpression("missing").evaluate({}), /缺少变量/);
});

test("all domain presets round-trip, compute real quantities and support dependent outputs", () => {
  for (const preset of experimentPresets) {
    const config = createExperimentPreset(preset.id);
    assert.deepEqual(
      validateExperiment(JSON.parse(JSON.stringify(config))),
      config,
    );
    for (const result of Object.values(
      evaluateExperiment(config, initialValues(config)),
    ))
      assert.ok(Number.isFinite(result));
    if (config.goal.mode !== "explore")
      assert.equal(checkModel(config, config.goal.reference).passed, true);
  }
  const ohm = createExperimentPreset("ohm"),
    values = initialValues(ohm);
  assert.deepEqual(evaluateExperiment(ohm, values), { I: 0.06, P: 0.72 });
  assert.deepEqual(evaluateExperiment(ohm, { ...values, R: 400 }), {
    I: 0.03,
    P: 0.36,
  });
  assert.deepEqual(evaluateExperiment(ohm, { ...values, closed: 0 }), {
    I: 0,
    P: 0,
  });
  assert.throws(() => evaluateExperiment(ohm, { ...values, R: 150 }), /选项/);
  assert.throws(
    () => evaluateExperiment(ohm, { ...values, closed: 2 }),
    /选项/,
  );
  const reversed = { ...ohm, outputs: [...ohm.outputs].reverse() };
  assert.deepEqual(evaluateExperiment(validateExperiment(reversed), values), {
    I: 0.06,
    P: 0.72,
  });
  assert.throws(
    () =>
      validateExperiment({
        ...ohm,
        outputs: [
          { ...ohm.outputs[0], expression: "P" },
          { ...ohm.outputs[1], expression: "I" },
        ],
      }),
    /循环/,
  );
  assert.throws(
    () =>
      validateExperiment({
        ...ohm,
        outputs: [{ ...ohm.outputs[0], expression: "unknown+1" }],
      }),
    /未定义/,
  );
});

test("model validation rejects invalid controls, identifiers, ranges and rendering budgets", () => {
  const base = createExperimentPreset("quadratic");
  for (const patch of [
    { version: 2 },
    { variables: [] },
    { outputs: [] },
    { variables: [...base.variables, ...base.variables] },
    { views: { values: false, graph: false, table: false } },
    { axis: { ...base.axis, variable: "missing" } },
    { axis: { ...base.axis, samples: 162 } },
    { axis: { ...base.axis, samples: 11.5 } },
    { axis: { ...base.axis, min: -100 } },
    {
      variables: base.variables.map((v, i) =>
        i ? v : { ...v, id: "constructor" },
      ),
    },
    { variables: base.variables.map((v, i) => (i ? v : { ...v, id: "x" })) },
    {
      variables: base.variables.map((v, i) => (i ? v : { ...v, initial: NaN })),
    },
    { variables: base.variables.map((v, i) => (i ? v : { ...v, step: 0 })) },
    {
      variables: base.variables.map((v, i) =>
        i ? v : { ...v, step: 0.000001 },
      ),
    },
    {
      variables: base.variables.map((v, i) =>
        i ? v : { ...v, control: "script" },
      ),
    },
    { outputs: [{ ...base.outputs[0], id: "a" }] },
    { outputs: [{ ...base.outputs[0], expression: "sqrt(-1)" }] },
  ])
    assert.throws(() => validateExperiment({ ...base, ...patch }));
  const small = {
    ...base,
    variables: [
      {
        id: "x",
        label: "微小量",
        unit: "",
        control: "number",
        min: 0,
        max: 1,
        step: 1e-9,
        initial: 1e-9,
      },
    ],
    outputs: [{ id: "y", label: "结果", unit: "", expression: "x*1e9" }],
    views: { values: true, graph: false, table: false },
  };
  assert.equal(evaluateExperiment(validateExperiment(small), { x: 1e-9 }).y, 1);
});

test("exploration and challenge checks validate reference answers without blocking author trial", () => {
  const explore = createExperimentPreset("quadratic");
  assert.equal(checkModel(explore, initialValues(explore)).passed, null);
  const target = createExperimentPreset("linear");
  assert.equal(checkModel(target, initialValues(target)).passed, false);
  assert.equal(
    checkModel(target, { ...target.goal.reference, x: -4 }).passed,
    true,
    "fixed target position is independent of the observation input",
  );
  const impossible = { ...target, goal: { ...target.goal, value: 100 } };
  assert.throws(() => validateExperiment(impossible), /参考参数/);
  assert.equal(validateExperimentPreview(impossible).goal.value, 100);
  assert.throws(
    () =>
      validateExperiment({
        ...target,
        goal: { ...target.goal, reference: {} },
      }),
    /须在/,
  );
  assert.ok(
    validateExperimentPreview({
      ...target,
      goal: { ...target.goal, reference: {} },
    }),
  );
  const range = createExperimentPreset("cost");
  assert.equal(checkModel(range, range.goal.reference).passed, true);
  assert.equal(checkModel(range, initialValues(range)).passed, false);
  assert.throws(
    () =>
      validateExperiment({
        ...range,
        goal: { ...range.goal, min: 100, max: 0 },
      }),
    /下限/,
  );
  const boundary = {
    ...target,
    goal: { ...target.goal, tolerance: 0.1, value: 5.1 },
  };
  assert.equal(checkModel(boundary, target.goal.reference).passed, true);
  assert.equal(
    checkModel(
      { ...boundary, goal: { ...boundary.goal, value: 5.1001 } },
      target.goal.reference,
    ).passed,
    false,
  );
});

test("curves use bounded sampling, detect undefined gaps, and compare only declared axes", () => {
  const base = createExperimentPreset("quadratic");
  const curve = {
    ...base,
    goal: {
      mode: "curve",
      output: "y",
      expression: "x^2",
      tolerance: 0.05,
      reference: initialValues(base),
    },
  };
  assert.equal(
    checkModel(validateExperiment(curve), initialValues(base)).passed,
    true,
  );
  assert.equal(
    checkModel(curve, { ...initialValues(base), c: 1 }).passed,
    false,
  );
  assert.throws(
    () =>
      validateExperiment({
        ...curve,
        goal: { ...curve.goal, expression: "a*x^2" },
      }),
    /只能使用横轴/,
  );
  assert.throws(
    () =>
      validateExperiment({
        ...curve,
        goal: { ...curve.goal, expression: "1/x" },
      }),
    /未定义/,
  );
  const singular = validateExperiment({
    ...base,
    outputs: [{ ...base.outputs[0], expression: "1/x" }],
  });
  const samples = sampleExperiment(singular, initialValues(singular), 11);
  assert.equal(samples.length, 11);
  assert.equal(samples[5].outputs, null);
  assert.equal(samples[0].outputs.y, -0.2);
  assert.equal(
    sampleExperiment(singular, initialValues(singular), 100000).length,
    161,
  );
});

test("observations stay bounded, validate on restore, and are independent of lesson completion", async () => {
  const course = clone(interactiveCourse),
    lesson = course.lessons[0],
    config = lesson.experiment;
  let attempt;
  for (let i = 0; i < 12; i++)
    attempt = nextObservation({ ...initialValues(config), a: i % 3 }, attempt);
  assert.equal(attempt.history.length, 8);
  assert.deepEqual(
    restoreExperimentAttempt(config, JSON.parse(JSON.stringify(attempt))),
    attempt,
  );
  assert.equal(
    restoreExperimentAttempt(config, {
      ...attempt,
      values: { ...attempt.values, a: 999 },
    }),
    undefined,
  );
  assert.equal(
    restoreExperimentAttempt(config, { k: 1, b: 1, checkedAt: 1 }),
    undefined,
  );
  const badHistory = clone(attempt);
  badHistory.history[0].values.a = 999;
  assert.equal(restoreExperimentAttempt(config, badHistory).history.length, 7);
  const progress = {
    ...emptyProgress(course),
    experiments: { [lesson.id]: attempt },
  };
  assert.deepEqual(restoreProgress(course, progress).completed, []);
  const data = new Map();
  let fail = false;
  const storage = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      if (fail) throw new Error("disk");
      data.set(key, clone(value));
    },
    removeItem: async (key) => data.delete(key),
    keys: async () => [...data.keys()],
    clear: async () => data.clear(),
  };
  await repository(storage).save(course);
  await repository(storage).saveProgress(course, progress);
  assert.deepEqual(
    (await repository(storage).progress(course)).experiments,
    progress.experiments,
  );
  fail = true;
  await assert.rejects(
    repository(storage).saveProgress(course, { ...progress, experiments: {} }),
    /disk/,
  );
  assert.deepEqual(
    (await repository(storage).progress(course)).experiments,
    progress.experiments,
  );
  const revised = clone(course);
  revised.lessons[0] = validateLesson(
    { ...lesson, experiment: { ...config, task: "新任务" } },
    "new-content",
  );
  assert.equal(restoreProgress(revised, progress).experiments, undefined);
});

test("old linear courses and records remain unchanged and can be explicitly upgraded", () => {
  assert.deepEqual(validateCourse(clone(functionCourse)), functionCourse);
  const lesson = functionCourse.lessons[1],
    old = { k: 2, b: 1, checkedAt: 123 };
  assert.deepEqual(restoreExperimentAttempt(lesson.experiment, old), old);
  const draft = newDraft(
    { topic: "函数", level: "零基础", material: "" },
    functionCourse,
  );
  const slot = draft.outline.lessons[1];
  assert.equal(
    editDraftLesson(draft, slot.id, slot.lesson).outline.lessons[1].lesson.id,
    lesson.id,
  );
  const upgraded = validateExperiment(
    upgradeLinearExperiment(lesson.experiment),
  );
  assert.equal(checkModel(upgraded, { k: 2, b: 1, x: 2 }).passed, true);
  assert.equal(upgraded.goal.at.value, 2);
  const fractional = validateExperiment({
    ...lesson.experiment,
    target: { x: 1 / 3, y: 1, tolerance: 0.01 },
  });
  const precise = validateExperiment(upgradeLinearExperiment(fractional));
  assert.equal(precise.goal.at.value, 1 / 3);
  assert.equal(initialValues(precise).x, 0.333333);
  assert.equal(checkModel(precise, precise.goal.reference).passed, true);
});

test("formulas derive from model expressions, persist explanations and update through AI adoption", () => {
  assert.deepEqual(validateCourse(clone(interactiveCourse)), interactiveCourse);
  const lesson = clone(interactiveCourse.lessons[0]);
  lesson.experiment.outputs[0].expression = "a*x^2+c";
  const validated = validateLesson(lesson, lesson.id);
  assert.doesNotMatch(validated.blocks[1].latex, /b/);
  assert.match(validated.content, /a/);
  assert.throws(
    () => validateLesson({ ...lesson, experiment: undefined }, lesson.id),
    /关联的实验/,
  );
  assert.throws(
    () =>
      validateLesson(
        {
          ...lesson,
          blocks: [{ ...lesson.blocks[1], experimentOutput: "missing" }],
        },
        lesson.id,
      ),
    /关联的实验结果/,
  );
  const ohm = clone(interactiveCourse.lessons[1]);
  assert.equal(ohm.blocks[1].symbols.length, 4);
  assert.equal(ohm.blocks[1].steps.length, 3);
  assert.match(ohm.content, /电压/);
  assert.match(ohm.content, /代入得到电流/);
  const draft = newDraft(
    { topic: "互动实验", level: "零基础", material: "" },
    interactiveCourse,
  );
  const slot = draft.outline.lessons[0];
  draft.task = {
    kind: "revise",
    targetId: slot.id,
    instruction: "去掉一次项",
    ref: { workspaceId: "w", chatId: "c" },
  };
  const adopted = acceptTask(
    draft,
    JSON.stringify({ changes: { experiment: lesson.experiment } }),
  );
  assert.equal(
    adopted.outline.lessons[0].lesson.blocks[1].latex,
    validated.blocks[1].latex,
  );
  assert.match(revisionPrompt(draft, slot.id), /expression/);
});

test("inline and display math render semantically while code, links and descriptions stay inert", () => {
  const html = renderToStaticMarkup(
    createElement(Prose, {
      text: "行内 $x^2$。\n\n$$\n\\frac{U}{R}\n$$\n\n`$literal$`\n\n```js\n$x^2$\n```\n\n<script>alert(1)</script>",
    }),
  );
  assert.match(html, /learn-inline-formula/);
  assert.match(html, /<math/);
  assert.equal((html.match(/<math/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<pre><div|<p><div|<script/);
  assert.match(html, /\$literal\$/);
  assert.match(html, /language-js/);
  const lesson = clone(interactiveCourse.lessons[1]);
  lesson.blocks[1].symbols[0].meaning = '<img src=x onerror="bad()">';
  const formula = renderToStaticMarkup(
    createElement(FormulaContent, {
      block: lesson.blocks[1],
      experiment: lesson.experiment,
    }),
  );
  assert.match(formula, /&lt;img/);
  assert.doesNotMatch(formula, /<img/);
  assert.match(formula, /公式推导步骤/);
});
