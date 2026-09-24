import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, parseAnswer, requestSchema } from "../src/evaluate";
import { readRules, type Rule } from "../src/rules";
import extension from "../src/index";
import type { DecisionRequest } from "@isle/extension-sdk/host";
const request: DecisionRequest = {
  input: "已经完成测试",
  question: "是否可以实施？",
  output: { type: "boolean" },
};
const rule: Rule = {
  id: "release",
  name: "发布",
  when: "判断发布条件",
  enabled: true,
  priority: 10,
  instructions: "必须包含回滚方案",
  threshold: 0.9,
};
const match = (...ids: string[]) => ({
  matches: ids.map((id) => ({ id, confidence: 0.95 })),
});
const raw = (value: unknown = true, confidence = 0.95, type = "boolean") => ({
  type,
  value,
  confidence,
  reason: "根据给出的材料判断",
});
const fixture = (responses: unknown[]) => {
  const calls: any[] = [];
  return {
    calls,
    supports: () => true,
    tasks: {
      async run(input: any, options: any) {
        calls.push({ input, options });
        const next = responses.shift();
        if (next instanceof Error) throw next;
        return { text: typeof next === "string" ? next : JSON.stringify(next) };
      },
    },
  };
};
const signal = () => new AbortController().signal;

test("custom rules win without changing caller output or consulting builtins", async () => {
  const host = fixture([match("release"), raw(false)]);
  const result = await evaluate(request, [rule], host, signal());
  assert.equal(result.value, false);
  assert.equal(result.status, "accepted");
  assert.equal(host.calls.length, 2);
  assert.match(host.calls[1].input.systemPrompt, /必须包含回滚方案/);
  assert.ok(host.calls.every(({ input }) => input.tools === "none"));
  assert.equal(result.confidence?.source, "model_self_report");
});

test("unmatched custom rules fall back to builtin rules then general judgment", async () => {
  const builtin = fixture([match(), match("readiness"), raw()]);
  await evaluate(request, [rule], builtin, signal());
  assert.match(builtin.calls[2].input.systemPrompt, /检查目标/);
  const general = fixture([match(), match(), raw()]);
  await evaluate(request, [rule], general, signal());
  assert.match(general.calls[2].input.systemPrompt, /依据问题与材料直接判断/);
  const disabled = fixture([match(), raw()]);
  await evaluate(request, [{ ...rule, enabled: false }], disabled, signal());
  assert.equal(disabled.calls.length, 2);
});

test("priority is resolved in code, uncertain matching falls through", async () => {
  const host = fixture([match("release", "higher"), raw()]);
  await evaluate(
    request,
    [
      rule,
      { ...rule, id: "higher", priority: 90, instructions: "高优先级标准" },
    ],
    host,
    signal(),
  );
  assert.match(host.calls[1].input.systemPrompt, /高优先级标准/);
  const uncertain = fixture([
    { matches: [{ id: "release", confidence: 0.5 }] },
    match(),
    raw(),
  ]);
  await evaluate(request, [rule], uncertain, signal());
  assert.equal(uncertain.calls.length, 3);
});

test("abstention and low confidence never fall through after matching", async () => {
  for (const [value, status] of [
    [null, "abstained"],
    [false, "review_required"],
  ] as const) {
    const host = fixture([match("release"), raw(value, 0.2)]);
    assert.equal(
      (await evaluate(request, [rule], host, signal())).status,
      status,
    );
    assert.equal(host.calls.length, 2);
  }
});

test("malformed selection is retried once; transport failures are not fallback", async () => {
  const repaired = fixture(["invalid", match(), raw()]);
  assert.equal((await evaluate(request, [], repaired, signal())).value, true);
  const unknown = fixture([match("invented"), match("invented")]);
  await assert.rejects(evaluate(request, [rule], unknown, signal()), /两次/);
  assert.equal(unknown.calls.length, 2);
  const failed = fixture([new Error("offline")]);
  await assert.rejects(evaluate(request, [rule], failed, signal()), /offline/);
  assert.equal(failed.calls.length, 1);
});

test("caller constraints are enforced; policy IDs are not part of the protocol", async () => {
  assert.throws(() => requestSchema.parse({ ...request, policyId: "release" }));
  assert.throws(() => parseAnswer(raw("true"), request, 0.7));
  const choice: DecisionRequest = {
    ...request,
    output: { type: "choice", options: ["通过", "修改"] },
  };
  assert.equal(
    parseAnswer(raw("通过", 0.9, "choice"), choice, 0.7).value,
    "通过",
  );
  assert.throws(() => parseAnswer(raw("其他", 0.9, "choice"), choice, 0.7));
  const score: DecisionRequest = {
    ...request,
    output: { type: "score", levels: ["低", "中", "高"] },
  };
  assert.equal(parseAnswer(raw(2, 0.9, "score"), score, 0.7).value, 2);
  for (const value of [3, -1, 1.5])
    assert.throws(() => parseAnswer(raw(value, 0.9, "score"), score, 0.7));
  const host = fixture([match("release"), raw("true"), raw("true")]);
  await assert.rejects(evaluate(request, [rule], host, signal()), /两次/);
  assert.equal(host.calls.length, 3);
});

test("rule validation and cancellation are bounded", async () => {
  assert.deepEqual(readRules({ rules: [] }), []);
  assert.throws(() => readRules({ rules: [rule, rule] }));
  assert.throws(() => readRules({ rules: [{ ...rule, when: " " }] }));
  const host = fixture([]),
    controller = new AbortController();
  controller.abort();
  await assert.rejects(evaluate(request, [], host, controller.signal), {
    name: "AbortError",
  });
  assert.equal(host.calls.length, 0);
});

test("provider, command and tool share the same standard judgment implementation", async () => {
  const providers = new Map(),
    commands: any[] = [],
    tools: any[] = [];
  const host = fixture([match(), raw(), match(), raw()]);
  extension.setup({
    config: { rules: [] },
    host,
    provide: (name: string, handler: any) => providers.set(name, handler),
    registerCommand: (item: any) => commands.push(item),
    registerTool: (item: any) => tools.push(item),
  } as any);
  const result = await providers.get("decisions.evaluate")(request, {
    signal: signal(),
  });
  assert.equal(result.value, true);
  assert.equal(tools.length, 1);
  assert.deepEqual(tools[0].parameters.required, [
    "input",
    "question",
    "output",
  ]);
  const executed = await commands
    .find((item) => item.name === "ready")
    .execute({ text: "完成测试" }, { signal: signal() });
  assert.equal(executed.answer.value, true);
});
