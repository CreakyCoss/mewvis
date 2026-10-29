import test from "node:test";
import assert from "node:assert/strict";
import { f } from "../helpers/domain.mjs";
import { cardGame } from "../helpers/card-game.mjs";

function story() {
  const m = f.blankNarrative("自己的剧情");
  m.characters.push({
    id: "guide",
    name: "引路人",
    description: "知道灯塔位置",
  });
  m.variables.push({
    id: "shared",
    name: "持有信件",
    type: "boolean",
    initial: false,
  });
  m.startNode = "harbor";
  m.nodes.push(
    {
      id: "harbor",
      title: "港口",
      text: "远方有一座灯塔",
      speaker: "guide",
      ending: false,
      choices: [
        {
          id: "shared",
          label: "递出信件",
          target: "end",
          conditions: [{ variable: "shared", op: "eq", value: true }],
          effects: [{ variable: "shared", operation: "set", value: false }],
        },
      ],
    },
    {
      id: "end",
      title: "抵达",
      text: "结束",
      speaker: "",
      ending: true,
      choices: [],
    },
  );
  return m;
}
test("content indexing is read-only and keeps resource, card and narrative models independent", () => {
  for (const model of [f.makeTemplate(), cardGame(), story()]) {
    const original = structuredClone(model),
      index = f.projectContent(model);
    assert.deepEqual(model, original);
    assert.equal(
      new Set(index.items.map((i) => i.key)).size,
      index.items.length,
    );
    assert.ok(
      index.references.every((ref) =>
        index.items.some((i) => i.key === ref.from),
      ),
    );
  }
  const resource = f.projectContent(f.makeTemplate());
  assert.ok(
    !resource.items.some((i) =>
      ["card", "deck", "node", "character"].includes(i.kind),
    ),
  );
  const narrative = f.projectContent(story());
  assert.ok(
    !narrative.items.some((i) => ["state", "action", "goal"].includes(i.kind)),
  );
});
test("resource indexing includes costs, prerequisites, effect sources, grants, goals and cycle references", () => {
  const model = f.makeTemplate(),
    index = f.projectContent(model);
  for (const [from, to, label] of [
    ["action:study", "state:materials", "消耗 1"],
    ["action:study", "capability:laboratory", "前置能力"],
    ["goal:science", "state:research", "目标指标"],
    ["flow:flow", "state:production", "效果 1 · 数值来源"],
    ["action:build", "capability:factory", "效果 2 · 获得能力"],
  ])
    assert.ok(
      index.references.some(
        (ref) => ref.from === from && ref.to === to && ref.label === label,
      ),
      `${from} -> ${to}`,
    );
});
test("card definitions, quantities and scoring references can be followed in both directions", () => {
  const model = cardGame(),
    index = f.projectContent(model);
  assert.ok(
    index.references.some(
      (r) =>
        r.from === "deck:deck" &&
        r.to === "card:sun" &&
        r.label.includes("3 张"),
    ),
  );
  assert.ok(
    index.references.some(
      (r) => r.from === "action:play" && r.to === "deck:deck",
    ),
  );
  assert.deepEqual(index.items.find((i) => i.key === "card:sun").location, {
    area: "rules",
    id: "sun",
    key: "card:sun",
  });
  assert.equal(f.searchContent(index, "warm", "card")[0].id, "sun");
  model.decks[0].entries[0].card = "missing";
  const orphan = f.projectContent(model);
  assert.ok(orphan.references.some((r) => r.to === "card:missing"));
  assert.ok(!orphan.items.some((i) => i.key === "card:missing"));
});
test("narrative links distinguish choice IDs from variable IDs and locate the owning scene", () => {
  const model = story(),
    index = f.projectContent(model);
  assert.deepEqual(f.validateNarrative(model), []);
  assert.deepEqual(
    index.items.find((i) => i.key === "choice:shared").location,
    { area: "nodes", id: "harbor", key: "choice:shared" },
  );
  for (const [from, to, label] of [
    ["flow:flow", "node:harbor", "叙事入口"],
    ["node:harbor", "character:guide", "发言人物"],
    ["node:harbor", "choice:shared", "剧情选项"],
    ["choice:shared", "node:end", "跳转目标"],
    ["choice:shared", "variable:shared", "条件 1"],
    ["choice:shared", "variable:shared", "后果 1"],
  ])
    assert.ok(
      index.references.some(
        (r) => r.from === from && r.to === to && r.label === label,
      ),
      `${from} -> ${to}`,
    );
});
test("content search handles descriptions, IDs, case, multiple terms and type filters without rewriting same-named content", () => {
  const model = cardGame();
  model.cards[1].name = model.cards[0].name;
  const index = f.projectContent(model);
  assert.equal(f.searchContent(index, "晨光", "card").length, 2);
  assert.equal(f.searchContent(index, " SUN   暖色牌 ", "card")[0].id, "sun");
  assert.equal(f.searchContent(index, "晨光", "deck").length, 0);
  assert.equal(f.searchContent(index, "not-found").length, 0);
  assert.equal(f.searchContent(index, "").length, index.items.length);
});
test("validation locations lead to specific content editors or the appropriate empty editor", () => {
  const model = cardGame();
  model.cards[0].name = "";
  model.decks[0].entries[0].card = "missing";
  const index = f.projectContent(model);
  for (const id of ["sun", "deck"]) {
    const issue = f.validateModel(model).find((i) => i.path === id);
    assert.ok(issue);
    assert.equal(
      f.contentIssueLocation(index, issue, model).key,
      `${id === "sun" ? "card" : "deck"}:${id}`,
    );
  }
  assert.deepEqual(
    f.contentIssueLocation(index, { path: "周期结算", message: "" }, model),
    { area: "rules", id: "", key: "flow:flow" },
  );
  const blank = f.blankNarrative("空白");
  assert.equal(
    f.contentIssueLocation(
      f.projectContent(blank),
      { path: "起始剧情", message: "" },
      blank,
    ).key,
    "flow:flow",
  );
  assert.equal(f.projectContent(blank).items.length, 1);
  const narrative = story();
  narrative.nodes[0].choices[0].id = "end";
  narrative.nodes[1].text = "";
  const issue = f
    .validateNarrative(narrative)
    .find((issue) => issue.path === "end");
  assert.equal(
    f.contentIssueLocation(f.projectContent(narrative), issue, narrative).key,
    "node:end",
  );
});
