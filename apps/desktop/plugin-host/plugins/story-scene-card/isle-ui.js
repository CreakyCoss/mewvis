document.body.innerHTML = `
  <main class="scene-workbench">
    <header class="page-heading">
      <div>
        <p class="eyebrow">小说能力 · 场景设计</p>
        <h1>场景卡工作台</h1>
        <p class="intro">先锁定人物的目标、阻力和失败代价，再生成一张可直接约束正文创作的场景卡。</p>
      </div>
      <span class="security-note">通过宿主工具执行</span>
    </header>

    <div class="workspace-grid">
      <form class="panel scene-form" aria-labelledby="scene-form-title">
        <div class="panel-heading">
          <div>
            <h2 id="scene-form-title">场景约束</h2>
            <p>三个核心字段必须明确、具体，并能在当前场景内发生。</p>
          </div>
          <span class="step-mark" aria-label="第一步">01</span>
        </div>

        <div class="field">
          <label for="scene-goal">人物目标 <span aria-hidden="true">*</span></label>
          <textarea id="scene-goal" name="goal" rows="3" required maxlength="600" placeholder="例如：在宴会结束前拿到城防图"></textarea>
          <p class="field-help">写人物此刻主动想完成的动作，而不是长期愿望。</p>
        </div>

        <div class="field">
          <label for="scene-conflict">核心阻力 <span aria-hidden="true">*</span></label>
          <textarea id="scene-conflict" name="conflict" rows="3" required maxlength="600" placeholder="例如：负责保管图纸的副将始终没有离席"></textarea>
          <p class="field-help">阻力需要持续施压，并迫使人物改变策略。</p>
        </div>

        <div class="field">
          <label for="scene-stakes">失败代价 <span aria-hidden="true">*</span></label>
          <textarea id="scene-stakes" name="stakes" rows="3" required maxlength="600" placeholder="例如：潜伏身份暴露，接应者会被连夜处决"></textarea>
          <p class="field-help">说明失败后会立刻变糟的具体后果。</p>
        </div>

        <div class="field">
          <label for="scene-turn">场景转折 <span class="optional">可选</span></label>
          <textarea id="scene-turn" name="turn" rows="3" maxlength="600" placeholder="例如：副将主动递来图纸，却要求主角杀掉接应者"></textarea>
          <p class="field-help">留空时，工具会补充一个改变下一步行动的信息点。</p>
        </div>

        <div id="scene-status" class="status" role="alert" aria-live="assertive" tabindex="-1" hidden></div>
        <button class="primary-action" type="submit">
          <span class="spinner" aria-hidden="true"></span>
          <span class="button-label">生成场景卡</span>
        </button>
      </form>

      <section class="panel result-panel" aria-labelledby="scene-result-title" aria-live="polite">
        <div class="panel-heading">
          <div>
            <h2 id="scene-result-title">场景卡</h2>
            <p>生成结果会保留为后续写作或改稿时的约束。</p>
          </div>
          <span class="step-mark" aria-label="第二步">02</span>
        </div>

        <div class="empty-result">
          <span class="empty-mark" aria-hidden="true"></span>
          <h3>等待生成</h3>
          <p>填写左侧约束后生成场景卡。结果不会替你写正文，而是帮助正文保持方向与张力。</p>
        </div>

        <dl class="result-card" tabindex="-1" hidden>
          <div><dt>人物目标</dt><dd data-result="goal"></dd></div>
          <div><dt>核心阻力</dt><dd data-result="conflict"></dd></div>
          <div><dt>失败代价</dt><dd data-result="stakes"></dd></div>
          <div><dt>场景转折</dt><dd data-result="turn"></dd></div>
          <div class="drafting-prompt"><dt>正文约束</dt><dd data-result="draftingPrompt"></dd></div>
        </dl>
      </section>
    </div>
  </main>
`;

const form = document.querySelector(".scene-form");
const submit = form.querySelector("button[type='submit']");
const buttonLabel = submit.querySelector(".button-label");
const status = document.querySelector("#scene-status");
const emptyResult = document.querySelector(".empty-result");
const resultCard = document.querySelector(".result-card");

const setBusy = (busy) => {
  submit.disabled = busy;
  submit.setAttribute("aria-busy", String(busy));
  form.classList.toggle("is-busy", busy);
  buttonLabel.textContent = busy ? "正在生成" : "生成场景卡";
};

const showError = (message) => {
  status.textContent = message;
  status.hidden = false;
  status.focus({ preventScroll: false });
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  status.hidden = true;
  status.textContent = "";
  setBusy(true);
  const data = new FormData(form);
  const args = {
    goal: String(data.get("goal") || "").trim(),
    conflict: String(data.get("conflict") || "").trim(),
    stakes: String(data.get("stakes") || "").trim(),
  };
  const turn = String(data.get("turn") || "").trim();
  if (turn) args.turn = turn;

  try {
    const response = await window.islePlugin.executeTool("isle_story_scene_card", args);
    const value = response.value || {};
    for (const field of ["goal", "conflict", "stakes", "turn", "draftingPrompt"]) {
      resultCard.querySelector(`[data-result="${field}"]`).textContent = String(value[field] || "");
    }
    emptyResult.hidden = true;
    resultCard.hidden = false;
    resultCard.focus({ preventScroll: false });
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(false);
  }
});
