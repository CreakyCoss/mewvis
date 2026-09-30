# 酒馆设置 · 方案 1 实现验收

final result: passed

视觉与布局没有未解决的 P0/P1/P2 问题。验收对象是用户选定的第 1 张设计稿，以及当前工作区中的真实 `TavernManageContent` 组件。原有运行参数的接入限制见本轮分类验收。

## 三个标签去重、分类与提示图标 · 最新验收

用户要求统一重复入口、调整分类，并将说明文字改为 label 后的提示图标，悬停时显示。本轮以当前已确认的真实界面为基准，保留原有视觉样式与小屏密度。

### 审查步骤与结果

| 步骤 | 调整前问题 | 调整后分类 | 结果 |
| --- | --- | --- | --- |
| 1 · 基础 | “呈现规则”和“房间文风”与第二个标签重复；固定发言模式混入基础信息。 | “基础与场景”只编辑酒馆名称、视觉场景。 | 去重完成，预览与场景选择保留。 |
| 2 · 呈现与叙事 | 呈现方式、文风已有入口，但动作与内心描写分散在运行设置。 | “内容呈现”统一呈现方式、动作与内心描写；“叙事与文风”统一叙事策略、房间文风、补充要求。 | 每项配置只有一个编辑入口。原“系统叙事”改称“叙事策略”，与文风区分。 |
| 3 · 运行设置 | 互动控制、导演参数和显示开关混在一起；“导演人数”容易被理解为导演数量。 | 改称“互动与调度”，分成互动方式和导演调度；“导演人数”改称“每轮发言人数”，回环轮次改称“每回合调度轮次”。 | 分类和名称已调整，沉浸显示开关移至第二个标签。 |

叙事策略与房间文风是两个独立配置：前者控制系统叙事策略，后者提供房间整体写作风格，保留各自唯一入口，不合并存储字段。导演调度是当前固定模式，改为“互动方式”标题旁的说明，不再呈现为不可编辑的输入框。

### 本轮截图证据

三个步骤均在本轮实际打开并截图。两侧视口均为 1280 × 720，浅色主题、雨夜酒馆、通用场景、对话演绎、小说风格、沉浸开启。每张原截图均已检查；整体与局部合成比较也已打开检查。

| 步骤 | 调整前 | 最终实现 |
| --- | --- | --- |
| 1 | ![基础调整前](/Users/haowen.zheng/.codex/visualizations/2026/09/30/01a0f006-ec5d-7981-80bd-61e6d4c3c3b2/tavern-classification-before-01-basic.png) | ![基础与场景](/Users/haowen.zheng/.codex/visualizations/2026/09/30/01a0f006-ec5d-7981-80bd-61e6d4c3c3b2/tavern-classification-after-01-basic.png) |
| 2 | ![叙事调整前](/Users/haowen.zheng/.codex/visualizations/2026/09/30/01a0f006-ec5d-7981-80bd-61e6d4c3c3b2/tavern-classification-before-02-narrative.png) | ![呈现与叙事](/Users/haowen.zheng/.codex/visualizations/2026/09/30/01a0f006-ec5d-7981-80bd-61e6d4c3c3b2/tavern-classification-after-02-narrative.png) |
| 3 | ![运行调整前](/Users/haowen.zheng/.codex/visualizations/2026/09/30/01a0f006-ec5d-7981-80bd-61e6d4c3c3b2/tavern-classification-before-03-runtime.png) | ![互动与调度](/Users/haowen.zheng/.codex/visualizations/2026/09/30/01a0f006-ec5d-7981-80bd-61e6d4c3c3b2/tavern-classification-after-03-interaction.png) |

- 整体比较：同目录 `tavern-classification-comparison.jpg`，三行依次对应三个步骤，左侧调整前、右侧最终实现。全部原图 1280 × 720，不进行缩放。
- 可读表单比较：`tavern-classification-comparison-fields.jpg`，两侧使用相同裁区 `(80,12)-(739,646)`。
- 提示浮层：`tavern-settings-tips-open.png`。手机默认说明图标布局：`tavern-settings-tips-mobile.png`。
- 用户追加选择圆圈问号后，仅替换共用提示组件的图标。最新截图为 `tavern-settings-question-icons.png`（默认浏览器视口 687 × 690），实际确认 4 个可见字段提示均使用 `lucide-circle-help`，图标宽度仍为 14px；类型检查通过。上方分类比较图保留此前 Info 图标阶段的验收状态。
- 实现地址：`http://127.0.0.1:5174/`，真实生产组件与设计系统，数据读写使用独立临时示例文件。

