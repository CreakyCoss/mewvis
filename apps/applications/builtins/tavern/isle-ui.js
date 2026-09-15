document.body.innerHTML = `
  <main class="tavern-app">
    <section id="collection-view" class="collection-view">
      <header class="collection-header">
        <div>
          <p class="eyebrow">角色扮演空间</p>
          <h1>我的酒馆</h1>
          <p class="lead">每个酒馆独立保存一套角色、世界和互动规则。</p>
        </div>
        <div class="header-actions">
          <input id="card-file" type="file" accept=".json,.png,application/json,image/png" hidden />
          <button class="secondary-button" type="button" data-action="import">导入角色卡</button>
          <button class="primary-button" type="button" data-action="create">＋ 新建酒馆</button>
        </div>
      </header>
      <div class="collection-meta">
        <span id="tavern-count">0 个酒馆</span>
        <button class="text-button" type="button" data-action="reload">刷新</button>
      </div>
      <div id="collection-error" class="notice notice-error" role="alert" hidden></div>
      <div id="tavern-grid" class="tavern-grid" aria-live="polite"></div>
    </section>

    <section id="detail-view" class="detail-view" hidden>
      <header class="detail-header">
        <button class="back-button" type="button" data-action="back">‹ 返回酒馆</button>
        <div class="detail-identity">
          <span id="detail-avatar" class="detail-avatar">酒</span>
          <div>
            <div class="title-line">
              <h1 id="detail-title">新酒馆</h1>
              <span id="active-badge" class="active-badge" hidden>当前使用</span>
            </div>
            <p id="save-state">尚未保存</p>
          </div>
        </div>
        <div class="header-actions detail-actions">
          <button id="discard-button" class="secondary-button" type="button" data-action="discard" disabled>放弃修改</button>
          <button id="save-button" class="primary-button" type="button" data-action="save">保存酒馆</button>
        </div>
      </header>

      <div class="detail-layout">
        <nav class="section-nav" aria-label="酒馆设置">
          <button class="section-button is-selected" type="button" data-section-button="overview">
            <strong>基本信息</strong><small>名称、说明与文风</small>
          </button>
          <button class="section-button" type="button" data-section-button="character">
            <strong>角色卡</strong><small>身份、性格和说话方式</small>
          </button>
          <button class="section-button" type="button" data-section-button="scene">
            <strong>场景与开场</strong><small>当前情境和第一句话</small>
          </button>
          <button class="section-button" type="button" data-section-button="world">
            <strong>世界书</strong><small>地点、关系与世界规则</small>
          </button>
          <button class="section-button" type="button" data-section-button="rules">
            <strong>互动规则</strong><small>对话样本与附加约束</small>
          </button>
        </nav>

        <div class="editor-scroll">
          <div id="editor-error" class="notice notice-error" role="alert" hidden></div>
          <form id="tavern-form" class="editor-card">
            <section class="form-section is-selected" data-section="overview">
              <div class="section-heading">
                <p class="eyebrow">01 · 基本信息</p>
                <h2>这是一间怎样的酒馆？</h2>
                <p>名称用于区分酒馆，说明帮助你快速记住这一套设定。</p>
              </div>
              <label for="name">酒馆名称 <span>*</span></label>
              <input id="name" data-field="name" maxlength="120" required placeholder="例如：雾港午夜电台" />
              <label for="description">酒馆说明 <small>可选</small></label>
              <textarea id="description" data-field="description" rows="4" maxlength="500" placeholder="一句话描述这个酒馆的关系与氛围"></textarea>
              <label for="style">叙事文风</label>
              <select id="style" data-field="style">
                <option value="dialogue">对白互动</option>
                <option value="novel">小说叙事</option>
                <option value="dramatic">戏剧张力</option>
                <option value="grounded">克制写实</option>
              </select>
            </section>

            <section class="form-section" data-section="character">
              <div class="section-heading">
                <p class="eyebrow">02 · 角色卡</p>
                <h2>谁在这里与你相遇？</h2>
                <p>角色身份与性格会被注入后续对话。</p>
              </div>
              <label for="characterName">角色名称</label>
              <input id="characterName" data-field="characterName" maxlength="120" placeholder="角色的显示名称" />
              <label for="characterDescription">身份与经历</label>
              <textarea id="characterDescription" data-field="characterDescription" rows="8" placeholder="外貌、身份、经历，以及角色目前知道的事实"></textarea>
              <label for="personality">性格与说话方式</label>
              <textarea id="personality" data-field="personality" rows="7" placeholder="性格特征、口头习惯、态度边界"></textarea>
            </section>

            <section class="form-section" data-section="scene">
              <div class="section-heading">
                <p class="eyebrow">03 · 场景与开场</p>
                <h2>故事从哪里开始？</h2>
                <p>给角色一个具体的当下，而不是抽象背景。</p>
              </div>
              <label for="scenario">当前场景</label>
              <textarea id="scenario" data-field="scenario" rows="9" placeholder="时间、地点、双方关系和眼下正在发生的事"></textarea>
              <label for="firstMessage">参考开场白</label>
              <textarea id="firstMessage" data-field="firstMessage" rows="8" placeholder="角色进入对话时说的第一句话"></textarea>
            </section>

            <section class="form-section" data-section="world">
              <div class="section-heading">
                <p class="eyebrow">04 · 世界书</p>
                <h2>固定这个世界的事实</h2>
                <p>可使用纯文本或 Markdown，按地点、人物、组织分段更容易维护。</p>
              </div>
              <label for="worldBook">世界书内容</label>
              <textarea id="worldBook" data-field="worldBook" class="long-text" rows="20" placeholder="## 地点\n\n## 人物关系\n\n## 世界规则"></textarea>
            </section>

            <section class="form-section" data-section="rules">
              <div class="section-heading">
                <p class="eyebrow">05 · 互动规则</p>
                <h2>定义如何回应</h2>
                <p>用示例稳定语言风格，用附加规则明确行为边界。</p>
              </div>
              <label for="exampleDialogue">示例对话</label>
              <textarea id="exampleDialogue" data-field="exampleDialogue" rows="9" placeholder="{{user}}: ……\n{{char}}: ……"></textarea>
              <label for="systemPrompt">附加规则</label>
              <textarea id="systemPrompt" data-field="systemPrompt" rows="9" placeholder="例如：保持第一人称，不替用户决定关键行动"></textarea>
            </section>
          </form>
        </div>

        <aside class="summary-panel">
          <div class="summary-card">
            <p class="eyebrow">酒馆状态</p>
            <h2 id="summary-name">未命名酒馆</h2>
            <p id="summary-description">填写说明后会显示在这里。</p>
            <dl>
              <div><dt>角色</dt><dd id="summary-character">未设置</dd></div>
              <div><dt>文风</dt><dd id="summary-style">对白互动</dd></div>
              <div><dt>世界书</dt><dd id="summary-world">未填写</dd></div>
            </dl>
            <button id="activate-button" class="secondary-button wide-button" type="button" data-action="activate" disabled>设为当前酒馆</button>
            <button id="context-button" class="text-button wide-button" type="button" data-action="context" disabled>预览注入上下文</button>
          </div>
          <div id="context-card" class="context-card" hidden>
            <div class="context-heading">
              <strong>注入预览</strong>
              <button class="icon-button" type="button" data-action="close-context" aria-label="关闭预览">×</button>
            </div>
            <pre id="context-preview"></pre>
          </div>
          <button id="delete-button" class="delete-button" type="button" data-action="delete" disabled>删除这个酒馆</button>
        </aside>
      </div>
    </section>
  </main>

  <dialog id="confirm-dialog" class="dialog dialog-small">
    <p class="eyebrow danger-copy">删除酒馆</p>
    <h2>这个操作无法撤销</h2>
    <p id="confirm-copy"></p>
    <div class="dialog-actions">
      <button class="secondary-button" type="button" data-action="cancel-delete">取消</button>
      <button id="confirm-delete" class="danger-button" type="button">删除酒馆</button>
    </div>
  </dialog>

  <dialog id="dirty-dialog" class="dialog dialog-small">
    <p class="eyebrow">未保存修改</p>
    <h2>要放弃当前修改吗？</h2>
    <p>继续后，本次还没有保存的内容会丢失。</p>
    <div class="dialog-actions">
      <button class="secondary-button" type="button" data-action="keep-editing">继续编辑</button>
      <button class="danger-button" type="button" data-action="discard-and-continue">放弃并继续</button>
    </div>
  </dialog>
`;

