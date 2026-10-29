import test from "node:test";
import assert from "node:assert/strict";
import { f } from "../helpers/domain.mjs";
const cards = (...ranks) => {
  const used = new Set();
  return ranks.map((rank) => {
    const card = f.pokerDeck().find((c) => c.rank === rank && !used.has(c.id));
    assert.ok(card);
    used.add(card.id);
    return card;
  });
};
const bid = (m, s) =>
  f.advanceDoudizhu(m, s, { type: "bid", player: s.actor, value: 3 }).state;
test("Doudizhu has its own complete framework structure and rejects unknown modules", () => {
  const m = f.createFrameworkModel("doudizhu", "新斗地主");
  assert.deepEqual(f.validateDoudizhu(m), []);
  assert.equal(m.format, "gameplay-doudizhu-v1");
  assert.equal(m.fields, undefined);
  assert.equal(m.rules.enabled.length, 14);
  m.extensions.heroes = { enabled: true };
  assert.match(
    f
      .validateDoudizhu(m)
      .map((e) => e.message)
      .join(),
    /英雄模块/,
  );
  delete m.extensions.heroes;
  m.rules.extraTrigger = "on-play";
  assert.match(
    f
      .validateDoudizhu(m)
      .map((e) => e.message)
      .join(),
    /不支持的出牌规则/,
  );
  delete m.rules.extraTrigger;
  m.rules.enabled = ["pair"];
  assert.ok(f.validateDoudizhu(m).length);
});
test("all supported Doudizhu shapes recognize their body rank and respect configured lengths", () => {
  const m = f.createDoudizhuModel("牌型");
  const cases = [
    ["single", [3]],
    ["pair", [4, 4]],
    ["triple", [5, 5, 5]],
    ["tripleSingle", [6, 6, 6, 3]],
    ["triplePair", [7, 7, 7, 3, 3]],
    ["straight", [3, 4, 5, 6, 7]],
    ["pairChain", [3, 3, 4, 4, 5, 5]],
    ["tripleChain", [3, 3, 3, 4, 4, 4]],
    ["planeSingle", [3, 3, 3, 4, 4, 4, 7, 8]],
    ["planePair", [3, 3, 3, 4, 4, 4, 7, 7, 8, 8]],
    ["fourSingle", [3, 3, 3, 3, 7, 8]],
    ["fourPair", [3, 3, 3, 3, 7, 7, 8, 8]],
    ["bomb", [3, 3, 3, 3]],
    ["rocket", [16, 17]],
  ];
  for (const [kind, ranks] of cases)
    assert.equal(f.recognizePoker(m, cards(...ranks))?.kind, kind);
  assert.equal(f.recognizePoker(m, cards(11, 12, 13, 14, 15)), null);
  assert.equal(f.recognizePoker(m, cards(3, 4, 5, 6)), null);
  m.rules.straightMin = 4;
  assert.equal(f.recognizePoker(m, cards(3, 4, 5, 6)).kind, "straight");
  m.rules.enabled = m.rules.enabled.filter((k) => k !== "straight");
  assert.equal(f.recognizePoker(m, cards(3, 4, 5, 6)), null);
  assert.equal(f.recognizePoker(m, cards(3, 3, 3, 4, 4, 4, 7, 7)), null);
  m.rules.distinctSingles = false;
  assert.equal(
    f.recognizePoker(m, cards(3, 3, 3, 4, 4, 4, 7, 7)).kind,
    "planeSingle",
  );
});
test("comparison distinguishes family and size, bomb hierarchy and attached cards", () => {
  const m = f.createDoudizhuModel("比较"),
    p = (...r) => f.recognizePoker(m, cards(...r));
  assert.equal(f.beatsPoker(p(8, 8, 8, 3), p(7, 7, 7, 14)), true);
  assert.equal(f.beatsPoker(p(8, 8), p(7)), false);
  assert.equal(f.beatsPoker(p(4, 5, 6, 7, 8, 9), p(3, 4, 5, 6, 7)), false);
  assert.equal(f.beatsPoker(p(3, 3, 3, 3), p(17)), true);
  assert.equal(f.beatsPoker(p(16, 17), p(15, 15, 15, 15)), true);
  assert.equal(f.beatsPoker(p(15, 15, 15, 15), p(16, 17)), false);
});
test("deal and bidding are deterministic, preserve 54 identities and reveal kitty only after bidding", () => {
  const m = f.createDoudizhuModel("发牌"),
    s = f.startDoudizhu(m, 42),
    original = structuredClone(s);
  assert.deepEqual(f.startDoudizhu(m, 42), s);
  assert.deepEqual(
    s.hands.map((h) => h.length),
    [17, 17, 17],
  );
  assert.equal(
    new Set([...s.hands.flat(), ...s.kitty].map((c) => c.id)).size,
    54,
  );
  const v = f.observeDoudizhu(m, s, 0);
  assert.equal(v.hands, undefined);
  assert.deepEqual(v.kitty, []);
  const next = bid(m, s);
  assert.equal(next.landlord, 0);
  assert.equal(next.hands[0].length, 20);
  assert.equal(f.observeDoudizhu(m, next, 0).kitty.length, 3);
  assert.deepEqual(s, original);
  assert.throws(
    () => f.advanceDoudizhu(m, s, { type: "bid", player: 1, value: 3 }),
    /当前/,
  );
  let passed = s;
  for (let i = 0; i < 3; i++)
    passed = f.advanceDoudizhu(m, passed, {
      type: "bid",
      player: passed.actor,
      value: 0,
    }).state;
  assert.equal(passed.deal, 1);
  assert.equal(passed.phase, "bidding");
  assert.notDeepEqual(passed.hands, s.hands);
  assert.equal(passed.steps, 3);
});
test("illegal plays are atomic and two passes return the lead to the last player", () => {
  const m = f.createDoudizhuModel("回合"),
    s = bid(m, f.startDoudizhu(m)),
    original = structuredClone(s);
  assert.throws(
    () => f.advanceDoudizhu(m, s, { type: "pass", player: s.actor }),
    /领出/,
  );
  assert.throws(
    () =>
      f.advanceDoudizhu(m, s, {
        type: "play",
        player: s.actor,
        cards: [s.hands[1][0].id],
      }),
    /不属于/,
  );
  const id = s.hands[0][0].id;
  assert.throws(
    () => f.advanceDoudizhu(m, s, { type: "play", player: 0, cards: [id, id] }),
    /不同/,
  );
  let next = f.advanceDoudizhu(m, s, {
    type: "play",
    player: 0,
    cards: [id],
  }).state;
  for (let i = 0; i < 2; i++)
    next = f.advanceDoudizhu(m, next, {
      type: "pass",
      player: next.actor,
    }).state;
  assert.equal(next.actor, 0);
  assert.equal(next.last, null);
  assert.equal(next.hands[0].length, 19);
  assert.deepEqual(s, original);
});
test("candidates are legal under custom rules and bots cannot observe opponents' hidden hands", () => {
  const m = f.createDoudizhuModel("视角"),
    s = bid(m, f.startDoudizhu(m, 123)),
    v = f.observeDoudizhu(m, s, 0);
  const before = structuredClone(v),
    hidden = structuredClone(s);
  hidden.hands[1].reverse();
  hidden.hands[2].reverse();
  assert.deepEqual(
    f.chooseDoudizhu(m, v),
    f.chooseDoudizhu(m, f.observeDoudizhu(m, hidden, 0)),
  );
  for (const command of f.doudizhuCommands(m, v))
    assert.doesNotThrow(() => f.advanceDoudizhu(m, s, command));
  assert.deepEqual(v, before);
});
test("complete automatic games terminate, conserve cards and yield zero-sum team scores", () => {
  for (let seed = 0; seed < 12; seed++) {
    const m = f.createDoudizhuModel("完整对局");
    if (seed % 2) {
      m.rules.straightMin = 4;
      m.rules.distinctSingles = false;
      m.rules.enabled = m.rules.enabled.filter((k) => k !== "bomb");
    }
    let s = f.startDoudizhu(m, seed),
      steps = 0;
    while (s.phase !== "finished" && steps++ < 500) {
      const v = f.observeDoudizhu(m, s, s.actor);
      s = f.advanceDoudizhu(m, s, f.chooseDoudizhu(m, v)).state;
      const ids = s.hands.flat().map((c) => c.id);
      assert.equal(new Set(ids).size, ids.length);
    }
    assert.equal(s.phase, "finished");
    assert.equal(
      s.outcome.scores.reduce((a, b) => a + b, 0),
      0,
    );
    assert.equal(s.hands[s.outcome.winner].length, 0);
  }
});
test("records freeze custom rules, reproduce every command and reject tampered states or versions", () => {
  const m = f.createDoudizhuModel("记录");
  let record = f.newDoudizhuRecord("project", m, 17);
  m.rules.baseScore = 99;
  assert.equal(record.model.rules.baseScore, 1);
  for (let i = 0; i < 9; i++) {
    const s = record.final;
    record = f.advanceDoudizhuRecord(
      record,
      f.chooseDoudizhu(
        record.model,
        f.observeDoudizhu(record.model, s, s.actor),
      ),
    );
  }
  assert.deepEqual(f.doudizhuReplay(record), record.final);
  assert.deepEqual(f.parseDoudizhuRecord(record, "project"), record);
  const altered = structuredClone(record);
  altered.final.multiplier = 999;
  assert.throws(() => f.parseDoudizhuRecord(altered, "project"), /不一致/);
  altered.simulator.version = 2;
  assert.throws(() => f.parseDoudizhuRecord(altered, "project"), /版本/);
});