### 视觉与交互验收

- 字体、颜色、圆角、分隔线、场景素材与右侧预览保留原有规范；调整范围为字段归属、标签名称、分组和说明的显示方式。
- 说明统一使用现有设计系统 Tooltip 与 Lucide CircleHelp 圆圈问号图标，位于 label 或分组标题后。按用户追加要求由 Info 更换为 CircleHelp，小尺寸、灰色样式与提示交互保持原样。默认不占用说明行；悬停显示，按钮可键盘聚焦，具有明确的无障碍名称、焦点环和 24px 点击区域。浮层配置 12px 边缘避让。
- 浏览器实际验证键盘聚焦出现“每轮安排 1–6 名角色发言。”，查看说明不改变草稿；Escape 收起浮层且设置弹窗保持打开。没有宣称完整无障碍合规。
- 1280 × 720 下三个默认标签的主体均为 `clientHeight = scrollHeight = 506`。最终叙事策略与房间文风控件 top 均为 y=345；没有字段重复、横向溢出或默认内容滚动。
- 390 × 740 下三个标签均可完整排入一行，控件保留 40px，文档宽度 390px，固定页脚底边 y=727。窄屏长内容保持正常滚动。
- 三个标签分别修改名称、场景、呈现、叙事策略、文风、补充要求、发言人数与沉浸开关，统一保存后检查独立 JSON。移动沉浸开关不会覆盖调度配置；取消后重新打开仍显示已保存值。验收后示例数据恢复。
- 最终 `pnpm --filter @isle/story check`、`pnpm --filter @isle/story build` 与 `git diff --check` 通过；浏览器没有新的 error/warn。

### 现有功能限制

代码检索确认 `directorNarrativeControl` 中的控制权、调度规模、旁白压力，以及 `directorLoop.maxRounds`，目前只在设置编辑、默认配置和存储归一化中使用，当前运行流程未读取。用户已在本轮进度说明中获知；本次保留配置和编辑入口，仅调整分类，不扩展导演运行逻辑。完整桌面宿主未运行，浏览器验证使用真实组件和独立示例存储。

## 小屏间距调整 · 上一轮验收

用户确认整体视觉后要求略减尺寸与 padding。本轮以已确认的界面为视觉基准，按窗口高度调整密度，没有隐藏滚动条或裁掉字段。

- Source visual truth（本轮响应式基准）：`/Users/haowen.zheng/.codex/visualizations/2026/09/30/01a0f006-ec5d-7981-80bd-61e6d4c3c3b2/tavern-settings-compact-before.jpg`；同一真实组件在 1280 × 720 下的调整前截图。整体美术方向仍来自下文的第 1 张设计稿。
- Latest implementation screenshot：同目录 `tavern-settings-compact-1280.jpg`。比较两侧都是 1280 × 720 px、CSS 视口 1280 × 720、devicePixelRatio = 1，不需要密度缩放。
- 同一画布的完整比较：`tavern-settings-compact-comparison.jpg`；原尺寸表单局部比较：`tavern-settings-compact-form-comparison.jpg`。两张合成图都已打开检查。
- 大窗口回归比较：`tavern-settings-compact-desktop-comparison.jpg`，两侧均为 1440 × 1024 px，左侧是已确认的 `tavern-settings-refinement-basic.jpg`，右侧是本轮 `tavern-settings-compact-desktop.jpg`；原尺寸对齐后观察结构与排版。
- 相同状态：浅色主题、雨夜酒馆、基础标签、通用场景、对话演绎、小说风格、沉浸开启。调整前关闭按钮处于焦点状态，这个焦点环不是布局差异。

### 发现与修复历史

