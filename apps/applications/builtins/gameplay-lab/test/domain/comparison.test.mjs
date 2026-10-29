import { finishExperiment } from "../helpers/experiments.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { f } from "../helpers/domain.mjs";

function comparisonFixture() {
  const base = f.makeTemplate(),
    project = {
      id: "project-compare",
      model: structuredClone(base),
      versions: [
        {
          id: "version-base",
          name: "成本 8",
          model: base,
          createdAt: new Date().toISOString(),
        },
      ],
    },
    config = f.defaultPlaytest(project.id);
  config.scenarios[0].seedCount = 2;
  config.comparedStrategies = ["goal"];
  return { base, project, config };
}
const studyCost = { kind: "cost", action: "study", index: 0 };
test("version comparisons freeze shared opening values and independently execute each rule snapshot", () => {
  const { base, project, config } = comparisonFixture();
  project.model.actions.find((a) => a.id === "study").costs[0].value = 16;
  project.model.fields.find((f) => f.id === "materials").initial = 900;
  const e = f.prepareComparison(project, config, {
    mode: "versions",
    baseline: "version-base",
    candidate: "draft",
  });
  assert.equal(e.format, "gameplay-experiment-v4");
  assert.equal(f.experimentTotal(e), 4);
  assert.equal(e.setup.scenario.participants[0].values.materials, 40);
  assert.equal(f.variantModel(e, "candidate").fields[0].initial, 900);
  project.model.actions[1].costs[0].value = 999;
  config.scenarios[0].participants[0].values.materials = 1;
  finishExperiment(e);
  for (const s of e.samples)
    assert.equal(
      f.restoreLog(
        f.sampleModel(e, s),
        s.seed,
        e.players,
        s.log,
        f.initialOf(e.setup.scenario),
      ).entries[0].state.players[0].values.materials,
      40,
    );
  assert.equal(f.variantModel(e, "candidate").actions[1].costs[0].value, 16);
  const difference = f.pairedDifference(e, "candidate", "goal");
  assert.equal(difference.count, 2);
  assert.ok(difference.steps > 0);
  assert.equal(difference.players[0].rate, 0);
  assert.equal(f.experimentRows(e).length, 2);
  assert.ok(
    f
      .ruleChanges(base, f.variantModel(e, "candidate"))
      .some((d) => d.label.includes("成本") && d.after.includes("16")),
  );
  assert.deepEqual(
    f.parseRecord(JSON.parse(JSON.stringify(e)), e.projectId),
    e,
  );
});
test("parameter scans deduplicate the baseline and modify only the requested numeric rule", () => {
  const { project, config } = comparisonFixture(),
    original = structuredClone(project);
  const e = f.prepareComparison(project, config, {
    mode: "parameter",
    baseline: "draft",
    scan: { parameter: studyCost, from: 4, to: 12, step: 4 },
  });
  assert.deepEqual(
    e.comparison.variants.map((v) => v.value),
    [8, 4, 12],
  );
  assert.equal(f.experimentTotal(e), 6);
  assert.deepEqual(project, original);
  for (const v of e.comparison.variants)
    assert.deepEqual(
      f.variantModel(e, v.id),
      f.withParameter(original.model, studyCost, v.value),
    );
  e.samples.push(f.nextSample(e));
  assert.equal(f.pairedDifference(e, "value-4", "goal").count, 0);
  assert.equal(f.pairedDifference(e, "value-4", "goal").steps, null);
  let interrupted = f.parseRecord(JSON.parse(JSON.stringify(e)), e.projectId);
  assert.equal(interrupted.status, "interrupted");
  finishExperiment(interrupted);
  assert.equal(
    new Set(
      interrupted.samples.map((s) => `${s.variant}:${s.policy}:${s.index}`),
    ).size,
    6,
  );
  assert.ok(f.pairedDifference(interrupted, "value-4", "goal").steps < 0);
  assert.ok(f.pairedDifference(interrupted, "value-12", "goal").steps > 0);
  assert.deepEqual(
    f.parseRecord(JSON.parse(JSON.stringify(interrupted)), e.projectId),
    interrupted,
  );
});
test("paired differences use only matching successful seeds and distinguish exceptions from truncation", () => {
  const { project, config } = comparisonFixture(),
    e = f.prepareComparison(project, config, {
      mode: "parameter",
      baseline: "draft",
      scan: { parameter: studyCost, from: 4, to: 4, step: 1 },
    });
  e.samples.push(f.nextSample(e));
  e.samples.push(f.nextSample(e)); // complete baseline seeds
  e.samples.push(f.nextSample(e));
  assert.equal(f.pairedDifference(e, "value-4", "goal").count, 1);
  const row = f.experimentRows(e).find((r) => r.variant === "value-4");
  assert.equal(row.completed, 1);
  const errorModel = f.makeTemplate();
  errorModel.actions[1].effects = [
    { type: "add", field: "research", value: 1, from: "materials" },
  ];
  project.model = errorModel;
  project.versions = [];
  const failing = f.prepareComparison(project, config, {
    mode: "parameter",
    baseline: "draft",
    scan: {
      parameter: {
        kind: "effect",
        action: "study",
        index: 0,
        property: "value",
      },
      from: 1000000,
      to: 1000000,
      step: 1,
    },
  });
  finishExperiment(failing);
  const delta = f.pairedDifference(failing, "value-1000000", "goal");
  assert.equal(delta.count, 0);
  assert.equal(delta.steps, null);
  const failed = f
    .experimentRows(failing)
    .find((r) => r.variant === "value-1000000");
  assert.equal(failed.error, 2);
  assert.equal(failed.completed, 0);
  assert.equal(failed.limited, 0);
  assert.doesNotThrow(() =>
    f.parseRecord(JSON.parse(JSON.stringify(failing)), failing.projectId),
  );
});
test("comparison plans reject invalid ranges, unsupported fields, incompatible openings and excess work", () => {
  const { project, config } = comparisonFixture(),
    scan = (parameter, from, to, step) =>
      f.prepareComparison(project, config, {
        mode: "parameter",
        baseline: "draft",
        scan: { parameter, from, to, step },
      });
  assert.throws(() => scan(studyCost, 1, 20, 1), /11/);
  assert.throws(() => scan(studyCost, 1, 2, 0), /范围|步长/);
  assert.throws(() => scan(studyCost, 8, 8, 1), /不同于基准/);
  assert.throws(() =>
    scan({ kind: "goal", goal: project.model.goals[0].id }, 0, 2, 1),
  );
  assert.throws(
    () =>
      scan(
        { kind: "effect", action: "study", index: 0, property: "__proto__" },
        1,
        2,
        1,
      ),
    /不存在/,
  );
  assert.throws(
    () =>
      f.prepareComparison(project, config, {
        mode: "versions",
        baseline: "draft",
        candidate: "draft",
      }),
    /不同/,
  );
  project.model.fields.push({
    id: "new-field",
    name: "新字段",
    description: "",
    role: "stock",
    initial: 0,
  });
  assert.throws(
    () =>
      f.prepareComparison(project, config, {
        mode: "versions",
        baseline: "version-base",
        candidate: "draft",
      }),
    /标识/,
  );
  project.model = structuredClone(project.versions[0].model);
  config.scenarios[0].seedCount = 12;
  config.strategies.push({
    ...structuredClone(f.builtinStrategies[0]),
    id: "strategy-four",
    name: "第四策略",
  });
  config.comparedStrategies = ["goal", "growth", "random", "strategy-four"];
  assert.throws(() => scan(studyCost, 1, 11, 1), /240/);
});
test("v3 readers reject altered sweep rules, duplicate sample cells and unknown variants", () => {
  const { project, config } = comparisonFixture(),
    e = finishExperiment(
      f.prepareComparison(project, config, {
        mode: "parameter",
        baseline: "draft",
        scan: { parameter: studyCost, from: 4, to: 4, step: 1 },
      }),
    );
  const extra = structuredClone(e);
  extra.comparison.variants[1].model.flow.maxRounds = 99;
  assert.throws(() => f.parseRecord(extra, e.projectId), /格式/);
  const duplicate = structuredClone(e);
  duplicate.samples[3] = duplicate.samples[2];
  assert.throws(() => f.parseRecord(duplicate, e.projectId));
  const unknown = structuredClone(e);
  unknown.samples[0].variant = "missing";
  assert.throws(() => f.parseRecord(unknown, e.projectId));
  const incomplete = structuredClone(e);
  incomplete.samples.pop();
  assert.throws(() => f.parseRecord(incomplete, e.projectId));
  assert.deepEqual(
    f.ruleChanges(project.model, structuredClone(project.model)),
    [],
  );
  const reordered = structuredClone(project.model);
  reordered.actions.reverse();
  assert.ok(
    f
      .ruleChanges(project.model, reordered)
      .some((c) => c.label.includes("行动顺序")),
  );
});
