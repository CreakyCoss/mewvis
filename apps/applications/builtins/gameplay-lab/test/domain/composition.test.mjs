import test from "node:test";
import assert from "node:assert/strict";
import { f } from "../helpers/domain.mjs";

test("classic and hero presets are ordinary compositions; custom configuration uses the same runtime", () => {
  const classic = f.createDoudizhuModel("经典"),
    hero = f.createDoudizhuModel("英雄", "hero-doudizhu"),
    custom = structuredClone(classic);
  f.setDoudizhuModuleEnabled(custom, "heroes", true);
  assert.equal(f.matchingDoudizhuPreset(classic), "classic-doudizhu");
  assert.equal(f.matchingDoudizhuPreset(hero), "hero-doudizhu");
  assert.deepEqual(
    f.resolveDoudizhuComposition(hero).snapshot,
    f.resolveDoudizhuComposition(custom).snapshot,
  );
  let a = f.startDoudizhu(hero, 52),
    b = f.startDoudizhu(custom, 52);
  for (let i = 0; i < 500 && a.phase !== "finished"; i++) {
    assert.deepEqual(a, b);
    const av = f.observeDoudizhu(hero, a, a.actor),
      bv = f.observeDoudizhu(custom, b, b.actor);
    assert.deepEqual(
      f.doudizhuCommands(hero, av),
      f.doudizhuCommands(custom, bv),
    );
    const c = f.chooseDoudizhu(hero, av);
    a = f.advanceDoudizhu(hero, a, c).state;
    b = f.advanceDoudizhu(custom, b, c).state;
  }
  assert.equal(a.phase, "finished");
  assert.deepEqual(a, b);
  custom.rules.baseScore = 7;
  custom.extensions.heroes.seats[0].name = "自定义英雄";
  assert.equal(f.matchingDoudizhuPreset(custom), "custom");
  f.setDoudizhuModuleEnabled(custom, "heroes", false);
  f.setDoudizhuModuleEnabled(custom, "heroes", true);
  assert.equal(custom.extensions.heroes.seats[0].name, "自定义英雄");
  assert.equal(custom.rules.baseScore, 7);
});

test("composition rejects unsupported skeleton, layout, module versions, duplicate selections and inconsistent toggles", () => {
  for (const change of [
    (m) => (m.composition.version = 2),
    (m) => (m.composition.skeleton.version = 2),
    (m) => (m.composition.layout.id = "unknown"),
    (m) => (m.composition.modules[0].version = 2),
    (m) => m.composition.modules.push(m.composition.modules[0]),
    (m) => (m.composition.modules[0].id = "unknown"),
    (m) => (m.composition.modules = []),
    (m) => (m.extensions.heroes.enabled = false),
    (m) => delete m.extensions.heroes,
    (m) => (m.composition.extra = "ignored?"),
  ]) {
    const m = f.createDoudizhuModel("校验", "hero-doudizhu");
    change(m);
    assert.ok(f.validateDoudizhu(m).length);
    assert.throws(() => f.startDoudizhu(m));
  }
});

test("unfinished module names remain editable and savable drafts while execution stays blocked", () => {
  const m = f.createDoudizhuModel("草稿", "hero-doudizhu");
  m.extensions.heroes.seats[0].name = "";
  m.extensions.heroes.seats[0].skill.name = "";
  assert.deepEqual(f.validateDoudizhu(m, true), []);
  assert.equal(f.resolveDoudizhuComposition(m, true).modules.length, 1);
  assert.ok(f.validateDoudizhu(m).length);
  assert.throws(() => f.startDoudizhu(m));
});

function probeModule(id = "probe") {
  return {
    definition: {
      id,
      version: 1,
      name: id,
      description: "test-only registration",
      skeleton: { id: "doudizhu", version: 1 },
      requires: ["turns"],
      dependsOn: [],
      timings: ["before-play"],
      slots: ["before-hand"],
    },
    stateKey: id,
    commandTypes: [id],
    createConfig: () => ({ version: 1, enabled: true }),
    validate: () => [],
    initialize: () => ({ used: false, owner: null }),
    observe: ({ value, player }) => ({
      used: value.used,
      mine: value.owner === player,
    }),
    commands: ({ view, value }) =>
      !value.used && view.actor === view.player && view.phase === "playing"
        ? [{ type: id, player: view.player }]
        : [],
    advance: ({ state, command }) => ({
      state,
      value: { used: true, owner: command.player },
      events: [{ type: id, text: "probe resolved" }],
    }),
    choose: ({ commands }) => commands[0],
  };
}
function resolve(m, registry) {
  return f.resolveGameComposition(
    m.composition,
    m.extensions,
    f.doudizhuSkeleton,
    f.doudizhuLayout,
    registry,
  );
}

