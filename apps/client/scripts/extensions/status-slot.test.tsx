import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DefaultStatus, type StatusSlotItem } from "@isle/extension-host/ui/slots/status";
import { defineUIContribution, uiSlotDefinitions } from "@isle/extension-host/ui";

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
  assert.match(render(item), />暂停<\/button>/);
  const pausing = render({ ...item, activity: { ...item.activity, state: "pausing" } });
  assert.match(pausing, /当前步骤完成后暂停/);
  assert.match(pausing, />撤回暂停<\/button>/);
  const paused = render({ ...item, activity: { ...item.activity, state: "paused" } });
  assert.match(paused, /已暂停/);
  assert.match(paused, />继续<\/button>/);
  assert.match(paused, />取消<\/button>/);
  assert.match(paused, /Draft · 完成/);
  assert.match(paused, /Review · 等待/);
});

test("status only offers pause for capable activities and disables controls while a request is pending", () => {
  assert.doesNotMatch(render({ ...item, activity: { ...item.activity, pausable: false } }), />暂停<\/button>/);
  assert.doesNotMatch(render({ ...item, canPause: false }), />暂停<\/button>/);
  assert.doesNotMatch(render({ ...item, activity: { ...item.activity, state: "completed" } }), /<button/);
  assert.equal((render({ ...item, pendingAction: "pause" }).match(/disabled=""/g) ?? []).length, 2);
});

test("cancelling status retains a disabled cancel control until termination", () => {
  const html = render({ ...item, activity: { ...item.activity, state: "cancelling" }, cancelling: true });
  assert.match(html, /取消中/);
  assert.match(html, /disabled=""/);
  assert.doesNotMatch(html, />继续<\/button>|>暂停<\/button>/);
});

test("failed cancellation offers a retry without unlocking the task", () => {
  const html = render({ ...item, activity: { ...item.activity, state: "cancelling" }, cancelling: false });
  assert.match(html, />重试取消<\/button>/);
  assert.doesNotMatch(html, /disabled=""/);
  assert.doesNotMatch(html, />继续<\/button>|>暂停<\/button>/);
});