const styles = {
  dialogue: "对白互动",
  novel: "小说叙事",
  dramatic: "戏剧张力",
  grounded: "克制写实",
};

const state = {
  taverns: [],
  activeId: "",
  draft: null,
  original: null,
  dirty: false,
  pendingAction: null,
};

const $ = (selector) => document.querySelector(selector);
const record = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const text = (value) => (typeof value === "string" ? value : "");
const responseValue = (response) => record(response).value;
const emptyTavern = () => ({
  id: "",
  name: "",
  description: "",
  characterName: "",
  characterDescription: "",
  personality: "",
  scenario: "",
  firstMessage: "",
  exampleDialogue: "",
  worldBook: "",
  systemPrompt: "",
  style: "dialogue",
  createdAt: "",
  updatedAt: "",
});
const tavernFrom = (value) => {
  const source = record(value);
  const style = text(source.style);
  return {
    ...emptyTavern(),
    ...Object.fromEntries(
      Object.keys(emptyTavern()).map((key) => [
        key,
        key === "style" ? (styles[style] ? style : "dialogue") : text(source[key]),
      ]),
    ),
  };
};
const clone = (value) => (value ? { ...value } : null);
const setError = (selector, message) => {
  const element = $(selector);
  element.textContent = message || "";
  element.hidden = !message;
};
const setBusy = (button, busy, busyLabel, idleLabel) => {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
};
const initial = (value) => (value.trim().slice(0, 1) || "酒").toUpperCase();

