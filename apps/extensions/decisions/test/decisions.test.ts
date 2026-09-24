import test from "node:test";
import assert from "node:assert/strict";
import { readProfiles } from "../src/profiles";
import { evaluate, parseAnswer } from "../src/evaluate";
import extension from "../src/index";
import metadata from "../package.json";

const profiles = readProfiles(
  metadata["isle.extension"].configuration.defaults,
);
const [choice, score, noul] = profiles;
const answer = (
  type = "choice",
  value: unknown = "功能开发",
  confidence = 0.9,
) =>
  JSON.stringify({
    type,
    value,
    confidence,
    reason: "材料中有明确的功能要求。",
  });
const fakeHost = (responses: string[]) => {
  const calls: any[] = [];
  return {
    calls,
    supports: () => true,
    tasks: {
      async run(input: unknown, options: unknown) {
        calls.push({ input, options });
        return { text: responses.shift() ?? "invalid" };
      },
    },
  };
};

test("typed decisions enforce choice membership, integer rubric and booleans", () => {
  assert.equal(parseAnswer(answer(), choice).status, "accepted");
  assert.equal(parseAnswer(answer("score", 2), score).value, 2);
  assert.equal(parseAnswer(answer("noul", false), noul).value, false);
  for (const [profile, raw] of [
    [choice, answer("choice", "未定义选项")],
    [score, answer("score", 1.5)],
    [score, answer("score", 4)],
    [noul, answer("noul", "true")],
    [choice, answer("choice", "功能开发", 1.1)],
    [choice, answer("score", 1)],
    [choice, '{"type":"choice","value":"功能开发","confidence":0.9}'],
    [choice, answer().replace('"type":', '"extra":true,"type":')],
  ] as const)
    assert.throws(() => parseAnswer(raw, profile));
  assert.throws(() => parseAnswer(`说明文字\n${answer()}`, choice));
  assert.equal(
    parseAnswer(`\`\`\`json\n${answer()}\n\`\`\``, choice).value,
    "功能开发",
  );
});

test("uncertainty is explicit, threshold never changes the chosen answer", () => {
  const low = parseAnswer(answer("choice", "功能开发", 0.69), choice);
  assert.equal(low.status, "review_required");
  assert.equal(low.value, "功能开发");
  assert.equal(low.confidenceSource, "model_self_report");
  assert.equal(
    parseAnswer(answer("choice", "功能开发", 0.7), choice).status,
    "accepted",
  );
  for (const profile of profiles)
    assert.equal(
      parseAnswer(answer(profile.type, null, 0), profile).status,
      "abstained",
    );
});

test("configuration rejects duplicate IDs, ambiguous choices and invalid profiles", () => {
  assert.throws(() => readProfiles({ profiles: [choice, choice] }));
  assert.throws(() =>
    readProfiles({ profiles: [{ ...choice, choices: ["a", " a "] }] }),
  );
  assert.throws(() => readProfiles({ profiles: [{ ...choice, name: " " }] }));
  assert.throws(() =>
    readProfiles({ profiles: [{ ...noul, choices: ["a", "b"] }] }),
  );
  assert.throws(() =>
    readProfiles({ profiles: [{ ...score, threshold: NaN }] }),
  );
  assert.deepEqual(readProfiles({ profiles: [] }), []);
});

test("evaluation uses current host task without tools, retries only malformed answers", async () => {
  const host = fakeHost(["not JSON", answer()]);
  const signal = new AbortController().signal;
  const result = await evaluate(choice, "开发一个搜索功能", host, signal);
  assert.equal(result.answer.value, "功能开发");
  assert.match(result.text, /未经校准/);
  assert.equal(host.calls.length, 2);
  assert.equal(host.calls[0].input.tools, "none");
  assert.equal(host.calls[0].options.signal, signal);
  assert.match(host.calls[1].input.text, /未通过格式校验/);
  const invalid = fakeHost(["invalid", "invalid"]);
  await assert.rejects(evaluate(choice, "材料", invalid, signal), /两次/);
  assert.equal(invalid.calls.length, 2);
  const failed = {
    supports: () => true,
    tasks: {
      run: async () => {
        throw new Error("模型不可用");
      },
    },
  };
  await assert.rejects(evaluate(choice, "材料", failed, signal), /模型不可用/);
});

test("cancellation, unsupported hosts and empty input never fabricate an answer", async () => {
  const controller = new AbortController();
  const host = fakeHost([answer()]);
  await assert.rejects(
    evaluate(choice, " ", host, controller.signal),
    /请输入|输入/,
  );
  await assert.rejects(
    evaluate(choice, "x".repeat(24001), host, controller.signal),
  );
  await assert.rejects(
    evaluate(
      choice,
      "材料",
      { ...host, supports: () => false },
      controller.signal,
    ),
    /不支持/,
  );
  controller.abort();
  await assert.rejects(evaluate(choice, "材料", host, controller.signal), {
    name: "AbortError",
  });
  assert.equal(host.calls.length, 0);
  const active = new AbortController();
  await assert.rejects(
    evaluate(
      choice,
      "材料",
      {
        supports: () => true,
        tasks: {
          async run() {
            active.abort();
            return { text: answer() };
          },
        },
      },
      active.signal,
    ),
    { name: "AbortError" },
  );
});

test("each template exposes a named slash command and a matching model tool", async () => {
  const commands: any[] = [],
    tools: any[] = [];
  const host = fakeHost([answer(), answer()]);
  extension.setup({
    config: { profiles },
    host,
    registerCommand: (value: any) => commands.push(value),
    registerTool: (value: any) => tools.push(value),
  } as any);
  assert.deepEqual(
    commands.map((item) => item.label),
    ["需求分类", "方案评分", "执行条件判断"],
  );
  assert.ok(commands.every((item) => item.inputMode === "text"));
  const context = { signal: new AbortController().signal };
  assert.equal(
    (await commands[0].execute({ text: "功能" }, context)).answer.value,
    "功能开发",
  );
  const result = await tools[0].execute({ text: "功能" }, context);
  assert.equal(result.details.answer.value, "功能开发");
  assert.equal(result.content[0].text, result.details.text);
});
