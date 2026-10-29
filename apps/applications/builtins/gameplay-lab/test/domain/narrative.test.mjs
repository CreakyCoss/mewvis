import test from "node:test";
import assert from "node:assert/strict";
import { f } from "../helpers/domain.mjs";

function storyFixture() {
  const m = f.blankNarrative("海港来信");
  m.characters = [{ id: "captain", name: "船长", description: "守候来信的人" }];
  m.variables = [
    { id: "letter", name: "拿到来信", type: "boolean", initial: false },
    { id: "trust", name: "信任", type: "number", initial: 1 },
    { id: "place", name: "目的地", type: "text", initial: "海港" },
  ];
  m.startNode = "dock";
  m.nodes = [
    {
      id: "dock",
      title: "海港",
      text: "船长看着你。",
      speaker: "captain",
      ending: false,
      choices: [
        {
          id: "search",
          label: "寻找来信",
          target: "dock",
          conditions: [],
          effects: [
            { variable: "letter", operation: "set", value: true },
            { variable: "trust", operation: "add", value: 2 },
            { variable: "place", operation: "set", value: "远海" },
          ],
        },
        {
          id: "depart",
          label: "带信出发",
          target: "end",
          conditions: [
            { variable: "letter", op: "eq", value: true },
            { variable: "trust", op: "gte", value: 3 },
          ],
          effects: [],
        },
      ],
    },
    {
      id: "end",
      title: "启航",
      text: "帆升起来了。",
      speaker: "",
      ending: true,
      choices: [],
    },
  ];
  return m;
}
test("type-specific blank narrative is independent from numeric turn schemas", () => {
  const m = f.blankNarrative("我的冒险");
  assert.deepEqual(f.validateNarrative(m, true), []);
  assert.ok(f.validateNarrative(m).length);
  assert.equal("fields" in m, false);
  assert.equal("flow" in m, false);
  assert.equal("goals" in m, false);
  const p = {
    id: "story-project",
    gameType: "narrative",
    direction: "branching-story",
    simulator: f.narrativeSimulator,
    brief: { coreLoop: "选择与后果", question: "结局是否可达" },
    exampleId: null,
    model: storyFixture(),
    versions: [],
    workspaceId: "w",
    path: "/story",
    createdAt: "now",
  };
  assert.deepEqual(f.projectReadiness(p), []);
  const document = f.projectDocument(p);
  assert.deepEqual(f.parseProjectDocument(document, p), p);
  document.project.gameType = "card";
  assert.throws(() => f.parseProjectDocument(document, p), /类型/);
  p.simulator = { id: "card-combination", version: 1 };
  assert.ok(f.projectReadiness(p).some((e) => e.path === "模拟器"));
});
test("branching narrative evaluates conditions and typed consequences atomically", () => {
  const m = storyFixture(),
    s = f.startStory(m);
  assert.deepEqual(
    f.availableChoices(m, s).map((c) => c.id),
    ["search"],
  );
  assert.throws(() => f.advanceStory(m, s, "depart"), /条件/);
  const next = f.advanceStory(m, s, "search");
  assert.equal(s.values.letter, false);
  assert.equal(next.values.trust, 3);
  assert.equal(next.values.place, "远海");
  assert.deepEqual(
    f.availableChoices(m, next).map((c) => c.id),
    ["search", "depart"],
  );
  assert.equal(f.advanceStory(m, next, "depart").outcome, "ending");
  const bad = storyFixture();
  bad.nodes[0].choices[0].effects.push({
    variable: "trust",
    operation: "add",
    value: 1_000_000,
  });
  const initial = f.startStory(bad);
  assert.throws(() => f.advanceStory(bad, initial, "search"), /越界/);
  assert.equal(initial.values.letter, false);
  assert.equal(initial.steps, 0);
});
test("story records freeze rules, reproduce every choice, and reject tampering or unsupported runtimes", () => {
  const m = storyFixture(),
    r = f.newStoryRecord("story-project", m),
    next = f.chooseStory(f.chooseStory(r, "search"), "depart");
  m.nodes[1].text = "草稿已修改";
  assert.equal(next.model.nodes[1].text, "帆升起来了。");
  assert.deepEqual(
    f.parseStoryRecord(JSON.parse(JSON.stringify(next)), "story-project"),
    next,
  );
  assert.equal(f.storyState(next, 1).node, "dock");
  assert.equal(f.storyState(next, 0).values.letter, false);
  const altered = structuredClone(next);
  altered.final.values.trust = 100;
  assert.throws(() => f.parseStoryRecord(altered, "story-project"), /重算/);
  altered.simulator.version = 2;
  assert.throws(() => f.parseStoryRecord(altered, "story-project"), /版本/);
  assert.throws(() => f.parseStoryRecord(next, "different-project"), /无效/);
});
test("narrative structural reachability is separate from conditional dead ends and run budgets", () => {
  const m = storyFixture();
  m.nodes[0].choices = m.nodes[0].choices.filter((c) => c.id === "depart");
  assert.equal(f.narrativeAnalysis(m).endings, 1);
  assert.equal(f.startStory(m).outcome, "blocked");
  const loop = storyFixture();
  let s = f.startStory(loop);
  for (let i = 0; i < 200; i++) s = f.advanceStory(loop, s, "search");
  assert.equal(s.outcome, "budget");
  assert.throws(() => f.advanceStory(loop, s, "search"), /结束/);
});
test("narrative validators reject malformed mechanisms, missing references, and cross-schema versions", () => {
  for (const mutate of [
    (m) => {
      m.nodes[0].choices[0].effects[0].operation = "execute";
    },
    (m) => {
      m.nodes[0].speaker = "missing";
    },
    (m) => {
      m.nodes[0].choices[1].conditions[0].value = "true";
    },
    (m) => {
      m.nodes[1].ending = false;
    },
    (m) => {
      m.nodes[0].choices[0].target = "missing";
    },
  ]) {
    const m = storyFixture();
    mutate(m);
    assert.ok(f.validateNarrative(m).length);
    assert.throws(() => f.startStory(m));
  }
  const m = storyFixture();
  m.nodes[0].choices[0].target = "";
  assert.deepEqual(f.validateNarrative(m, true), []);
  const p = {
    id: "story-project",
    gameType: "narrative",
    direction: "branching-story",
    simulator: f.narrativeSimulator,
    brief: { coreLoop: "", question: "" },
    exampleId: null,
    model: storyFixture(),
    versions: [
      { id: "v", name: "异构", createdAt: "now", model: f.makeTemplate() },
    ],
    workspaceId: "w",
    path: "/story",
    createdAt: "now",
  };
  assert.throws(() => f.projectDocument(p), /类型/);
});

test("orphan narrative drafts reject values that cannot survive JSON serialization", () => {
  for (const value of [NaN, Infinity, -Infinity, "x".repeat(1001)]) {
    const m = storyFixture();
    m.nodes[0].choices[0].effects = [
      { variable: "missing-variable", operation: "set", value },
    ];
    assert.ok(f.validateNarrative(m, true).length);
    m.nodes[0].choices[0].effects = [];
    m.nodes[0].choices[0].conditions = [
      { variable: "missing-variable", op: "eq", value },
    ];
    assert.ok(f.validateNarrative(m, true).length);
  }
});