1. [P2 / 已修复] 调整前 1280 × 720 的主体 `clientHeight = 481`、`scrollHeight = 585`，预览固定高度 510px；基础页下方控件需要滚动才能看见。将较矮桌面窗口的控件由 40px 调为 36px，外侧 padding 改为水平 20px / 纵向 16px，略减分组和头尾间距，缩短场景缩略图高度。预览随窗口高度调整，720px 高窗口为 460px。
2. [P2 / 已修复] 第一版压缩后基础页完整显示，但叙事页仍多出 24px。字段内部间隔从 8px 调为 6px，补充要求文本框最小高度调为 80px，保留用户调整文本框尺寸及长内容滚动的能力。最终叙事页 `clientHeight = scrollHeight = 506`，证据为 `tavern-settings-compact-narrative.jpg`。
3. 最终三个默认标签在 1280 × 720 下均为 `clientHeight = scrollHeight = 506`。运行设置截图：`tavern-settings-compact-runtime.jpg`。基础页最新截图与完整、局部合成比较确认所有默认字段和操作栏都可见；结果 passed。

### 五项视觉表面复核

- 字体与排版：标题、分组、正文和说明文字的字体、字号及字重保持原有层级。场景说明行高仅在紧凑模式中由 20px 调为 18px；说明依然清楚可读。
- 间距与布局：紧凑规则只在宽度至少 640px、视口高度至多 820px 时生效。名称、发言模式、呈现规则控件保持对齐，1280 × 720 的三个控件左边缘均为 x=201。1440 × 1024 保留 40px 控件、24px 外侧 padding、510px 预览和原有组间距，主体 `586 / 586`。
- 颜色与 token：没有变更颜色、边框、圆角、阴影、语义色或主题逻辑；间距变量限于酒馆设置弹窗。
- 图片与素材：复用全部现有素材，当前显示的 5 张图片都已加载；只在紧凑模式中调整缩略图比例、预览高度，裁切仍保留主要场景。没有新增占位素材或绘制替代图案。
- 文案与内容：原有字段、说明、标签、示例和保存提示均保留。没有通过省略设置内容来消除滚动。

### 浏览器验证

- 1366 × 768：默认基础页主体 `554 / 554`，36px 控件、508px 预览。
- 展开全部 8 个场景：主体 `554 / 879`，正常保留滚动，页脚底边 y=755 在窗口内；选择“科幻”并收起后保持选择，切回“通用”恢复已保存状态。
- 390 × 740：控件仍为 40px，页面宽度 390px，固定页脚底边 y=727。截图为 `tavern-settings-compact-mobile.jpg`，单列长内容正常滚动。
- 最终页面重新加载后控制台没有新的 error/warn。
- 本轮 `pnpm --filter @isle/story check`、`pnpm --filter @isle/story build` 和 `git diff --check` 通过；没有修改读写或保存逻辑。
- 很矮的窗口、长文本或展开全部场景仍可能需要滚动，这是保留可读性和完整内容的正常行为。

## 用户确认后的追加调整

- 最新实现截图：`/Users/haowen.zheng/.codex/visualizations/2026/09/30/01a0f006-ec5d-7981-80bd-61e6d4c3c3b2/tavern-settings-refinement-basic.jpg`。
- 按用户要求移除运行设置中的“酒馆模型”分组；同时移除该页面的模型列表请求、状态和参数。运行设置现在从“导演调度”开始，证据为同目录 `tavern-settings-refinement-runtime.jpg`。
- [P2 / 已修复] 基础页的“发言模式”使用 5.5rem 标签列和 12px 间距，“呈现规则”使用 4rem 标签列和 8px 间距，造成控件左边缘错位。现在相关字段统一为 5.5rem / 12px。1440 × 1024 下名称、导演调度、呈现规则控件左边缘都为 x=285；发言模式标签和控件纵向中心均为 y=742.25。
- 本轮完整合成比较：`tavern-settings-refinement-comparison.jpg`；可读局部比较：`tavern-settings-refinement-alignment.jpg`。沿用下文同一设计源与像素归一化方式，已实际打开两张合成图，确认修复后的列宽与对齐。
- 字体、颜色、图片、文案沿用上一轮验收；本轮再次确认标签与控件排版、表单节奏及模型分组移除后的内容顺序。未出现新的 P0/P1/P2 问题。
- 390 × 844 再次验证：页面宽度 390，无横向溢出，固定页脚位于 y=752–821。最新窄屏证据：`tavern-settings-refinement-mobile.jpg`。
- 本轮类型/运行边界检查与构建通过。展示与布局调整不改变存储配置，功能验收沿用前一轮记录。