const renderCollection = (loading = false) => {
  const grid = $("#tavern-grid");
  $("#tavern-count").textContent = `${state.taverns.length} 个酒馆`;
  grid.replaceChildren();
  if (loading) {
    grid.innerHTML = '<div class="loading-state"><span class="spinner"></span>正在整理酒馆</div>';
    return;
  }
  if (!state.taverns.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-mark" aria-hidden="true">酒</span>
        <h2>开第一间酒馆</h2>
        <p>创建一套独立的角色、世界书与互动规则，之后可以随时切换。</p>
        <button class="primary-button" type="button" data-action="create">新建酒馆</button>
      </div>`;
    return;
  }
  for (const tavern of state.taverns) {
    const card = document.createElement("article");
    card.className = `tavern-card${tavern.id === state.activeId ? " is-active" : ""}`;
    const top = document.createElement("div");
    top.className = "card-top";
    const avatar = document.createElement("span");
    avatar.className = "card-avatar";
    avatar.textContent = initial(tavern.characterName || tavern.name);
    const status = document.createElement("span");
    status.className = tavern.id === state.activeId ? "card-status active" : "card-status";
    status.textContent = tavern.id === state.activeId ? "当前使用" : styles[tavern.style];
    top.append(avatar, status);
    const heading = document.createElement("h2");
    heading.textContent = tavern.name;
    const description = document.createElement("p");
    description.textContent = tavern.description || "这个酒馆还没有说明。";
    const meta = document.createElement("div");
    meta.className = "card-meta";
    const character = document.createElement("span");
    character.textContent = tavern.characterName || "未设置角色";
    const world = document.createElement("span");
    world.textContent = tavern.worldBook ? "已有世界书" : "无世界书";
    meta.append(character, world);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "open-button";
    button.textContent = "进入酒馆 →";
    button.addEventListener("click", () => openTavern(tavern.id));
    card.append(top, heading, description, meta, button);
    grid.append(card);
  }
};

const renderDraft = () => {
  const draft = state.draft;
  if (!draft) return;
  for (const input of document.querySelectorAll("[data-field]")) {
    input.value = draft[input.dataset.field] || "";
  }
  renderDraftMeta();
};

const renderDraftMeta = () => {
  const draft = state.draft;
  if (!draft) return;
  $("#detail-title").textContent = draft.name || "新酒馆";
  $("#detail-avatar").textContent = initial(draft.characterName || draft.name);
  $("#save-state").textContent = state.dirty ? "有尚未保存的修改" : draft.id ? "所有修改已保存" : "尚未保存";
  $("#save-state").classList.toggle("is-dirty", state.dirty);
  $("#active-badge").hidden = !draft.id || draft.id !== state.activeId;
  $("#discard-button").disabled = !state.dirty;
  $("#summary-name").textContent = draft.name || "未命名酒馆";
  $("#summary-description").textContent = draft.description || "填写说明后会显示在这里。";
  $("#summary-character").textContent = draft.characterName || "未设置";
  $("#summary-style").textContent = styles[draft.style] || styles.dialogue;
  $("#summary-world").textContent = draft.worldBook ? `${draft.worldBook.length} 个字符` : "未填写";
  $("#activate-button").disabled = !draft.id || draft.id === state.activeId || state.dirty;
  $("#activate-button").textContent = draft.id === state.activeId ? "正在使用这个酒馆" : "设为当前酒馆";
  $("#context-button").disabled = !draft.id || state.dirty;
  $("#delete-button").disabled = !draft.id;
};

const updateDraft = (field, value) => {
  if (!state.draft) return;
  state.draft[field] = value;
  state.dirty = true;
  $("#context-card").hidden = true;
  renderDraftMeta();
};

const showSection = (name) => {
  for (const button of document.querySelectorAll("[data-section-button]")) {
    button.classList.toggle("is-selected", button.dataset.sectionButton === name);
  }
  for (const section of document.querySelectorAll("[data-section]")) {
    section.classList.toggle("is-selected", section.dataset.section === name);
  }
  $(".editor-scroll").scrollTo({ top: 0 });
};

const showCollection = () => {
  $("#detail-view").hidden = true;
  $("#collection-view").hidden = false;
  state.draft = null;
  state.original = null;
  state.dirty = false;
  $("#context-card").hidden = true;
};

const showDetail = (tavern) => {
  state.original = clone(tavern);
  state.draft = clone(tavern);
  state.dirty = !tavern.id;
  setError("#editor-error", "");
  showSection("overview");
  renderDraft();
  $("#collection-view").hidden = true;
  $("#detail-view").hidden = false;
  requestAnimationFrame(() => $("#name").focus());
};

const afterDirtyCheck = (action) => {
  if (!state.dirty) {
    action();
    return;
  }
  state.pendingAction = action;
  $("#dirty-dialog").showModal();
};

const openTavern = (id) => {
  const tavern = state.taverns.find((item) => item.id === id);
  if (tavern) afterDirtyCheck(() => showDetail(tavern));
};

const loadTaverns = async () => {
  setError("#collection-error", "");
  renderCollection(true);
  try {
    const value = record(responseValue(await window.isleApplication.executeTool("tavern_list")));
    state.taverns = Array.isArray(value.presets) ? value.presets.map(tavernFrom).filter((item) => item.id) : [];
    state.activeId = text(value.activePresetId);
    renderCollection();
  } catch (error) {
    state.taverns = [];
    renderCollection();
    setError("#collection-error", error instanceof Error ? error.message : String(error));
  }
};

const saveDraft = async () => {
  if (!state.draft) return;
  if (!state.draft.name.trim()) {
    showSection("overview");
    setError("#editor-error", "请先填写酒馆名称。");
    $("#name").focus();
    return;
  }
  const button = $("#save-button");
  setBusy(button, true, "正在保存…", "保存酒馆");
  setError("#editor-error", "");
  try {
    const args = { ...state.draft };
    delete args.createdAt;
    delete args.updatedAt;
    if (!args.id) delete args.id;
    const value = record(responseValue(await window.isleApplication.executeTool("tavern_save", args)));
    const saved = tavernFrom(value.preset);
    state.activeId = text(value.activePresetId) || state.activeId;
    const index = state.taverns.findIndex((item) => item.id === saved.id);
    if (index >= 0) state.taverns[index] = saved;
    else state.taverns.push(saved);
    state.original = clone(saved);
    state.draft = clone(saved);
    state.dirty = false;
    renderDraft();
    renderCollection();
  } catch (error) {
    setError("#editor-error", error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(button, false, "正在保存…", "保存酒馆");
  }
};

const activateDraft = async () => {
  if (!state.draft?.id || state.dirty) return;
  const button = $("#activate-button");
  setBusy(button, true, "正在切换…", "设为当前酒馆");
  setError("#editor-error", "");
  try {
    const value = record(responseValue(await window.isleApplication.executeTool("tavern_activate", { id: state.draft.id })));
    state.activeId = text(value.activePresetId) || state.draft.id;
    renderDraft();
    renderCollection();
  } catch (error) {
    setError("#editor-error", error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(button, false, "正在切换…", "设为当前酒馆");
    renderDraft();
  }
};

const previewContext = async () => {
  if (!state.draft?.id || state.dirty) return;
  const button = $("#context-button");
  setBusy(button, true, "正在生成…", "预览注入上下文");
  setError("#editor-error", "");
  try {
    const value = record(responseValue(await window.isleApplication.executeTool("tavern_context", { id: state.draft.id })));
    $("#context-preview").textContent = text(value.context) || "没有可预览的上下文。";
    $("#context-card").hidden = false;
    $("#context-preview").focus();
  } catch (error) {
    setError("#editor-error", error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(button, false, "正在生成…", "预览注入上下文");
  }
};

const removeDraft = async () => {
  if (!state.draft?.id) return;
  const button = $("#confirm-delete");
  setBusy(button, true, "正在删除…", "删除酒馆");
  try {
    const removedId = state.draft.id;
    const value = record(responseValue(await window.isleApplication.executeTool("tavern_remove", { id: removedId })));
    state.taverns = state.taverns.filter((item) => item.id !== removedId);
    state.activeId = text(value.activePresetId);
    $("#confirm-dialog").close();
    renderCollection();
    showCollection();
  } catch (error) {
    $("#confirm-dialog").close();
    setError("#editor-error", error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(button, false, "正在删除…", "删除酒馆");
  }
};

const worldBookFrom = (value) => {
  const entries = Array.isArray(record(value).entries) ? record(value).entries : [];
  return entries
    .map((entry, index) => {
      const item = record(entry);
      if (item.enabled === false) return "";
      const keys = Array.isArray(item.keys) ? item.keys.filter((key) => typeof key === "string" && key.trim()) : [];
      const title = text(item.comment) || text(item.name) || `条目 ${index + 1}`;
      const content = text(item.content).trim();
      return content
        ? [`## ${title}`, keys.length ? `关键词：${keys.join("、")}` : "", content].filter(Boolean).join("\n")
        : "";
    })
    .filter(Boolean)
    .join("\n\n");
};

