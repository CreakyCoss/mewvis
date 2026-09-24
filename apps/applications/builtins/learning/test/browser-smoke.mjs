// Run against `pnpm --filter @isle/learning dev --port 5178`.
// Uses real UI + SDK + preview Chat engine. Only model output is deterministic.
// Never connects to a configured model or the user's application database.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const out = process.env.LEARNING_SCREENSHOTS || "/tmp/isle-learning-v2-smoke";
await mkdir(out, { recursive: true });
const fixtureLesson = {
  title: "模型返回的标题",
  objective: "模型目标",
  content:
    "主动回忆是从记忆中提取知识。先尝试解释，再查看资料检查。\n\n通过多次提取和反馈，可以发现自己尚未理解的部分。",
  example: "合上书，尝试解释刚刚学过的概念，再打开书核对。",
  takeaways: ["先提取，再核对"],
  questions: [
    {
      type: "single_choice",
      question: "主动回忆的第一步是什么？",
      options: [
        { value: "A", label: "先尝试提取" },
        { value: "B", label: "直接看答案" },
      ],
      answer: "A",
      explanation: "先提取能暴露理解缺口。",
    },
    {
      type: "multiple_choice",
      question: "哪些步骤有助于主动回忆？",
      options: [
        { value: "A", label: "合上书解释" },
        { value: "B", label: "核对并改正" },
        { value: "C", label: "只看不练" },
      ],
      answer: ["A", "B"],
      explanation: "提取和反馈都重要。",
    },
    {
      type: "short_answer",
      question: "用自己的话解释主动回忆。",
      answer: "主动从记忆提取知识并反馈",
      rubric: "提取和反馈各 0.5 分",
      explanation: "不能只反复阅读。",
    },
  ],
};
await page.addInitScript(
  ({ lesson }) => {
    globalThis.__learningFixture = (prompt) => {
      if (globalThis.__failLearningOnce) {
        globalThis.__failLearningOnce = false;
        return '{"invalid":';
      }
      if (prompt.includes("逐项评审，不执行代码")) {
        const data = JSON.parse(prompt.split("项目与成果参考数据：")[1]);
        const id = (name) =>
          prompt.match(new RegExp('"' + name + '":"([^"\\s]+)"'))[1];
        const met = data.submission.includes("改进");
        return JSON.stringify({
          projectId: id("projectId"),
          stageId: id("stageId"),
          submissionId: id("submissionId"),
          summary: met ? "已满足阶段标准" : "还需要补充目标",
          checks: data.milestone.criteria.map((c) => ({
            criterionId: c.id,
            met,
            feedback: met ? "成果包含明确目标与反馈" : "请补充目标与反馈",
          })),
          suggestions: met ? [] : ["补充目标与反馈"],
        });
      }
      if (prompt.includes("设计一个包含 2–6 个阶段"))
        return JSON.stringify({
          title: "学习指南实训",
          scenario: "给新同学写一份指南",
          role: "学习教练",
          outcome: "可执行的学习指南",
          milestones: [1, 2].map((n) => ({
            title: `实践阶段 ${n}`,
            goal: "形成具体计划",
            steps: ["确定目标", "设计练习"],
            deliverable: "提交文字计划",
            criteria: ["目标可检验", "包含练习与反馈"],
          })),
        });
      if (prompt.includes("submissionId")) {
        const data = JSON.parse(prompt.split("以下是参考数据：")[1]);
        const submissionId = prompt.match(/"submissionId":"([0-9]+)"/)[1];
        return JSON.stringify({
          submissionId,
          grades: data.questions.map((q) => ({
            questionId: q.id,
            score: 0.5,
            feedback: "已解释提取，请补充反馈。",
          })),
        });
      }
      if (prompt.includes("只生成指定课时")) return JSON.stringify(lesson);
      return JSON.stringify({
        title: "主动回忆入门",
        description: "理解、实践并检验主动回忆。",
        level: "零基础",
        lessons: [1, 2, 3].map((n) => ({
          title: `第 ${n} 课`,
          objective: `完成第 ${n} 个学习目标`,
        })),
      });
    };
  },
  { lesson: fixtureLesson },
);
await page.route("**/chat-host.js*", async (route) => {
  const response = await route.fetch();
  let body = await response.text();
  const marker = body.indexOf(
    "const text = `###",
    body.indexOf("function createPreviewChat"),
  );
  const end = body.indexOf("let offset = 0;", marker);
  assert.ok(
    marker >= 0 && end > marker,
    "preview fixture boundary must still exist",
  );
  body =
    body.slice(0, marker) +
    "const text = globalThis.__learningFixture(turn.input.text);\n" +
    body.slice(end);
  body = body.replace("offset += 16", "offset += 4096");
  await route.fulfill({ response, body, contentType: "text/javascript" });
});
const button = (name) => page.getByRole("button", { name, exact: true });
const adopt = () => button("采用并保存结果").click();
const generate = () => button("开始生成").click();
const data = () =>
  page.evaluate(async () => {
    const api = globalThis.isleApplication.data;
    const keys = (await api.request({ version: 1, method: "storage.keys" }))
      .value;
    const result = {};
    for (const key of keys)
      result[key] = (
        await api.request({
          version: 1,
          method: "storage.getItem",
          params: { key },
        })
      ).value;
    return result;
  });