## 视觉证据与归一化

- Source visual truth: `/Users/haowen.zheng/.codex/generated_images/01a0f006-ec5d-7981-80bd-61e6d4c3c3b2/exec-758a5c13-d408-4dc0-996e-b9376ad5e153.png`
- Implementation URL: `http://127.0.0.1:5174/`，临时宿主加载真实组件；数据读写使用独立示例文件，不涉及用户酒馆。
- Implementation screenshot: `/Users/haowen.zheng/.codex/visualizations/2026/09/30/01a0f006-ec5d-7981-80bd-61e6d4c3c3b2/tavern-settings-final.jpg`
- State: 浅色主题、基础标签、雨夜酒馆、通用场景、对话演绎、小说风格、沉浸描写开启。
- Viewport: 1440 × 1024 CSS px，devicePixelRatio = 1；实现截图 1440 × 1024 px。
- Source: 1488 × 1058 px；生成稿没有可读取的 CSS 尺寸或设备密度，因此按同一页面画布缩放至 1440 × 1024 px，不能视为逐像素基准。
- Full-view comparison: `tavern-settings-comparison-final.jpg`，在同一 2880 × 1056 画布中展示归一化后的设计与实现。
- Modal comparison: `tavern-settings-comparison-modal.jpg`，额外裁出两侧弹窗并对齐至 1120 × 800。设计裁区为归一化画布的 `(136,92)-(1304,941)`，实现裁区为 `(160,112)-(1280,912)`；用于比较结构，避免外部画布位置影响判断。
- Focused comparisons: `tavern-settings-comparison-form.jpg`、`tavern-settings-comparison-preview.jpg`、`tavern-settings-comparison-header.jpg`、`tavern-settings-comparison-footer.jpg`。均来自同一对齐弹窗，已实际打开并比较，文字和控件可读。

以上比较图、补充截图及迭代截图均位于 `/Users/haowen.zheng/.codex/visualizations/2026/09/30/01a0f006-ec5d-7981-80bd-61e6d4c3c3b2/`。

## 五项视觉检查

| 表面 | 结论与证据 |
| --- | --- |
| 字体与排版 | 使用项目实际字体 `Inter Variable / PingFang SC / Hiragino Sans GB / Microsoft YaHei`，标题 20/28、分组 16/24、正文 14、说明 12/20。与生成稿的中文无衬线层级一致；生成稿的具体字体不可精确辨认。控件字体和标签沿用产品规范；窄屏副标题截断，场景说明最多两行，未出现重叠。 |
| 间距与布局 | 顶部标题与横向标签，主体左侧分组表单、右侧预览，底部固定操作。弹窗 1120 × 800、桌面内边距 24、主体间距 24；与稿件相比采用略小的产品窗口。默认基础页可滚动区 `clientHeight = scrollHeight = 586`，全部基础字段可见。390 × 844 下改为单列并保留底部操作，页面宽度等于视口，无横向溢出。 |
| 颜色与视觉 token | 使用现有白色卡片、紫色 primary、灰色说明文字和 border token；没有引入第二套色板。选中场景的紫色环、勾选和当前标签下划线一致。深色主题使用同一语义 token，正文、边框和控件仍可辨认。 |
| 图片与素材 | 复用现有 8 种场景背景、已有武侠人物头像及 Lucide 图标，5 个当前显示的图片全部加载，背景原图 1672 × 941、头像 320 × 320。预览采用左侧裁切，保留窗口、竹叶和桌面细节，没有用 CSS/SVG 图画代替素材。生成稿强化了灯光、陈设和动漫人物，这些不是现有独立素材；实现保持产品已有美术资源，作为明确接受的差异。 |
| 文案与内容 | 保留房间信息、视觉场景、互动与呈现、三个标签及全部实际配置。示例被明确标记为“示例内容，用于查看视觉与呈现效果。”；保存提示对应真实草稿状态，失败提示能说明修改仍在当前页面。场景描述复用现有预设，未把讨论中的设计要求写进产品。 |

