import { finishExperiment } from "../helpers/experiments.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { f } from "../helpers/domain.mjs";

function userRules(kind = "resource-turns") {
  const model = f.blankModel("我自己的游戏");
  model.fields = [
    {
      id: "user-points",
      name: "灵感",
      description: "自己的指标",
      initial: 0,
      role: "progress",
    },
  ];
  model.actions = [
    {
      id: "user-create",
      name: "创作",
      description: "自己的行动",
      costs: [],
      requires: [],
      effects: [{ type: "add", field: "user-points", value: 3 }],
    },
  ];
  model.goals = [
    {
      id: "user-finish",
      name: "完成作品",
      description: "自己的目标",
      field: "user-points",
      threshold: 6,
    },
  ];
  if (kind === "card-combination") {
    model.collections = [
      {
        id: "user-deck",
        name: "灵感牌",
        handSize: 1,
        maxSelect: 1,
        cards: [
          { id: "user-red", name: "晨光", group: "暖", value: 2 },
          { id: "user-blue", name: "夜色", group: "冷", value: 4 },
        ],
      },
    ];
    model.actions[0].effects = [
      {
        type: "combination",
        collection: "user-deck",
        field: "user-points",
        multiplierValue: 1,
        pairBonus: 0,
      },
    ];
  }
  return model;
}
test("blank projects contain no example definitions and remain editable before readiness", () => {
  const model = f.blankModel("空白");
  for (const key of [
    "fields",
    "capabilities",
    "actions",
    "goals",
    "collections",
  ])
    assert.deepEqual(model[key], []);
  assert.deepEqual(f.validateModel(model, true), []);
  assert.equal(f.modelReadiness(model, null).length, 4);
  assert.equal(
    f.modelReadiness(model, { id: "resource-turns", version: 1 }).length,
    3,
  );
  assert.ok(
    f
      .modelReadiness(model, { id: "card-combination", version: 1 })
      .some((i) => i.path === "牌池"),
  );
  assert.ok(
    f
      .modelReadiness(model, { id: "future-sim", version: 99 })
      .some((i) => i.view === "simulator"),
  );
});
test("both simulators run hand-authored rules without any example IDs and freeze their versions", () => {
  for (const id of ["resource-turns", "card-combination"]) {
    const model = userRules(id),
      simulator = { id, version: 1 },
      config = f.defaultPlaytest("user-project"),
      setup = f.selectedSetup(config, model);
    assert.deepEqual(f.modelReadiness(model, simulator), []);
    const trial = f.newTrial("user-project", model, 42, 1, setup, simulator);
    while (!f.current(trial.run).outcome) {
      const cards =
        id === "card-combination"
          ? [
              f.current(trial.run).players[0].collections["user-deck"].hand[0]
                .id,
            ]
          : undefined;
      trial.run = f.advanceSimulatedRun(trial.run, {
        action: "user-create",
        ...(cards ? { cards } : {}),
      });
      trial.drivers.push("manual");
    }
    assert.equal(f.current(trial.run).outcome.kind, "won");
    assert.equal(trial.run.entries.length, 3);
    assert.equal(f.trialDocument(trial).format, "gameplay-run-v3");
    assert.deepEqual(
      f.parseRecord(
        JSON.parse(JSON.stringify(f.trialDocument(trial))),
        trial.projectId,
      ),
      trial,
    );
    assert.deepEqual(
      f.replay(
        trial.run,
        trial.run.entries.slice(1).map((e) => e.choice),
      ),
      trial.run,
    );
    const invalid = f.trialDocument(trial);
    invalid.simulator.version = 99;
    assert.throws(() => f.parseRecord(invalid, trial.projectId), /不支持/);
    assert.equal(model.fields[0].initial, 0);
  }
});
test("simulator readiness blocks unsupported rules instead of ignoring card mechanisms", () => {
  const model = userRules("card-combination");
  assert.throws(
    () => f.createSimulatedRun({ id: "resource-turns", version: 1 }, model),
    /集合|牌池|组合计分/,
  );
  assert.throws(
    () =>
      f.createSimulatedRun({ id: "card-combination", version: 1 }, userRules()),
    /牌池|计分/,
  );
  assert.throws(
    () =>
      f.createSimulatedRun({ id: "resource-turns", version: 99 }, userRules()),
    /不支持/,
  );
  model.actions[0].effects = [];
  assert.ok(
    f
      .modelReadiness(model, { id: "card-combination", version: 1 })
      .some((i) => i.nodeId === "user-create"),
  );
});
test("card scoring supports neutral fixed multipliers and scanning without a multiplier state", () => {
  const model = userRules("card-combination"),
    ref = { id: "card-combination", version: 1 };
  const run = f.createSimulatedRun(ref, model, 42);
  assert.equal(model.fields.length, 1);
  const selected = f.chooseConfigured(run, f.builtinStrategies[0]);
  const next = f.advanceSimulatedRun(run, selected),
    value = f.current(run).players[0].collections["user-deck"].hand[0].value;
  assert.equal(f.current(next).players[0].values["user-points"], value);
  const option = f
    .parameterOptions(model)
    .find((o) => o.ref.property === "multiplierValue");
  assert.ok(option);
  const twice = f.withParameter(model, option.ref, 2);
  assert.equal(twice.actions[0].effects[0].multiplierValue, 2);
  const ambiguous = structuredClone(twice);
  ambiguous.actions[0].effects[0].multiplier = "user-points";
  assert.ok(f.validateModel(ambiguous).length);
});
test("project source and selected simulator are independent and comparisons check runtime identity", () => {
  const project = {
    id: "user-project",
    gameType: "systems",
    direction: "resource-development",
    model: userRules(),
    simulator: { id: "resource-turns", version: 1 },
    exampleId: null,
    brief: { coreLoop: "创作循环", question: "需要几步？" },
    versions: [],
    workspaceId: "w",
    path: "/user/project",
    createdAt: new Date().toISOString(),
  };
  const doc = f.projectDocument(project);
  assert.equal(doc.project.format, "gameplay-project-v4");
  assert.equal(doc.project.exampleId, null);
  assert.equal(doc.project.templateId, undefined);
  assert.deepEqual(f.parseProjectDocument(doc, project), project);
  project.versions.push({
    id: "version-user",
    name: "v1",
    model: structuredClone(project.model),
    simulator: { id: "card-combination", version: 1 },
    createdAt: project.createdAt,
  });
  const config = f.defaultPlaytest(project.id);
  config.scenarios[0].seedCount = 1;
  assert.throws(
    () =>
      f.prepareComparison(project, config, {
        mode: "versions",
        baseline: "draft",
        candidate: "version-user",
      }),
    /相同的模拟器/,
  );
  const exp = f.newConfiguredExperiment(
    project.id,
    project.model,
    f.selectedSetup(config, project.model, true),
    project.simulator,
  );
  finishExperiment(exp);
  assert.equal(exp.format, "gameplay-experiment-v4");
  assert.deepEqual(
    f.parseRecord(JSON.parse(JSON.stringify(exp)), project.id),
    exp,
  );
});
