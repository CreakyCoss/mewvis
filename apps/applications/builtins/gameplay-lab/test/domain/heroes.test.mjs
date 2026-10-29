import test from "node:test";
import assert from "node:assert/strict";
import { f } from "../helpers/domain.mjs";

function model() {
  const m = f.createDoudizhuModel("英雄斗地主");
  f.setDoudizhuModuleEnabled(m, "heroes", true);
  return m;
}
function playing(m, seed = 42) {
  return f.advanceDoudizhu(m, f.startDoudizhu(m, seed), {
    type: "bid",
    player: 0,
    value: 3,
  }).state;
}
const skill = (target = 1, player = 0) => ({
  type: "skill",
  player,
  skillId: "insight",
  target,
});

test("hero config validates supported version, bounded effects and three unique seats even when disabled", () => {
  assert.deepEqual(f.validateDoudizhu(model()), []);
  for (const mutate of [
    (c) => (c.version = 2),
    (c) => c.seats.pop(),
    (c) => (c.seats[1].id = c.seats[0].id),
    (c) => (c.seats[0].skill.uses = 0),
    (c) => (c.seats[0].skill.uses = 4),
    (c) => (c.seats[0].skill.count = 1.5),
    (c) => (c.seats[0].skill.effect = "discard"),
    (c) => (c.seats[0].skill.timing = "after-play"),
    (c) => (c.seats[0].skill.extra = true),
    (c) => (c.seats[0].name = " "),
  ]) {
    const m = model();
    f.setDoudizhuModuleEnabled(m, "heroes", false);
    mutate(m.extensions.heroes);
    assert.ok(f.validateDoudizhu(m).length);
  }
  const m = model();
  m.extensions.unknown = {};
  assert.match(
    f
      .validateDoudizhu(m)
      .map((i) => i.message)
      .join(),
    /未知扩展/,
  );
});

test("skill commands enforce timing, owner, identity, target and charges without consuming the play turn", () => {
  const m = model(),
    s = playing(m),
    original = structuredClone(s);
  for (const c of [
    skill(0),
    skill(3),
    skill(1.5),
    skill(1, 1),
    { ...skill(), skillId: "unknown" },
  ])
    assert.throws(() => f.advanceDoudizhu(m, s, c));
  assert.throws(() => f.advanceDoudizhu(m, f.startDoudizhu(m), skill()));
  const { state: next, events } = f.advanceDoudizhu(m, s, skill());
  assert.equal(next.actor, s.actor);
  assert.equal(next.steps, s.steps + 1);
  assert.equal(next.heroes.used[0], 1);
  assert.deepEqual(next.hands, s.hands);
  assert.deepEqual(next.last, s.last);
  assert.equal(events[0].type, "skill");
  assert.equal(events[0].cards, undefined);
  assert.throws(() => f.advanceDoudizhu(m, next, skill()), /次数/);
  assert.deepEqual(s, original);
  const plays = f.doudizhuCommands(m, f.observeDoudizhu(m, next, 0));
  assert.ok(plays.some((c) => c.type === "play"));
  assert.ok(plays.every((c) => c.type !== "skill"));
  const finished = { ...s, phase: "finished" };
  assert.throws(() => f.advanceDoudizhu(m, finished, skill()));
});