## 比较历史与修复

1. 第一轮：`comparison-v1.jpg` / `implementation-desktop-v1.jpg`，结果 blocked。
   - [P2] 默认基础页内容比可视区多 16 px。字段接近固定底栏，影响首屏完整性。修复分组纵向间距、说明文字行数，保留可滚动主体。
   - [P2] 分隔线紧贴上一组控件，节奏不一致。改用相邻 section 的顶部边框，边框之前留组间距、之后留 20 px 内边距。
   - [P2] 中心裁切的通用场景缺少环境细节。预览图片改为 `object-left`，使窗口和桌面进入画面。
2. 第二轮：`implementation-desktop-v2.jpg`。以上三项已经修复；默认基础页可视高度与内容高度均为 586 px。最终合成比较图与局部图再次确认间距、完整性与裁切。
3. 交互及窄屏补充验收：发现两个 P2 状态问题并修复。
   - 关闭时立即清空配置导致退出动画短暂显示“设置不可用”。关闭保留当前画面，新打开时重新加载草稿；取消后返回入口，再次打开显示保存值。
   - 从窄屏底部预览切换标签时保留旧滚动位置，新标签第一组字段不在视口。按标签重建滚动容器，验证切换后 `scrollTop = 0`。
4. 最终轮：`tavern-settings-comparison-final.jpg` 和四张局部比较图，结果 passed。没有行动项级别的结构、字体、间距、图片或状态问题。

## 交互与补充状态

- 三个标签共用草稿；名称、场景和呈现改变会更新预览。
- 展开全部 8 个场景可选择“占卜”；收起后紧凑列表保留当前场景。
- 标签支持 Left/Right/Home/End 键，焦点和选中状态随之更新。
- 实际读取独立持久化文件，确认未点保存时文件不变；三个标签的修改一次保存，成功后保存按钮禁用。
- 取消后重新打开，加载已保存值，未保存草稿被丢弃。
- 注入写入失败，输入值保留且保存仍可重试；下一次写入成功，错误清除并出现成功提示。
- 导演人数输入 9 会限制为 6，回环轮次输入 0 会限制为 1。
- 390 × 844 截图：`implementation-mobile-top.jpg`、`implementation-mobile-preview.jpg`。上下滚动可到达预览，持久操作栏始终在窗口内。
- 深色主题：`implementation-dark.jpg`；叙事页：`implementation-narrative-final.jpg`；错误状态：`implementation-save-error.jpg`。
- 已检查浏览器控制台。失败注入产生预期的保存错误；临时捕获宿主更新时曾出现 createRoot 热更新警告。最终普通页面重新加载后没有新的 error/warn。
- 字段使用原生 label/select/radio，Dialog 提供标题与描述、焦点约束、Escape 关闭。保存中控件禁用，并阻止重复提交或中途关闭；spinner 遵循 reduced-motion。

## 验证与剩余差异

- `pnpm --filter @isle/story check`：通过类型和运行边界检查。
- `pnpm --filter @isle/story build`：通过。
- `pnpm --filter @isle/story test`：37 项单元测试及 core、contract、commit-tool、tavern-agent-protocol、boundary、binding 校验通过。
- `git diff --check`：通过。
- 设计稿的保存按钮处于可操作状态，实现未修改时为禁用状态；这是统一草稿保存逻辑的预期表现。
- 预览根据沉浸开关增加动作句，头像和场景使用原有资源；无需把生成稿整体或局部切片当成界面。
- 完整桌面宿主未在当前环境运行；视觉和读写行为通过真实组件、设计系统及独立示例存储验证。

## 实施清单

- [x] 紧凑标题、顶部标签、表单分组与预览布局。
- [x] 去掉二级编辑弹窗，直接调整全部原有设置。
- [x] 统一草稿、显式保存、取消与失败重试。
- [x] 修复全部 P2 视觉和窄屏状态问题。
- [x] 查看完整合成比较及可读局部比较。
- [x] 完成现有检查、测试和浏览器验证。

## 后续细节

- [P3 / 接受的素材差异] 若未来统一升级酒馆美术，可另行调整现有背景与头像，当前不新增或替换产品素材。
