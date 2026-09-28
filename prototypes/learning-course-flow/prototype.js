// Static design study. These screens have no persistence or course logic.
const sample = {
  topic: "从零理解数据分析",
  level: "零基础",
  description:
    "从真实问题出发，理解数据整理、描述与分析的基本方法，并能够用清晰的图表解释发现。",
  outline: [
    {
      title: "提出可分析的问题",
      summary: "明确问题边界、需要的数据与判断依据。",
    },
    {
      title: "建立可靠的分析基础",
      summary: "理解数据来源，完成整理与基础描述。",
    },
    {
      title: "解释发现并提出建议",
      summary: "选择合适的表达方式，区分观察与推断。",
    },
  ],
  lessons: [
    {
      title: "认识数据与分析问题",
      objective: "能把一个宽泛问题拆成可回答的数据问题。",
      complete: true,
      body: "数据分析从明确问题开始。先确定想回答什么，再判断需要哪些数据与比较方式。",
      example: "一家书店想知道周末活动是否提高了到店转化率。",
      quiz: "如何将“生意是否更好”改写为可分析的问题？",
    },
    {
      title: "整理与检查数据",
      objective: "识别缺失、重复和异常值，并完成基础整理。",
      complete: true,
      body: "一份可信的数据表应有明确的字段含义、统一的格式和可追溯的异常处理记录。",
      example: "合并两个月的订单数据，统一日期格式并找出重复订单。",
      quiz: "数据清理时为什么需要保留处理记录？",
    },
    {
      title: "用图表描述发现",
      objective: "根据问题选用合适图表并解释变化趋势。",
      complete: false,
      body: "",
      example: "",
      quiz: "",
    },
    {
      title: "从结论到行动建议",
      objective: "区分观察、推断与建议，形成简短分析报告。",
      complete: false,
      body: "",
      example: "",
      quiz: "",
    },
  ],
};

const screen = document.getElementById("screen");
const previous = document.getElementById("previous");
const next = document.getElementById("next");
const overlay = document.getElementById("lesson-overlay");
const toast = document.getElementById("toast");
let currentStep = 0;
let toastTimer;

