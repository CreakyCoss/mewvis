import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DefaultStatus, type StatusSlotItem } from "@mewvis/extension-host/ui/slots/status";
import { defineUIContribution, uiSlotDefinitions } from "@mewvis/extension-host/ui";

const item: StatusSlotItem = {
  ...defineUIContribution(uiSlotDefinitions.composerStatus, { id: "progress", title: "Progress" }),
  key: "flow:progress",
  activity: {
    id: "flow",
    executionId: "task",
    title: "Review",
    state: "running",
    pausable: true,
    updatedAt: 1,
    steps: [
      { id: "one", title: "Draft", state: "completed" },
      { id: "two", title: "Review", state: "pending" },
    ],
  },
  canPause: true,
  canResume: true,
  pendingAction: null,
  cancelling: false,
  async pause() {},
  async resume() {},
  async cancel() {},
};
const render = (value: StatusSlotItem) => renderToStaticMarkup(<DefaultStatus item={value} />);

test("status distinguishes deferred pause and checkpoint wait with appropriate controls", () => {
  assert.match(render(item), /aria-label="暂停"/);
  const pausing = render({ ...item, activity: { ...item.activity, state: "pausing" } });
  assert.match(pausing, /当前步骤完成后暂停/);
  assert.match(pausing, /aria-label="撤回暂停"/);
  const paused = render({ ...item, activity: { ...item.activity, state: "paused" } });
  assert.match(paused, /已暂停/);
  assert.match(paused, /aria-label="继续"/);
  assert.match(paused, /aria-label="取消"/);
  assert.match(paused, /下一步：Review/);
  assert.match(paused, /aria-label="查看流程步骤"/);
});

test("status only offers pause for capable activities and disables controls while a request is pending", () => {
  assert.doesNotMatch(render({ ...item, activity: { ...item.activity, pausable: false } }), /aria-label="暂停"/);
  assert.doesNotMatch(render({ ...item, canPause: false }), /aria-label="暂停"/);
  assert.doesNotMatch(render({ ...item, activity: { ...item.activity, state: "completed" } }), /<button/);
  assert.equal((render({ ...item, pendingAction: "pause" }).match(/disabled=""/g) ?? []).length, 2);
});

test("cancelling status retains a disabled cancel control until termination", () => {
  const html = render({ ...item, activity: { ...item.activity, state: "cancelling" }, cancelling: true });
  assert.match(html, /取消中/);
  assert.match(html, /disabled=""/);
  assert.doesNotMatch(html, /aria-label="继续"|aria-label="暂停"/);
});

test("failed cancellation offers a retry without unlocking the task", () => {
  const html = render({ ...item, activity: { ...item.activity, state: "cancelling" }, cancelling: false });
  assert.match(html, /aria-label="重试取消"/);
  assert.doesNotMatch(html, /disabled=""/);
  assert.doesNotMatch(html, /aria-label="继续"|aria-label="暂停"/);
});

test("terminal activities leave no status bar", () => {
  for (const state of ["completed", "failed", "cancelled"] as const)
    assert.equal(render({ ...item, activity: { ...item.activity, state } }), "");
});


test("status follows the current step actor and keeps actors optional", () => {
  const steps = [
    { id: "one", title: "分析需求", actor: { name: "分析师" }, state: "running" as const },
    { id: "two", title: "复核方案", actor: { name: "审核员" }, state: "pending" as const },
  ];
  const first = render({ ...item, activity: { ...item.activity, steps } });
  assert.match(first, /title="分析师"/);
  assert.doesNotMatch(first, /审核员/);
  const next = render({ ...item, activity: { ...item.activity, state: "paused", steps: [{ ...steps[0], state: "completed" }, steps[1]] } });
  assert.match(next, /title="审核员"/);
  assert.doesNotMatch(next, /分析师/);
  assert.doesNotMatch(first, /执行者/);
  assert.doesNotMatch(render(item), /分析师|审核员/);
});
