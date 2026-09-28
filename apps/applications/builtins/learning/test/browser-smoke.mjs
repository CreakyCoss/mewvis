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
const out = process.env.LEARNING_SCREENSHOTS || "/tmp/isle-learning-v4-smoke";
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
      if (prompt.includes("只修改指定课时中与要求相关的字段"))
        return JSON.stringify({ changes: { example: "修改后的业务场景示例" } });
      if (prompt.includes("请根据本课目标给我一个分步学习提示"))
        return [
          "先试着解释主动回忆，再打开要点自测核对遗漏。",
          ...Array(35).fill("先独立解释概念，再核对例子、要点与测验反馈。"),
        ].join("\n\n");
      if (prompt.includes("只生成指定课时")) return JSON.stringify(lesson);
      return JSON.stringify({
        description: "理解、实践并检验主动回忆。",
        level: "零基础",
        goal: "掌握主动回忆的方法，并用于自己的学习。",
        phases: [
          { title: "理解方法", summary: "认识主动回忆的核心步骤。" },
          { title: "实践反馈", summary: "在学习任务中练习并改进。" },
        ],
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
const closeEditor = () =>
  page.getByRole("dialog").getByRole("button", { name: /关闭/ }).click();
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
  await button("创建第一门课程").waitFor();
  await page.screenshot({
    path: `${out}/library-empty-desktop.png`,
    fullPage: true,
  });
  await button("创建第一门课程").click();
  await page.screenshot({
    path: `${out}/create-dialog-desktop.png`,
    fullPage: true,
  });
  assert.equal(await page.getByLabel("参考资料 选填").isVisible(), true);
  await page.getByLabel("课程主题", { exact: true }).fill("主动回忆");
  assert.equal(await page.getByRole("dialog").count(), 1);
  await page.getByLabel("上传 TXT / Markdown").setInputFiles([
    {
      name: "notes.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("主动回忆练习"),
    },
    {
      name: "source.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("先提取再反馈"),
    },
  ]);
  await page.waitForFunction(() =>
    document
      .querySelector("#learning-material")
      ?.value.includes("来源：source.txt"),
  );
  await page.getByLabel("参考资料 选填").waitFor();
  assert.match(
    await page.getByLabel("参考资料 选填").inputValue(),
    /来源：notes.md[\s\S]*来源：source.txt/,
  );
  await button("下一步：课程大纲").click();
  assert.equal(await page.locator(".learn-dialog-steps button").count(), 4);
  await button("手动创建大纲").waitFor();
  assert.equal(
    await page
      .locator(".learn-dialog-footer")
      .getByRole("button", { name: "下一步：课时内容" })
      .isDisabled(),
    true,
  );
  await button("AI 生成大纲").click();
  await generate();
  await adopt();
  await page.screenshot({
    path: `${out}/outline-collapsed-desktop.png`,
    fullPage: true,
  });
  assert.equal(await button("编辑大纲").count(), 1);
  assert.equal(await button("AI 优化大纲").count(), 1);
  assert.equal(await page.getByLabel("课程名称").count(), 0);
  await button("下一步：课时内容").click();
  assert.equal(await page.locator(".learn-lesson-workspace").count(), 1);
  await page.getByRole("complementary", { name: "课程 AI 助手" }).waitFor();
  assert.equal(await page.locator(".learn-lesson-card").count(), 0);
  for (let i = 0; i < 3; i++) await button("添加课时").click();
  await page.locator(".learn-lesson-card").first().click();
  assert.equal(await page.locator(".learn-lesson-workspace").count(), 1);
  await page.getByLabel("课时标题", { exact: true }).fill("理解主动回忆");
  await button("保存标题与目标").click();
  await page
    .locator(".learn-dialog-footer")
    .getByRole("button", { name: "暂存" })
    .click();
  await button("继续编辑").click();
  await page
    .locator(".learn-lesson-card")
    .first()
    .getByText("理解主动回忆")
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: `${out}/lesson-workspace-mobile.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (let i = 0; i < 3; i++) {
    await page
      .locator(".learn-lesson-cards li")
      .nth(i)
      .getByRole("button", { name: "AI" })
      .click();
    await button("开始生成").click();
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
  await button("下一步：项目实训").click();
  await button("保存课程").click();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.getByRole("complementary", { name: "AI 学习导师" }).waitFor();
  await page.locator(".learn-chat").waitFor();
  assert.equal(await button("连接 AI 导师").count(), 0);
  assert.equal(await button("编辑课程").count(), 0);
  assert.equal(
    await page
      .locator(".learn-main.is-lesson")
      .evaluate((node) => getComputedStyle(node).overflow),
    "hidden",
  );
  const layoutBefore = await page.evaluate(() => ({
    header: document.querySelector(".learn-course-top").getBoundingClientRect()
      .top,
    tutor: document.querySelector(".learn-tutor").getBoundingClientRect().top,
  }));
  await page.locator(".learn-reading").evaluate((node) => {
    node.scrollTop = 500;
  });
  const layoutAfter = await page.evaluate(() => ({
    header: document.querySelector(".learn-course-top").getBoundingClientRect()
      .top,
    tutor: document.querySelector(".learn-tutor").getBoundingClientRect().top,
  }));
  assert.deepEqual(layoutAfter, layoutBefore);
  await page.screenshot({ path: `${out}/lesson-desktop.png`, fullPage: true });
  await page.locator(".learn-recall-card").first().click();
  assert.equal(
    await page
      .locator(".learn-recall-card")
      .first()
      .getAttribute("aria-expanded"),
    "true",
  );
  await page.locator(".learn-tutor-guide summary").click();
  await button("看例子").click();
  assert.equal(await page.locator(".learn-example.learn-focused").count(), 1);
  await button("请 AI 导师给下一步提示").click();
  await page
    .getByText("先试着解释主动回忆，再打开要点自测核对遗漏。", { exact: true })
    .waitFor();
  await page.waitForFunction(() => {
    const scroller = document.querySelector(
      ".learn-chat [class*='overflow-y-auto']",
    );
    return scroller && scroller.scrollHeight > scroller.clientHeight;
  });
  assert.ok(
    await page
      .locator(".learn-chat [class*='overflow-y-auto']")
      .first()
      .evaluate((node) => {
        node.scrollTop = 0;
        return (
          node.scrollHeight > node.clientHeight &&
          getComputedStyle(node).overflowY === "auto"
        );
      }),
  );
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
  await page.getByText(/最近一次掌握参考：83%/).waitFor();
  await page.screenshot({ path: `${out}/quiz-desktop.png`, fullPage: true });
  let values = await data();
  const course = Object.values(values).find(
    (v) => v?.version === 2 && v?.lessons,
  );
  assert.ok(course);
  assert.equal(values["learning:draft:v2"], undefined);
  assert.equal(values["learning:data-version"], "course-flow-v5");
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
  await button("展开对话").click();
  assert.equal(
    await page
      .locator(".learn-reading")
      .evaluate((node) => getComputedStyle(node).display),
    "none",
  );
  await button("返回课程").click();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: `${out}/quiz-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await button("只练需巩固的 1 题").click();
  assert.equal(await page.locator(".learn-quiz fieldset").count(), 1);
  await page.getByLabel("第 3 题作答").fill("主动提取知识，再核对并修正理解");
  await button("提交答案").click();
  await page.getByText("练习记录 · 共 2 次").waitFor();
  await page.getByText(/最近一次掌握参考：100%.*1 道简答待评/).waitFor();
  values = await data();
  assert.equal(
    values[`learning:progress:${course.id}`].history[course.lessons[0].id]
      .length,
    1,
  );
  await button("课程库").click();
  await button("编辑课程").click();
  await page.locator(".learn-dialog-steps button").nth(1).click();
  await button("编辑大纲").click();
  await page.getByLabel("课程简介").fill("暂存后继续完善的课程简介");
  await page
    .locator(".learn-dialog-footer")
    .getByRole("button", { name: "暂存" })
    .click();
  await button("继续编辑").waitFor();
  assert.equal(await button("开始学习").count(), 0);
  assert.equal(await button("继续学习").count(), 0);
  await page.getByLabel("课程状态：暂存").waitFor();
  values = await data();
  assert.equal(values[`learning:course:${course.id}`].status, "stashed");
  assert.equal(
    values[`learning:course:${course.id}`].outline.description,
    "暂存后继续完善的课程简介",
  );
  await button("继续编辑").click();
  await button("编辑大纲").click();
  assert.equal(
    await page.getByLabel("课程简介").inputValue(),
    "暂存后继续完善的课程简介",
  );
  assert.equal(await page.getByRole("dialog").getByText(/草稿/).count(), 0);
  await button("下一步：课时内容").click();
  await page
    .locator(".learn-lesson-cards li")
    .nth(1)
    .getByRole("button", { name: "AI" })
    .click();
  await button("开始生成").click();
  await generate();
  await adopt();
  await button("下一步：项目实训").click();
  await button("保存课程").click();
  values = await data();
  assert.equal(values[`learning:course:${course.id}`].status, "ready");
  const revised = values[`learning:course:${course.id}`];
  assert.equal(revised.lessons[0].id, course.lessons[0].id);
  assert.notEqual(revised.lessons[1].id, course.lessons[1].id);
  assert.equal(revised.lessons[2].id, course.lessons[2].id);
  assert.equal(await button("项目实训").count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: `${out}/project-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await button("课程库").click();
  await button("编辑课程").click();
  await page.locator(".learn-dialog-steps button").nth(3).click();
  await page.getByRole("radio", { name: /添加综合项目/ }).check();
  await button("AI 生成项目框架").click();
  await generate();
  await adopt();
  await page.getByLabel("项目标题").waitFor();
  await page.getByLabel("项目标题").fill("学习指南实训（修订版）");
  await button("保存项目计划").click();
  await button("保存课程").click();
  await button("开始学习").click();
  await button("项目实训").click();
  await page
    .getByRole("heading", { name: "学习指南实训（修订版）", exact: true })
    .waitFor();
  await page.getByLabel(/我的成果/).fill("第一版成果草稿");
  await button("保存成果草稿").click();
  await button("课程库").click();
  await button("开始学习").click();
  await button("项目实训").click();
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
  await button("课程库").click();
  await button("编辑课程").click();
  await page.locator(".learn-lesson-card").first().click();
  await page
    .getByLabel("课时正文", { exact: true })
    .fill("手动修正的课程正文。主动回忆应包含提取与反馈。");
  await page.getByLabel("题干", { exact: true }).first().fill("修订后的单选题");
  await page.screenshot({ path: `${out}/manual-editor.png`, fullPage: true });
  await button("保存课时修改").click();
  await button("下一步：项目实训").click();
  await button("保存课程").click();
  await page
    .getByText("手动修正的课程正文。主动回忆应包含提取与反馈。", {
      exact: true,
    })
    .waitFor();
  await button("项目实训").click();
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
  await button("编辑课程").click();
  await page.getByRole("tab", { name: "局部优化" }).click();
  await page.getByLabel("补充你的要求").fill("只修改本课示例");
  await button("开始优化").click();
  await generate();
  await adopt();
  await button("下一步：项目实训").click();
  await button("保存课程").click();
  values = await data();
  assert.equal(
    values[`learning:course:${course.id}`].lessons[0].example,
    "修改后的业务场景示例",
  );
  assert.equal(
    values[`learning:course:${course.id}`].lessons[1].id,
    revised.lessons[1].id,
  );
  await button("课程库").click();
  await page.screenshot({ path: `${out}/library-desktop.png`, fullPage: true });
  await button("创建课程").click();
  await page.getByLabel("课程主题", { exact: true }).fill("并行草稿");
  await page
    .locator(".learn-dialog-footer")
    .getByRole("button", { name: "暂存" })
    .click();
  await button("继续编辑").click();
  assert.equal(
    await page.getByLabel("课程主题", { exact: true }).inputValue(),
    "并行草稿",
  );
  await button("下一步：课程大纲").click();
  await closeEditor();
  await button("继续编辑").waitFor();
  await button("编辑课程").click();
  await page.locator(".learn-dialog-steps button").nth(3).waitFor();
  await closeEditor();
  await button("继续编辑").click();
  await page.getByRole("heading", { name: "并行草稿" }).waitFor();
  await closeEditor();
  await page.locator(".learn-card-menu summary").click();
  await button("复制课程 JSON").click();
  await button("已复制课程 JSON").waitFor();
  await page
    .locator(".learn-card-menu-content")
    .getByRole("button", { name: "移除课程" })
    .click();
  await button("确认移除").click();
  await button("移除课程").click();
  await button("确认移除").click();
  await page
    .getByRole("heading", { name: "你的下一次探索，从这里开始" })
    .waitFor();
  assert.equal((await data())[`learning:pbl:${course.id}`], undefined);
  await button("创建第一门课程").click();
  await page.getByLabel("课程主题", { exact: true }).fill("手动规划课程");
  await button("下一步：课程大纲").click();
  await button("手动创建大纲").click();
  assert.equal(await page.getByLabel("课程名称").count(), 0);
  await button("下一步：课时内容").click();
  await page.locator(".learn-lesson-card").first().click();
  await page.getByLabel("课时标题", { exact: true }).fill("第一课标题");
  await button("保存标题与目标").click();
  await page
    .locator(".learn-lesson-card")
    .first()
    .getByText("第一课标题")
    .waitFor();
  await page.locator(".learn-lesson-card").first().click();
  await page.getByLabel("课时正文", { exact: true }).waitFor();
  await button("取消本次编辑").click();
  await page
    .locator(".learn-dialog-footer")
    .getByRole("button", { name: "暂存" })
    .click();
  await button("继续编辑").click();
  await page
    .locator(".learn-lesson-card")
    .first()
    .getByText("第一课标题")
    .waitFor();
  await closeEditor();
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Browser smoke passed: unified course dialog, temporary course status and resume, automatic tutor connection and scrolling, mobile tutor expansion, staged generation, grading, PBL, and editing.",
  );
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true });
  console.error((await page.locator("body").innerText()).slice(-8000));
  throw error;
} finally {
  await browser.close();
}