function announce(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function setupScreen() {
  return `<div class="setup-layout"><div class="setup-main">
    <div class="screen-heading"><span class="eyebrow">01 / 课程设置</span><h1>设置课程</h1></div>
    <div class="setup-panel compact-form">
      <div class="form-group"><label for="topic">课程主题</label><input id="topic" value="${sample.topic}" /></div>
      <div class="inline-fields"><div class="form-group"><label for="level">当前水平</label><select id="level"><option selected>零基础</option><option>了解一些</option><option>希望进阶</option></select></div></div>
      <div class="form-group reference-group"><label for="material">参考资料 <small>选填</small></label><textarea id="material" rows="3" placeholder="粘贴学习笔记、课程要求或资料摘要…"></textarea><button type="button" class="button small secondary" data-design-action="上传参考资料">上传 TXT / Markdown</button></div>
    </div>
  </div></div>`;
}

function outlineScreen() {
  const phases = sample.outline
    .map(
      (phase, index) =>
        `<li><span class="outline-index">${String(index + 1).padStart(2, "0")}</span><div><strong>${phase.title}</strong><p>${phase.summary}</p></div></li>`,
    )
    .join("");
  return `<div class="overview-layout"><div class="screen-heading"><span class="eyebrow">02 / 课程大纲</span><h1>课程大纲</h1></div>
    <article class="overview-card syllabus-sheet"><div class="overview-top"><div><h2>${sample.topic}</h2><p>${sample.description}</p></div><button type="button" class="button small secondary" data-open-outline>编辑大纲</button></div>
      <section class="syllabus-section"><h3>课程目标</h3><p>学会从实际问题出发，整理数据、识别关键信息，并清楚表达分析结论。</p></section>
      <section class="syllabus-section"><h3>学习路径</h3><ol class="outline-list">${phases}</ol></section>
    </article>
  </div>`;
}

function lessonsScreen() {
  const rows = sample.lessons
    .map(
      (lesson, index) =>
        `<div class="lesson-row"><button type="button" class="lesson-info" data-open-lesson="${index}"><span class="lesson-index">${String(index + 1).padStart(2, "0")}</span><span class="lesson-copy"><strong>${lesson.title}</strong><small>${lesson.objective}</small></span><span class="chip ${lesson.complete ? "success" : "pending"}">${lesson.complete ? "已完成" : "待编写"}</span><span class="lesson-chevron" aria-hidden="true">›</span></button></div>`,
    )
    .join("");
  return `<div class="lesson-layout"><section class="lesson-main"><div class="screen-heading"><span class="eyebrow">03 / 课时内容</span><h1>课时内容</h1></div><div class="section-heading"><div><h2>课时列表</h2><p>2 / 4 已完成</p></div><div class="heading-actions"><button type="button" class="button small ghost" data-design-action="调整顺序">调整顺序</button><button type="button" class="button small secondary" data-design-action="添加课时">添加课时</button></div></div><div class="progress-line"><span style="width:50%"></span></div><div class="lesson-table">${rows}</div></section></div>`;
}

function projectScreen() {
  return `<div class="project-layout"><div class="screen-heading"><span class="eyebrow">04 / 项目实训</span><h1>项目实训</h1></div><div class="project-grid"><section class="project-panel"><h2>是否添加项目实训？</h2><label class="project-option"><input type="radio" name="project" /><span><strong>暂不添加</strong><p>之后可在课程编辑中添加。</p></span></label><label class="project-option active"><input type="radio" name="project" checked /><span><strong>添加综合项目</strong><p>用实际成果串联课程知识。</p></span></label><div class="project-extra"><h3>项目草案</h3><div class="form-group"><label>项目名称</label><input value="用数据讲清一家书店的周末经营变化" /></div><div class="form-group"><label>交付成果</label><textarea rows="3">一份包含问题、数据检查、图表和行动建议的简短分析报告。</textarea></div><button type="button" class="button small ghost" data-design-action="AI 生成项目框架">让 AI 生成项目框架</button></div></section><aside class="project-aside"><h3>课程完成情况</h3><div class="rule"></div><div class="stat">2 / 4 课时已完成</div><small>还有 2 个课时需要正文与练习</small><div class="rule"></div><div class="stat">项目实训：已加入草案</div></aside></div></div>`;
}

const screens = [setupScreen, outlineScreen, lessonsScreen, projectScreen];

function render() {
  screen.innerHTML = screens[currentStep]();
  document.querySelectorAll(".stepper button").forEach((button, index) => {
    button.classList.toggle("active", index === currentStep);
    button.classList.toggle("visited", index < currentStep);
    button.setAttribute(
      "aria-current",
      index === currentStep ? "step" : "false",
    );
  });
  previous.disabled = currentStep === 0;
  next.textContent =
    currentStep === 3
      ? "保存课程"
      : currentStep === 2
        ? "下一步：项目实训"
        : "下一步";
  screen.scrollTop = 0;
}

document.querySelectorAll(".stepper button").forEach((button) =>
  button.addEventListener("click", () => {
    currentStep = Number(button.dataset.step);
    render();
  }),
);
previous.addEventListener("click", () => {
  currentStep = Math.max(0, currentStep - 1);
  render();
});
next.addEventListener("click", () => {
  if (currentStep === 3)
    return announce("设计稿示意：补全 4 个课时后可保存课程");
  currentStep += 1;
  render();
});
document
  .getElementById("stash")
  .addEventListener("click", () => announce("设计稿示意：课程已暂存"));
document
  .getElementById("close-workspace")
  .addEventListener("click", () =>
    announce("当前为静态设计稿，可通过步骤条查看四个页面"),
  );

screen.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-outline]")) {
    document.getElementById("outline-overlay").hidden = false;
    document.getElementById("outline-description").focus();
    return;
  }
  const open = event.target.closest("[data-open-lesson]");
  if (open) {
    const lesson = sample.lessons[Number(open.dataset.openLesson)];
    document.getElementById("lesson-dialog-title").textContent = lesson.title;
    document.getElementById("lesson-title").value = lesson.title;
    document.getElementById("lesson-objective").value = lesson.objective;
    document.getElementById("lesson-body").value = lesson.body;
    document.getElementById("lesson-example").value = lesson.example;
    document.getElementById("lesson-quiz").value = lesson.quiz;
    document.getElementById("lesson-ai-action").textContent = lesson.complete
      ? "AI 优化课时"
      : "AI 生成课时";
    document.getElementById("lesson-ai-intro").textContent = lesson.complete
      ? "描述想调整的内容，先预览结果，再决定是否采用。"
      : "根据课时标题与目标生成正文、示例和测验。";
    document.getElementById("lesson-ai-instruction").value = "";
    overlay.hidden = false;
    document.getElementById("lesson-title").focus();
    return;
  }
  const action = event.target.closest("[data-design-action]");
  if (action) announce(`设计稿示意：${action.dataset.designAction}`);
});

function closeLesson() {
  overlay.hidden = true;
}
function closeOutline() {
  document.getElementById("outline-overlay").hidden = true;
}
document
  .getElementById("close-outline")
  .addEventListener("click", closeOutline);
document
  .getElementById("cancel-outline")
  .addEventListener("click", closeOutline);
document
  .getElementById("outline-overlay")
  .addEventListener("click", (event) => {
    if (event.target.id === "outline-overlay") closeOutline();
    const action = event.target.closest("[data-design-action]");
    if (action) announce(`设计稿示意：${action.dataset.designAction}`);
  });
document.getElementById("outline-form").addEventListener("submit", (event) => {
  event.preventDefault();
  closeOutline();
  announce("设计稿示意：大纲已保存");
});
document.getElementById("close-lesson").addEventListener("click", closeLesson);
document.getElementById("cancel-lesson").addEventListener("click", closeLesson);
document
  .getElementById("lesson-ai-action")
  .addEventListener("click", () =>
    announce("设计稿示意：AI 结果将在此弹窗中预览，确认后采用"),
  );
overlay.addEventListener("click", (event) => {
  if (event.target === overlay) closeLesson();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !overlay.hidden) closeLesson();
  if (event.key === "Escape") closeOutline();
});
document.getElementById("lesson-form").addEventListener("submit", (event) => {
  event.preventDefault();
  closeLesson();
  announce("设计稿示意：课时编辑表单");
});

render();