const importedTavernFrom = (value, fallbackName) => {
  const outer = record(value);
  const source = Object.keys(record(outer.data)).length ? record(outer.data) : outer;
  const characterName = text(source.name) || fallbackName;
  return {
    ...emptyTavern(),
    name: characterName ? `${characterName}的酒馆` : fallbackName,
    description: text(source.creator_notes ?? source.creatorNotes),
    characterName,
    characterDescription: text(source.description),
    personality: text(source.personality),
    scenario: text(source.scenario),
    firstMessage: text(source.first_mes ?? source.firstMessage),
    exampleDialogue: text(source.mes_example ?? source.exampleDialogue),
    worldBook: worldBookFrom(source.character_book ?? source.characterBook),
    systemPrompt: [text(source.system_prompt), text(source.post_history_instructions)].filter(Boolean).join("\n\n"),
  };
};

const decodeBase64Text = (value) => {
  const binary = atob(value.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
};

const jsonFromPng = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((byte, index) => bytes[index] !== byte)) throw new Error("这不是有效的 PNG 角色卡。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = new TextDecoder("ascii").decode(bytes.slice(offset + 4, offset + 8));
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) break;
    if (type === "tEXt") {
      const chunk = bytes.slice(start, end);
      const separator = chunk.indexOf(0);
      if (separator > 0 && new TextDecoder("latin1").decode(chunk.slice(0, separator)) === "chara") {
        return JSON.parse(decodeBase64Text(new TextDecoder("latin1").decode(chunk.slice(separator + 1))));
      }
    }
    offset = end + 4;
  }
  throw new Error("PNG 中没有找到 SillyTavern chara 元数据，请改用 JSON 角色卡。");
};