test("only the skill owner observes revealed cards; random selection is deterministic and never duplicates", () => {
  const m = model();
  m.extensions.heroes.seats[0].skill.count = 3;
  const s = playing(m),
    next = f.advanceDoudizhu(m, s, skill()).state;
  assert.deepEqual(f.advanceDoudizhu(m, s, skill()).state, next);
  const own = f.observeDoudizhu(m, next, 0),
    other = f.observeDoudizhu(m, next, 1);
  assert.equal(own.heroes.reveals[0].cards.length, 3);
  assert.equal(new Set(own.heroes.reveals[0].cards.map((c) => c.id)).size, 3);
  assert.ok(
    own.heroes.reveals[0].cards.every((c) =>
      s.hands[1].some((h) => h.id === c.id),
    ),
  );
  assert.deepEqual(other.heroes.reveals, []);
  assert.equal(other.hands, undefined);
  const hidden = structuredClone(next);
  hidden.heroes.reveals[0][0].cards = [hidden.hands[2][0]];
  assert.deepEqual(f.observeDoudizhu(m, hidden, 1), other);
  own.heroes.reveals[0].cards.length = 0;
  assert.equal(next.heroes.reveals[0][0].cards.length, 3);
  const short = structuredClone(s);
  short.hands[1] = short.hands[1].slice(0, 1);
  assert.equal(
    f.advanceDoudizhu(m, short, skill()).state.heroes.reveals[0][0].cards
      .length,
    1,
  );
  short.hands[1] = [];
  assert.throws(() => f.advanceDoudizhu(m, short, skill()), /目标/);
});

test("disabling heroes exactly restores the base state, legal actions and old record replay", () => {
  const base = f.createDoudizhuModel("基础斗地主"),
    disabled = structuredClone(base);
  disabled.extensions.heroes = f.createHeroesConfig();
  disabled.extensions.heroes.enabled = false;
  let a = f.startDoudizhu(base),
    b = f.startDoudizhu(disabled);
  assert.equal(b.heroes, undefined);
  for (let i = 0; i < 500 && a.phase !== "finished"; i++) {
    assert.deepEqual(a, b);
    const av = f.observeDoudizhu(base, a, a.actor),
      bv = f.observeDoudizhu(disabled, b, b.actor);
    assert.deepEqual(
      f.doudizhuCommands(base, av),
      f.doudizhuCommands(disabled, bv),
    );
    const c = f.chooseDoudizhu(base, av);
    a = f.advanceDoudizhu(base, a, c).state;
    b = f.advanceDoudizhu(disabled, b, c).state;
  }
  assert.deepEqual(a, b);
  assert.equal(a.phase, "finished");
  assert.throws(
    () => f.advanceDoudizhu(disabled, playing(disabled), skill()),
    /未启用/,
  );
  const old = f.newDoudizhuRecord("p", base);
  assert.deepEqual(f.parseDoudizhuRecord(old, "p"), old);
});

test("all-pass redeals initialize the module and complete hero games replay from frozen rules", () => {
  for (let seed = 0; seed < 8; seed++) {
    const m = model();
    m.extensions.heroes.seats[0].skill.uses = 2;
    let record = f.newDoudizhuRecord("p", m, seed);
    for (let i = 0; i < 3; i++)
      record = f.advanceDoudizhuRecord(record, {
        type: "bid",
        player: record.final.actor,
        value: 0,
      });
    assert.equal(record.final.deal, 1);
    assert.deepEqual(record.final.heroes.used, [0, 0, 0]);
    f.setDoudizhuModuleEnabled(m, "heroes", false);
    let steps = 0;
    while (record.final.phase !== "finished" && steps++ < 500) {
      const view = f.observeDoudizhu(
        record.model,
        record.final,
        record.final.actor,
      );
      const c = f.chooseDoudizhu(record.model, view);
      record = f.advanceDoudizhuRecord(record, c);
    }
    assert.equal(record.final.phase, "finished");
    assert.ok(record.decisions.some((c) => c.type === "skill"));
    assert.equal(
      record.final.outcome.scores.reduce((a, b) => a + b, 0),
      0,
    );
    assert.deepEqual(f.doudizhuReplay(record), record.final);
    assert.deepEqual(f.parseDoudizhuRecord(record, "p"), record);
    const corrupt = structuredClone(record);
    corrupt.final.heroes.reveals[0][0].cards = [];
    assert.throws(() => f.parseDoudizhuRecord(corrupt, "p"), /不一致/);
  }
});
