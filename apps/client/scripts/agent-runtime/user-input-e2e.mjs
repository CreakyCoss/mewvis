import assert from "node:assert/strict";
import { mock } from "node:test";
import { build } from "esbuild";
import { resolve } from "node:path";

const entry = resolve(process.cwd(), "../agent-runtime/src/engines/drivers/native/agent/commands/user-input.ts");
const output = await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
});
const { createUserInputManager } = await import(
  `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
);

const events = [];
const manager = createUserInputManager((event) => events.push(event));

const firstAnswer = manager.callbacks.requestUserInput({
  taskId: "task-1",
  question: "书名用什么？",
  input: { type: "text", label: "书名" },
});
const secondAnswer = manager.callbacks.requestUserInput({
  taskId: "task-1",
  question: "主角起点身份？",
  input: {
    type: "select",
    label: "主角起点",
    options: [
      { value: "cook", label: "失业厨师" },
      { value: "owner", label: "小店老板" },
    ],
  },
});

const firstQuestion = events.find((event) => event.type === "question");
assert.ok(firstQuestion, "首个问题应立即发布。\n" + JSON.stringify(events, null, 2));
assert.equal(firstQuestion.question, "书名用什么？");
assert.equal(
  events.filter((event) => event.type === "question").length,
  1,
  "同一任务的第二个并发问题必须等待，不能覆盖前端当前问题。",
);

const otherTaskAnswer = manager.callbacks.requestUserInput({
  taskId: "task-2",
  question: "另一个任务的问题",
  input: { type: "text" },
});
const otherTaskQuestion = events.find((event) => event.type === "question" && event.taskId === "task-2");
assert.ok(otherTaskQuestion, "不同任务不应被同一任务的队列阻塞。");

manager.handleAnswer({
  type: "answer_question",
  taskId: "wrong-task",
  questionId: firstQuestion.questionId,
  answer: "错误回答",
});
assert.equal(events.filter((event) => event.type === "question_answered").length, 0, "回答必须匹配任务。");

manager.handleAnswer({
  type: "answer_question",
  taskId: "task-1",
  questionId: firstQuestion.questionId,
  answer: null,
});
assert.equal(await firstAnswer, null, "取消回答必须返回明确的空值，而不是虚构的用户回答。");
assert.equal(events.find((event) => event.type === "question_answered").answer, null);

const questions = events.filter((event) => event.type === "question" && event.taskId === "task-1");
assert.equal(questions.length, 2, "首题回答后应发布队列中的下一题。\n" + JSON.stringify(events, null, 2));
assert.equal(questions[1].question, "主角起点身份？");
assert.deepEqual(
  events
    .filter((event) => event.taskId === "task-1")
    .slice(0, 3)
    .map((event) => event.type),
  ["question", "question_answered", "question"],
  "问题事件应严格按回答后的 FIFO 顺序发布。",
);

manager.handleAnswer({
  type: "answer_question",
  taskId: "task-1",
  questionId: questions[1].questionId,
  answer: "cook",
});
assert.equal(await secondAnswer, "cook");

manager.handleAnswer({
  type: "answer_question",
  taskId: "task-2",
  questionId: otherTaskQuestion.questionId,
  answer: "另一个回答",
});
assert.equal(await otherTaskAnswer, "另一个回答");

const toolBundle = await build({
  entryPoints: [
    resolve(process.cwd(), "../agent-runtime/src/engines/drivers/native/agent/runtimes/pi/tools/ask-user-tool.ts"),
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { registerPiAskUserTool } = await import(
  `data:text/javascript;base64,${Buffer.from(toolBundle.outputFiles[0].text).toString("base64")}`
);
let tool;
registerPiAskUserTool({ registerTool: (value) => (tool = value) }, "tool-task", manager.callbacks.requestUserInput);
const toolResult = tool.execute("call", { question: "是否补充说明？" });
const toolQuestion = events.find((event) => event.type === "question" && event.taskId === "tool-task");
manager.handleAnswer({
  type: "answer_question",
  taskId: "tool-task",
  questionId: toolQuestion.questionId,
  answer: null,
});
const cancelled = await toolResult;
assert.equal(cancelled.details.cancelled, true);
assert.equal(cancelled.details.answer, null);
assert.match(cancelled.content[0].text, /取消/);
assert.match(cancelled.content[0].text, /未提供信息或授权/);

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10_000 });
try {
  const timedEvents = [];
  const timedManager = createUserInputManager((event) => timedEvents.push(event));
  const pending = timedManager.callbacks.requestUserInput({ taskId: "timed", question: "First?" });
  const rejection = assert.rejects(pending, /等待用户回答超时/);
  const queued = timedManager.callbacks.requestUserInput({ taskId: "timed", question: "Next?" });
  const first = timedEvents[0];
  assert.equal(first.expiresAt, Date.now() + 3 * 60_000, "问题应有三分钟回答时间。");
  mock.timers.tick(3 * 60_000 - 1);
  assert.equal(timedEvents.length, 1, "截止时间前不能结束问题等待。");
  mock.timers.tick(1);
  await rejection;
  assert.equal(timedEvents[1].type, "question_answered");
  assert.equal(timedEvents[1].answer, null, "超时必须通知界面结束等待。");
  const next = timedEvents[2];
  assert.equal(next.type, "question");
  assert.equal(next.expiresAt, Date.now() + 3 * 60_000, "排队的问题在展示时才开始倒计时。");
  timedManager.handleAnswer({ type: "answer_question", taskId: "timed", questionId: first.questionId, answer: "late" });
  assert.equal(timedEvents.length, 3, "超时问题不能接收迟到的回答。");
  timedManager.handleAnswer({ type: "answer_question", taskId: "timed", questionId: next.questionId, answer: null });
  assert.equal(await queued, null);
} finally {
  mock.timers.reset();
}

console.log("agent user input e2e passed");