test("module requirements, dependency order, cycles, state and command ownership are enforced before running", () => {
  const a = probeModule("a"),
    b = probeModule("b"),
    m = f.createDoudizhuModel("依赖");
  m.extensions = { a: a.createConfig(), b: b.createConfig() };
  m.composition.modules = [
    { id: "b", version: 1 },
    { id: "a", version: 1 },
  ];
  b.definition.dependsOn = [{ id: "a", version: 1 }];
  assert.deepEqual(
    resolve(m, [a, b]).snapshot.modules.map((r) => r.id),
    ["a", "b"],
  );
  for (const mutate of [
    (a) => (a.definition.requires = ["real-time"]),
    (a) => (a.definition.timings = ["after-combat"]),
    (a) => (a.definition.slots = ["battlefield"]),
    (a) => (a.definition.skeleton.version = 2),
    (a) => (a.definition.dependsOn = [{ id: "missing", version: 1 }]),
    (a) => (a.stateKey = "hands"),
    (a) => (a.commandTypes = ["play"]),
    (a) => (a.definition.dependsOn = [{ id: "b", version: 1 }]),
  ]) {
    const altered = {
      ...a,
      definition: structuredClone(a.definition),
      commandTypes: [...a.commandTypes],
    };
    mutate(altered);
    assert.ok(resolve(m, [altered, b]).issues.length);
  }
});

test("an independently registered module runs through the real Doudizhu core without a core-specific branch", () => {
  const probe = probeModule(),
    registry = [...f.doudizhuModules, probe],
    m = f.createDoudizhuModel("组合", "hero-doudizhu");
  m.extensions.probe = probe.createConfig();
  m.composition.modules.push({ id: "probe", version: 1 });
  const runtime = f.assembleGameRuntime({
    core: {
      validate: f.validateDoudizhuCore,
      initialize: f.startDoudizhuCore,
      advance: f.advanceDoudizhuCore,
      observe: f.observeDoudizhuCore,
      commands: f.doudizhuCoreCommands,
      choose: f.chooseDoudizhuCore,
    },
    registry,
    resolve: (m) => resolve(m, registry),
    configs: (m) => m.extensions,
    commandPlayer: (c) => c.player,
    timings: (v) =>
      v.phase === "playing" && v.actor === v.player ? ["before-play"] : [],
    assertCommand: (s, c) => {
      if (c.player !== s.actor || s.phase === "finished")
        throw new Error("turn");
    },
    resetModules: (a, b) => a.deal !== b.deal,
    completeModuleCommand: (s, events) => ({
      ...s,
      steps: s.steps + 1,
      message: events.map((e) => e.text).join(" "),
    }),
  });
  let state = runtime.initialize(m, 42);
  state = runtime.advance(m, state, { type: "bid", player: 0, value: 3 }).state;
  const before = structuredClone(state);
  state = runtime.advance(m, state, { type: "probe", player: 0 }).state;
  assert.deepEqual(state.hands, before.hands);
  assert.equal(state.actor, before.actor);
  assert.deepEqual(runtime.observe(m, state, 0).probe, {
    used: true,
    mine: true,
  });
  assert.deepEqual(runtime.observe(m, state, 1).probe, {
    used: true,
    mine: false,
  });
  assert.equal(runtime.observe(m, state, 1).probe.owner, undefined);
  assert.equal(runtime.observe(m, state, 1).hands, undefined);
  assert.deepEqual(state.heroes, before.heroes);
  assert.deepEqual(before.probe, { used: false, owner: null });
  assert.throws(() => runtime.advance(m, state, { type: "probe", player: 0 }));
  assert.equal(runtime.choose(m, runtime.observe(m, state, 0)).type, "skill");
  assert.equal(
    runtime.choose(m, runtime.observe(m, state, 0), false).type,
    "play",
  );
});

test("records freeze the resolved assembly and reject tampered references while pre-composition records remain readable", () => {
  const m = f.createDoudizhuModel("快照", "hero-doudizhu");
  let r = f.newDoudizhuRecord("p", m);
  r = f.advanceDoudizhuRecord(r, { type: "bid", player: 0, value: 3 });
  r = f.advanceDoudizhuRecord(r, {
    type: "skill",
    player: 0,
    skillId: "insight",
    target: 1,
  });
  assert.deepEqual(r.composition, m.composition);
  const bad = structuredClone(r);
  bad.composition.layout.version = 2;
  assert.throws(() => f.parseDoudizhuRecord(bad, "p"), /不一致/);
  const missing = structuredClone(r);
  delete missing.composition;
  assert.throws(() => f.parseDoudizhuRecord(missing, "p"), /缺少/);
  const legacy = structuredClone(r);
  delete legacy.composition;
  delete legacy.model.composition;
  const before = JSON.stringify(legacy);
  assert.deepEqual(f.parseDoudizhuRecord(legacy, "p"), legacy);
  assert.equal(JSON.stringify(legacy), before);
  f.setDoudizhuModuleEnabled(m, "heroes", false);
  assert.equal(r.composition.modules.length, 1);
  assert.deepEqual(f.doudizhuReplay(r), r.final);
});