try {
  await page.goto(process.env.LEARNING_URL || "http://127.0.0.1:5178/");
  await button("创建新课程").click();
  await page.getByLabel("你想学什么？", { exact: true }).fill("主动回忆");
  await button("保存需求，开始规划").click();
  await button("准备生成大纲").click();
  await generate();
  await adopt();
  await page
    .getByLabel("课时标题", { exact: true })
    .first()
    .fill("理解主动回忆");
  await button("保存大纲修改").click();
  await button("我的课程").click();
  await button("创建课程").click();
  await page.getByLabel("课时标题", { exact: true }).first().waitFor();
  assert.equal(
    await page.getByLabel("课时标题", { exact: true }).first().inputValue(),
    "理解主动回忆",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: `${out}/outline-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (let i = 0; i < 3; i++) {
    await button("生成下一个待完成课时").click();
    if (i === 1)
      await page.evaluate(() => {
        globalThis.__failLearningOnce = true;
      });
    await generate();
    if (i === 1) {
      await page.getByRole("alert").filter({ hasText: "完整 JSON" }).waitFor();
      assert.equal(await button("采用并保存结果").count(), 0);
      await button("重新生成 / 重试").click();
    }
    await adopt();
  }
  await page.screenshot({ path: `${out}/outline-desktop.png`, fullPage: true });
  await button("保存课程，开始学习").click();
  await page.getByRole("tab", { name: /课后测验/ }).click();
  await page.getByRole("radio").first().check();
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByLabel("第 3 题作答").fill("主动从记忆中提取知识");
  await button("提交答案").click();
  await button("连接 AI 评阅").click();
  await generate();
  await adopt();
  await page.getByText("AI 评分：0.5 / 1 分", { exact: true }).waitFor();
  await page.screenshot({ path: `${out}/quiz-desktop.png`, fullPage: true });
  let values = await data();
  const course = Object.values(values).find(
    (v) => v?.version === 2 && v?.lessons,
  );
  assert.ok(course);
  assert.equal(values["learning:draft:v2"], undefined);
  assert.equal(
    values[`learning:progress:${course.id}`].attempts[course.lessons[0].id]
      .grades[course.lessons[0].questions[2].id].score,
    0.5,
  );
  await button("课程库").click();
  await button("开始学习").click();
  await page.getByRole("tab", { name: /课后测验/ }).click();
  await page.getByText("AI 评分：0.5 / 1 分", { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: `${out}/quiz-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await button("编辑 / 重新生成").click();
  await button("重新生成本课").nth(1).click();
  await generate();
  await adopt();
  await button("保存课程，开始学习").click();
  values = await data();
  const revised = values[`learning:course:${course.id}`];
  assert.equal(revised.lessons[0].id, course.lessons[0].id);
  assert.notEqual(revised.lessons[1].id, course.lessons[1].id);
  assert.equal(revised.lessons[2].id, course.lessons[2].id);
  await page.getByRole("tab", { name: "项目实训", exact: true }).click();
  await button("设计实训项目").click();
  await generate();
  await adopt();
  await page
    .getByRole("heading", { name: "学习指南实训", exact: true })
    .waitFor();
  await page.getByLabel(/我的成果/).fill("第一版成果草稿");
  await button("保存成果草稿").click();
  await button("课程库").click();
  await button("开始学习").click();
  await page.getByRole("tab", { name: "项目实训", exact: true }).click();
  assert.equal(
    await page.getByLabel(/我的成果/).inputValue(),
    "第一版成果草稿",
  );
  await button("提交成果").click();
  await button("请求导师评审").click();
  await generate();
  await adopt();
  await page
    .getByRole("heading", { name: "已保存的导师评审", exact: true })
    .waitFor();
  assert.equal(await button("标记阶段完成").isDisabled(), true);
  await page
    .getByLabel(/我的成果/)
    .fill("改进成果：目标可检验，加入练习和反馈。");
  await button("提交修改后的成果").click();
  await button("请求导师评审").click();
  await generate();
  await adopt();
  await button("标记阶段完成").click();
  await page.getByText("本阶段已完成", { exact: true }).waitFor();
  await button("2. 实践阶段 2").click();
  await page.getByLabel(/我的成果/).fill("第二阶段的草稿");
  await button("保存成果草稿").click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: `${out}/pbl-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${out}/pbl-desktop.png`, fullPage: true });
  values = await data();
  const project = values[`learning:pbl:${course.id}`];
  assert.equal(project.progress["stage-1"].completed, true);
  assert.equal(project.progress["stage-2"].draft, "第二阶段的草稿");
  await button("编辑 / 重新生成").click();
  await button("手动编辑内容").first().click();
  await page
    .getByLabel("课时正文", { exact: true })
    .fill("手动修正的课程正文。主动回忆应包含提取与反馈。");
  await page.getByLabel("题干", { exact: true }).first().fill("修订后的单选题");
  await page.screenshot({ path: `${out}/manual-editor.png`, fullPage: true });
  await button("保存课时到草稿").click();
  await button("保存课程，开始学习").click();
  await page
    .getByText("手动修正的课程正文。主动回忆应包含提取与反馈。", {
      exact: true,
    })
    .waitFor();
  await page.getByRole("tab", { name: "项目实训", exact: true }).click();
  await page
    .getByText("课程内容已更新，此项目保留创建时的课程目标与已有成果。", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByLabel(/我的成果/).inputValue(),
    "第二阶段的草稿",
  );
  values = await data();
  assert.notEqual(
    values[`learning:course:${course.id}`].lessons[0].id,
    revised.lessons[0].id,
  );
  assert.equal(
    values[`learning:course:${course.id}`].lessons[1].id,
    revised.lessons[1].id,
  );
  await button("课程库").click();
  await button("移除").click();
  await button("确认移除").click();
  await page
    .getByRole("heading", { name: "你的下一次探索，从这里开始" })
    .waitFor();
  assert.equal((await data())[`learning:pbl:${course.id}`], undefined);
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Browser smoke passed: editable outline, navigation recovery, per-lesson retry, mixed quiz, AI score persistence, targeted rewrite, PBL review/resubmit/recovery, manual content edits, project removal and mobile overflow checks.",
  );
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true });
  console.error((await page.locator("body").innerText()).slice(-8000));
  throw error;
} finally {
  await browser.close();
}