const importCard = async (file) => {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) throw new Error("角色卡文件不能超过 10 MB。");
  const fallbackName = file.name.replace(/\.(json|png)$/i, "") || "导入角色";
  const value = file.name.toLowerCase().endsWith(".png") ? await jsonFromPng(file) : JSON.parse(await file.text());
  showDetail(importedTavernFrom(value, fallbackName));
};

for (const input of document.querySelectorAll("[data-field]")) {
  input.addEventListener("input", () => updateDraft(input.dataset.field, input.value));
}

for (const button of document.querySelectorAll("[data-section-button]")) {
  button.addEventListener("click", () => showSection(button.dataset.sectionButton));
}

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "create") afterDirtyCheck(() => showDetail(emptyTavern()));
  if (action === "import") $("#card-file").click();
  if (action === "reload") void loadTaverns();
  if (action === "back") afterDirtyCheck(showCollection);
  if (action === "save") void saveDraft();
  if (action === "discard") {
    if (state.original?.id) {
      state.draft = clone(state.original);
      state.dirty = false;
      renderDraft();
    } else {
      showCollection();
    }
  }
  if (action === "activate") void activateDraft();
  if (action === "context") void previewContext();
  if (action === "close-context") $("#context-card").hidden = true;
  if (action === "delete" && state.draft?.id) {
    $("#confirm-copy").textContent = `“${state.draft.name}” 的角色卡、世界书和规则都会被移除。`;
    $("#confirm-dialog").showModal();
  }
  if (action === "cancel-delete") $("#confirm-dialog").close();
  if (action === "keep-editing") {
    state.pendingAction = null;
    $("#dirty-dialog").close();
  }
  if (action === "discard-and-continue") {
    const next = state.pendingAction;
    state.pendingAction = null;
    state.dirty = false;
    $("#dirty-dialog").close();
    next?.();
  }
});

$("#confirm-delete").addEventListener("click", () => void removeDraft());
$("#card-file").addEventListener("change", async (event) => {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = "";
  try {
    await importCard(file);
  } catch (error) {
    setError("#collection-error", error instanceof Error ? error.message : String(error));
  }
});

void loadTaverns();
