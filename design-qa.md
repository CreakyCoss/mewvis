# Learning workspace design QA

## Visual truth and implementation

- Source: the four approved mockups in `/Users/haowen.zheng/.codex/generated_images/01a0e752-de6c-7d82-af3c-08708fd86a63/`: `exec-e501a33b-1c6b-4123-af59-1975b415aa9b.png` (settings), `exec-dbdb064c-027d-4018-93a4-8e9035be7ec6.png` (outline), `exec-876ca34a-c0ee-44d6-bb12-8fe1389f4aab.png` (lesson), and `exec-18dc8aaa-aaf6-4d1e-9aa2-6d7d702b2291.png` (project). The later user instruction removes the outline edit controls shown in its mockup.
- Implementation: `http://127.0.0.1:5178/`, captured from the in-app browser. Screenshots and combined comparison images are in `/Users/haowen.zheng/.codex/visualizations/2026/09/28/01a0e752-de6c-7d82-af3c-08708fd86a63/qa-learning/`.
- Viewport: 1440 × 1024 CSS pixels at density 1 for desktop. Source images are 1487 × 1058 pixels; each source was resized to 1440 × 1024 for comparison with the 1440 × 1024 implementation captures. Responsive checks used 390 × 844 CSS pixels at density 1.
- States: settings, inline outline editing, lesson quiz tab with a populated question, and project editing with stage 02 expanded. Example text and generated AI responses in the source are illustrative; the implementation captures use test content and the assistant's empty state.

## Comparison evidence

| Page | Full view | Focused region |
| --- | --- | --- |
| Settings | `qa-learning/isle-qa-settings.png` | Full view was sufficient for form widths, level choices and the visible reference field. |
| Outline | `qa-learning/isle-qa-outline.png` | `qa-learning/isle-qa-focus-outline.png` |
| Lesson | `qa-learning/isle-qa-lesson-final.png` | `qa-learning/isle-qa-focus-lesson-final.png`; the final compact quiz is also in `qa-learning/isle-lesson-quiz-final2.png`. |
| Project | `qa-learning/isle-qa-project-final.png` | `qa-learning/isle-qa-focus-project-final.png`; the final horizontal stage fields are in `qa-learning/isle-project-final-layout.png`. |

## Findings

No actionable P0, P1 or P2 visual issues remain in the reviewed states. The editor fills the viewport, keeps four steps and a persistent right assistant, edits the outline directly, and limits the local popup to lesson content. The outline has no exit, cancel or complete-edit action; the course footer owns persistence.

- Typography: the implementation uses the app's existing Chinese type stack. Heading, label and small text hierarchy is legible and close to the mockup; the mockup's heavier text rendering is a P3 difference.
- Layout and spacing: the 68/32 desktop split, step bar, left content rhythm and fixed footer match the approved composition. The project form intentionally scrolls when its detailed stages exceed the viewport.
- Color: the existing violet primary, pale selected states, neutral form surfaces and dimmed lesson overlay match the design direction.
- Images and icons: these screens have no raster imagery. Existing app icons are reused; no image placeholder is present.
- Copy: the implementation omits mockup editor-only controls and redundant helper text in line with the user's later requests. The AI panel shows an empty state until a model response exists.
- Accessibility and responsiveness: tabs expose selected state; lesson validation moves to the tab with the first missing field. At 390 × 844, the page uses one vertical workspace scroll, the popup remains usable, and the footer remains visible. Browser console error list was empty.

## Comparison history

1. P2: the lesson basics popup was excessively tall for two fields. Reduced its height to 500 px; the revised view is `qa-learning/isle-lesson-basic-final.png`.
2. P2: the project stage form used long vertical rows and too much spacing. Reduced section gaps and aligned stage labels beside their fields. Revised evidence: `qa-learning/isle-project-final-layout.png`.
3. P2: the quiz answer explanation sat below the visible popup area in a one-question example. Tightened the question form and option rows, removed redundant instruction text, and made the question number visible. Revised evidence: `qa-learning/isle-lesson-quiz-final2.png`.
4. P2: at 390 px, the settings content and assistant initially overlapped because both grid rows shrank to the viewport. Set content-sized rows and gave the lesson popup a full-height mobile workspace. Revised evidence: `qa-learning/isle-mobile-fixed.png` and `qa-learning/isle-mobile-lesson2.png`.

## Interaction checks and limits

- Verified in the browser: partial outline/project edits can be stashed and restored; closing without stashing discards local edits; adding a lesson opens the three-tab popup; required-field validation moves to the correct tab; the right assistant remains available while the lesson popup is open.
- `pnpm --filter @isle/learning test` passed 39 tests; `pnpm --filter @isle/learning check` passed; `git diff --check` passed.
- The local preview's chat connection was closed, so model generation and response adoption were not end-to-end tested in that preview. The error state appeared without crashing the editor.

## Course library: selected concept 2, historical comparison (2026-09-29)

- Source visual truth: `/Users/haowen.zheng/.codex/generated_images/01a0e752-de6c-7d82-af3c-08708fd86a63/exec-552413fc-52a3-4664-9769-0d9d423bd98f.png` (1586 × 992 px).
- Rendered implementation: `http://127.0.0.1:5178/`; browser screenshot `/Users/haowen.zheng/.codex/visualizations/2026/09/28/01a0e752-de6c-7d82-af3c-08708fd86a63/qa-learning/isle-library-desktop-final.png` (1571 × 1012 px) and mobile screenshot `isle-library-mobile-final.png` (375 × 812 px).
- Viewport and normalization: requested desktop viewport 1586 × 1026 CSS px at DPR 1. The browser capture excludes about 15 px of the outer frame and includes the 34 px preview toolbar. The toolbar was cropped and the app area was resized from 1571 × 978 to 1586 × 992 px for a same-size comparison. Normalized image: `isle-library-desktop-normalized.png`. Mobile check requested 390 × 844 CSS px at DPR 1; the in-app browser returned a 375 × 812 px capture after its own frame insets.
- State: light theme, six visible course cards in two columns, five complete courses and one stashed course. The course names and descriptions are test content, so the copy and learning progress differ from the illustrative mockup.
- Full-view comparison (source left, implementation right): `/Users/haowen.zheng/.codex/visualizations/2026/09/28/01a0e752-de6c-7d82-af3c-08708fd86a63/qa-learning/isle-library-compare-final.png`.
- Focused card comparison (source left, implementation right): `/Users/haowen.zheng/.codex/visualizations/2026/09/28/01a0e752-de6c-7d82-af3c-08708fd86a63/qa-learning/isle-library-focus-final.png`.
- Removal dialog state: `/Users/haowen.zheng/.codex/visualizations/2026/09/28/01a0e752-de6c-7d82-af3c-08708fd86a63/qa-learning/isle-library-remove-dialog.png` (the selected mockup does not specify this modal; it implements the user's additional request).

### Findings

No actionable P0, P1 or P2 differences remain. The two-column grid, card width and height, nav, 24 px row rhythm, title/description/tag hierarchy, action divider, button size and color match the selected direction. The reference has a filled book mark while the app retains its existing outline book icon; this is a P3 brand detail. The source's course titles and progress states are illustrative; the implementation renders actual saved data.

- Typography: Chinese system font, 27 px card title, 19 px description, 15 px tags and 16 px action labels are close to the reference. Text wrapping follows the real course description.
- Spacing/layout: after removing the preview toolbar, the first card begins at roughly the same top/left position as the 1586 px source, and three rows fit the comparison frame. On 390 px, cards become one column and controls remain visible.
- Colors: warm light canvas, indigo nav and learning action, violet accents, semantic status tags. A separate dark palette remains readable in the host's dark preview.
- Assets: the mockup has no course thumbnails or other raster content. Book, pencil, upload, plus, more and badge symbols use the installed icon library. The retained outline brand icon is the P3 difference noted above.
- Copy/content: the interface shows title, description, status/level/lesson tags and actions. It omits search, count, next-step copy and progress bars in line with the user's requested home layout.
- Accessibility: the removal flow uses an alert dialog with labelled title/description, Escape and backdrop cancellation, keyboard focus trapping and focus return to the source menu. Menu actions have accessible labels. The browser console reported no errors.

### Comparison history

1. Initial visual pass found a P2 mismatch: card titles, descriptions, tags and buttons were materially smaller than concept 2, leaving too much empty card space. Increased type scale and button/tag heights, reduced unused description minimum height, and matched the 266 px card and 24 px row spacing. Post-fix evidence is `isle-library-compare-final.png` and `isle-library-focus-final.png` above.
2. The first icon-library accent was too short and thick. Positioned and resized the library icon to match the source's short violet rule. The same post-fix comparisons show the final accent.

### Interaction checks

- Verified a ready course can open for study, a new course can be stashed without leaving the editor, and its home card opens continued editing.
- Verified both ready and stashed course menus open the same removal dialog. Cancel retains the course and returns focus to the menu. Confirm removes the course and returns to the empty state.
- Verified completing a one-lesson course changes its home state to `已学完` and its action to `回顾课程`.
- Checked desktop, 390 px mobile, light and dark previews, and the browser console. `pnpm --filter @isle/learning test` passed 40 tests; `pnpm --filter @isle/learning check`, TypeScript and `git diff --check` passed.

## Course library: editor-aligned visual revision, superseded (2026-09-29)

- Source visual truth: the implemented course settings page, captured at `/Users/haowen.zheng/.codex/visualizations/2026/09/28/01a0e752-de6c-7d82-af3c-08708fd86a63/qa-learning/isle-course-settings-final.png`. Its 20 px page heading, 14 px controls, muted gray text, white surfaces, fine borders and violet primary define the shared visual language. The user's latest instruction supersedes concept 2's large type and indigo palette.
- Implementation: `http://127.0.0.1:5178/`, screenshot `/Users/haowen.zheng/.codex/visualizations/2026/09/28/01a0e752-de6c-7d82-af3c-08708fd86a63/qa-learning/isle-library-editor-style-final.png`. The source and implementation images were reviewed together at their natural sizes. The source is the editor, so this is a token and hierarchy comparison rather than a pixel-aligned layout comparison.
- Viewport/state: browser default desktop viewport, three cards in a two-column grid with one complete imported test course and two temporarily stashed test courses. Responsive check used 390 × 844 CSS pixels; screenshot `qa-learning/isle-library-editor-style-mobile.png`. Both light and dark preview modes were checked.
- Typography and spacing: card title 18 px, detail and action text 13 px, tags 12 px. Card height is about 188 px in the tested desktop state, with 16 px grid spacing. Nav actions use the editor's 40 px control height. The three card states preserve the same title, tags and action alignment.
- Color: home now inherits editor tokens for the canvas, white card, border, text and violet primary. Status uses the subtle primary surface while neutral tags use the host's gray surface. Dark mode inherits the same semantic tokens and remained legible.
- Assets and copy: the home has no image placeholder, search field, course count or next-step description. It retains the approved two-column composition and the same menu and removal dialog behavior.
- Interaction/accessibility: the ready card exposed Edit Course and Start Learning, while stashed cards exposed Continue Editing. The 390 px viewport reduced to one column without clipped controls. No new browser console issue was observed during this visual revision.
- Checks: 40/40 tests passed; app check, TypeScript `--noEmit`, and `git diff --check` passed.

## Course library: restored layout with type and color adjustment (2026-09-29)

- Source visual truth: the pre-revision course library capture `qa-learning/isle-library-desktop-final.png` for structure and spacing, with `qa-learning/isle-course-settings-final.png` for the card typography and palette direction. Reviewed both against the new render `qa-learning/isle-library-restored-type-color.png`.
- Implementation: `http://127.0.0.1:5178/`, desktop capture `/Users/haowen.zheng/.codex/visualizations/2026/09/28/01a0e752-de6c-7d82-af3c-08708fd86a63/qa-learning/isle-library-restored-type-color.png`.
- Layout: restored the 88 px dark navigation, violet accent, 266 px card minimum height, 24 px grid gap, original card padding, tags and action placement, and the original mobile layout. No course actions or removal behavior changed.
- Typography: card title 22 px, description 16 px, tags 13 px, actions 14 px, reduced from the earlier 27/19/15/16 px scale while leaving component dimensions intact.
- Color: card text, border, surface and action now use the editor theme tokens. The nav retains its previous dark surface. Stashed and in-progress tags use the editor's subtle violet; neutral tags remain gray. Verified light and dark previews.
- Responsive and checks: 390 px viewport keeps one card per row and visible controls. Five ready test courses and one stashed course were checked in the browser. 40/40 tests, app check, TypeScript `--noEmit`, and `git diff --check` passed.

## Course library: external card scale (2026-09-29)

- Source: the approved two-column library capture `qa-learning/isle-library-desktop-final.png` for overall composition and the implemented editor's type tokens for the card scale.
- Current render: `/Users/haowen.zheng/.codex/visualizations/2026/09/28/01a0e752-de6c-7d82-af3c-08708fd86a63/qa-learning/isle-library-card-spacing-final.png`, captured in the local preview with five ready courses.
- Standard: card title 18 px/600, description 13 px, tags 12 px, actions 13 px. Desktop card minimum height 220 px and action height 40 px; mobile card minimum height 208 px and action height 38 px. Keep at least 14 px between the tag row and action divider.
- Preserved: 88 px dark navigation, two-column grid, 24 px grid gap, accent, corner radius, status/menu actions and delete confirmation.
- Visual check: desktop light and dark states and 390 px mobile were reviewed. The content remains readable, the two action buttons fit on one row, and mobile has one card per row.
- Checks: 40/40 tests, app check, TypeScript `--noEmit`, and `git diff --check` passed.

final result: passed

---

# 模型编辑弹窗设计核验

日期：2026-09-30。

## 对照与证据

- Source visual truth: `/Users/haowen.zheng/.codex/generated_images/01a0f0f9-6086-7d63-ab73-19a57d3d90a1/exec-5da6f0ef-78ca-4caf-a6df-6aa3aa94b397.png`。
- Implementation screenshot: `/Users/haowen.zheng/.codex/visualizations/2026/09/30/01a0f0f9-6086-7d63-ab73-19a57d3d90a1/model-modal-desktop.png`。
- Full-view comparison: `/Users/haowen.zheng/.codex/visualizations/2026/09/30/01a0f0f9-6086-7d63-ab73-19a57d3d90a1/model-modal-full-comparison.jpg`，左为设计，右为实现。
- Focused comparison: 同目录 `model-modal-focus-comparison.jpg`，左为设计，右为实现。
- Viewport: 1280 × 720 CSS px；实现截图 1280 × 720，像素密度为 1。设计图为 1672 × 941，全景等比例适配到相同视口；局部对照将设计弹窗等比例归一至 660 px 宽，未拉伸字体或控件。
- State: 浅色、编辑 DeepSeek V4 Flash、启用、1M 关闭、四个思考等级、默认 high、无编辑行展开。设计弹窗归一尺寸 660 × 494，实现 CSS 尺寸 660 × 485.5。
- Responsive evidence: 同目录 `model-modal-narrow.png`、`model-modal-narrow-add.png`（390 × 844）和 `model-modal-many-levels.png`（1280 × 560）。

## Findings

没有遗留的 P0/P1/P2 问题。

- 字体与层级：使用现有系统中文无衬线字体；标题 18 px、交互文字 14 px、辅助文字及等级值 12 px。可选字段标签持续可见，等级名称和等级值保持独立语义。长值截断并提供完整值提示。
- 间距与布局：模型 ID、名称为双列；两个开关为一行；不指定默认等级位于双列网格首项，添加等级为末项；恢复预设位于区块标题右侧。常用状态完整可见，新增编辑只占原入口所在网格单元。
- 颜色与控件：沿用共享语义令牌、输入框、按钮、开关、单选组件；选中态、焦点、重复值错误清楚可辨。未引入固定调色板或独立控件系统。
- 图像与图标：该弹窗没有需生成的位图素材；标准图标沿用项目的 Lucide 图标。未使用手绘 SVG、装饰图或占位图替代资产。
- 文案：初版保留真实字段与 Provider 草稿保存语义；本轮按用户反馈移除底部“保存 Provider 配置后生效”提示。
- 响应式：窄窗口改为单列，390 px 视口左右各保留 16 px；无水平溢出。等级较多时只滚动表单中段，标题和底部操作保持可见。

## Comparison History

1. 首次桌面对照发现标题区高于设计稿约 20 px，且新增入口继承按钮边框后呈现额外侧边框。压缩标题区、明确新增入口仅保留底部分隔线；更新截图再次对照后通过。初始证据：同目录 `model-modal-desktop-before-qa.png`。
2. 键盘检查发现预设菜单打开后焦点停留在外层浮层，方向键无法操作。显式聚焦预设列表；复测方向键与 Enter 可选中 medium，并且不会提前提交模型。改名 Enter/Escape 后也恢复对应名称按钮焦点。
3. 窄窗口对照发现弹窗贴边。明确计算弹窗宽度和最大高度；复测 390 × 844，弹窗宽 358 px、左右留白 16 px，展开新增编辑时完成按钮可见。
4. 后续桌面及局部对照无待修正的 P0/P1/P2；1280 × 560 多等级检查中，弹窗高 528 px、中段可滚动、完成按钮可见。

## Interactions And Checks

- 行内名称修改、Enter 确认、Escape 放弃、切换默认值时保存已输入名称。
- 重复等级禁止添加；自定义值去除首尾空格；空名称按等级值回退；预设选择及键盘确认。
- 取消新增保持模型弹窗打开并回到添加入口；移除默认等级切换为不指定；无等级时可添加第一项并移除。
- 恢复预设还原内置等级；模型名称、启用、1M、等级和默认值完成后进入 Provider 草稿。
- 保存 Provider 后刷新并重新打开，配置正确恢复；取消模型修改不影响 Provider 草稿；新增与删除模型入口正常。
- 窄窗口与多等级滚动、固定操作栏检查通过；浏览器 error/warn 日志为空。
- 前端 TypeScript、修改文件 Prettier 和 diff 空白检查通过。

## Follow-up Polish

初版核验记录如上，最新交互以本轮修订为准。

## 本轮修订（用户反馈）

- 移除底部说明，取消和完成按钮调整为同高、至少 80 px 宽；等级名缩窄，等级值留出更多宽度。
- 后续按用户要求改为单列，每行一个思考等级；当前等级名称和等级值等宽。
- 添加入口立即插入空等级，与已有等级使用相同的名称输入框及等级值选择/输入控件；空值和重复值均禁止完成。
- Provider 弹窗保留，模型弹窗及其预设浮层使用更高层级；完成后焦点回到对应模型入口。
- 按用户要求只做简单验证：TypeScript 和 diff 检查通过；浏览器确认空值拦截、预设填充、已有值重选、重复值拦截、自定义输入及双层弹窗返回正常。
- 双层弹窗初版截图：`/Users/haowen.zheng/.codex/visualizations/2026/09/30/01a0f0f9-6086-7d63-ab73-19a57d3d90a1/model-modal-revised.png`。

final result: passed

## 模型默认可用及上下文控件调整

- 完整移除模型启用状态，包括编辑控件、列表状态、类型/API 字段、数据库列和聊天/插件模型筛选；所有已添加模型均可用。
- 配置库升级为 v27，原先停用的模型也保留可用，模型名称、1M 上下文、思考等级及时间戳保留。
- 1M 上下文改为标签前方的复选框，后续简写为“1M”并移至模型 ID、显示名称这一行的最右侧；思考等级继续每行一项，名称和值各占一半宽度。
- 简单核验：前端类型检查、Server 构建通过；聊天相关 23 项和配置/迁移/插件相关 28 项测试全部通过。

## Provider 弹窗紧凑化

- 压缩标题区并移除说明；API Key 输入框占满字段宽度，移除凭据提示。
- 获取模型、新增模型及列表编辑按钮统一为 36 px 高；分别使用描边、浅色强调和无边框样式。
- 本轮只核对前端类型、格式及 diff；检查通过。

---

# 应用工坊：AI 应用创作编辑页设计验收

**Findings**

没有未解决的 P0 / P1 / P2 问题。确认稿中的左右分栏、无头像会话、单行创作标题、完整应用预览及次级代码入口已实现。以下差异保留为产品约束或 P3 调整项，而非像素完全一致的声明。

**Comparison target and evidence**

- Source visual truth: `output/design/app-workshop-editor-2026-10-01/selected-refinement/conversation-compact-header.png`。
- Implementation: <http://127.0.0.1:5197/>，打开「专注计时器」的「继续开发」。
- Implementation screenshot: `output/design/app-workshop-editor-2026-10-01/implementation/editor-desktop.jpg`。
- Full-view comparison: `output/design/app-workshop-editor-2026-10-01/implementation/desktop-comparison.png`，左为确认稿，右为实现。
- Focused comparison: `output/design/app-workshop-editor-2026-10-01/implementation/conversation-comparison.png`，并排比较创作 header、用户消息与助手消息。
- 参考图为 1672 × 941 像素；等比例归一到 1280 × 720，保存为 `implementation/reference-normalized.png`。浏览器视口为 1280 × 754 CSS px，上方 34 px 为开发预览控制条，比较截图裁去控制条，得到 1280 × 720 的应用内容。截图输出密度为 1 个图像像素 / CSS px。
- State: 浅色、版本 1 已保存、代码收起、预览正常、输入框为空；用户消息在右，助手回复在左。应用预览仍使用项目中真实可交互的计时器，而非静态设计图。
- 本地会话为内存模拟器：测试对话包含额外的偏好追问，助手实际返回「已收到预览回答：简洁一点」。确认稿中的生成结果文案和绿色更新提示属于动态内容，不在宿主界面中硬编码。两边均处于用户需求与助手完成回复的会话状态，但消息文本不相同。

**Required fidelity surfaces**

| Surface | Comparison and result |
| --- | --- |
| Fonts / typography | 延续工坊的系统无衬线字体与中文回退（macOS 使用 PingFang SC），不额外下载字体。创作标题 14 px / 600，说明 12 px，会话沿用共享组件的 14 px / 24 px 正文。单行标题与说明保持清晰层级；较长消息自然换行；应用名支持省略。生成图没有可验证的字体文件，比较以可见字重、层级与换行为准。 |
| Spacing / layout rhythm | 1280 px 下会话栏约 404.5 px（31.6%），预览栏约 875.5 px；创作 header 高 54 px，整体页头 56 px。会话左右内距 20 px，用户气泡最大宽 82%，右对齐；助手没有头像占位和卡片底色。预览框 8 px 圆角，间距与确认稿主要区域对齐。输入框稍高，列为 P3。 |
| Colors / tokens | 使用现有 `background`、`surface-raised`、`muted`、`border`、`primary`、`success` 等主题令牌。浅色为白色会话、浅灰用户气泡、淡色预览背景和紫色操作按钮；深色随同一套令牌切换，正文和状态均可辨读。没有增加装饰渐变。 |
| Image quality / assets | 此编辑器壳层没有照片、插画、头像或其他需要生成的位图资产。图标沿用产品已使用的 Lucide 图标库与 1.75 描边。右侧是真实小应用运行视图，保留原有计时器的字号、圆环和按钮，未用图像或绘制的占位内容替代应用。参考计时器的展示差异是嵌入应用内容差异，不属于工坊壳层改造。 |
| Copy / content | 「AI 应用创作」「说出想法，让 AI 帮你做成应用」「应用预览」「可以试用」「查看代码」及输入提示与确认方向一致。新会话介绍、空态和诊断提示围绕生成、试用、调整；代码相关操作在展开区保留。版本状态继续准确表达「已保存到版本 / 未保存到版本」，不改成可能混淆保存语义的预览更新状态。 |

**Comparison history and corrections**

1. [P1, resolved] 旧的桌面媒体规则仍指定三栏布局，会覆盖新的左右分栏。删除这条过时规则，保留左侧 AI 会话和右侧预览两栏。修复后证据：`implementation/editor-desktop.jpg` 及 `implementation/desktop-comparison.png`，DOM 测量为 404.5 / 875.5 px，代码与文件树默认不可见。
2. [P2, resolved] 窄屏隐藏「查看代码」按钮文字后，图标按钮缺少可访问名称。为展开 / 收起按钮增加明确的 `aria-label`、`aria-pressed` 和受控区域关联。修复前截图：`implementation/editor-mobile-before-label-fix.jpg`；修复后截图：`implementation/editor-mobile.jpg` 与 `implementation/editor-mobile-chat.jpg`。浏览器可访问性树确认按钮名称为「查看代码」，390 px 宽度没有横向溢出。
3. [P2, resolved] 设置弹窗位于共享输入表单内部，关闭按钮和表单键盘快捷键可能误触发送。关闭 / 完成按钮使用 `type="button"`，弹窗隔离键盘事件。浏览器验证：保留非空草稿，在设置中按 Ctrl+Enter 并关闭后，派发数仍为 0，草稿原样保留。

**Responsive and interaction evidence**

- `implementation/code-expanded.jpg`：展开文件树与代码，预览继续保留；展开 / 收起均可用。
- `implementation/editor-mobile.jpg` 与 `implementation/editor-mobile-chat.jpg`：390 × 844 CSS px 的窄屏，上下排列预览与会话，滚动后可完整使用输入区，无横向溢出；窄屏不作为桌面确认稿的逐像素比较目标。
- `implementation/editor-dark.jpg`：1280 × 720 内容区域的深色模式；恢复浅色后交付。
- 已验证实际计时器开始 / 暂停 / 重置，刷新与扩大预览；修改源码后更新预览，保存当前版本；收起代码保留未保存修改，再展开仍可继续编辑。测试修改已恢复。
- 已验证建议仅填入草稿、Ctrl+Enter 发送、停止生成、共享追问与回答、过程显示选项、设置关闭及键盘隔离。模型和权限控制仍由共享会话提供。
- 浏览器 error 日志检查为空。未测试真实模型生成：此独立开发预览使用内存会话；实际模型需在 Isle 宿主中调用。没有将模拟回复当作真实生成成功的证据。
- `pnpm --filter @isle/app-workshop check`：通过。
- `pnpm --filter @isle/app-workshop test`：15 / 15 通过，包含实际打包、编辑 / 构建 / 保存 / 恢复版本及宿主边界检查。
- `git diff --check`：通过。

**Open Questions**

没有阻碍本次编辑页实现的问题。真实模型输出长度与生成质量由宿主会话和所选模型决定，后续可在实际应用中继续观察。

**Follow-up Polish**

- [P3] 输入框整体约 138 px，比归一化确认稿约 116 px 高。当前保留较舒适的多行输入空间；如需要更紧凑，可将 `.wk-chat-input` 的最小高度从 88 px 降到 66 px。
- [P3] 共享消息操作仍占用少量垂直空间，以保留复制等行为。后续若要进一步提高会话密度，可将消息操作改为悬浮出现，并重新检查键盘可达性。

**Implementation Checklist**

- [x] 左侧 AI 创作、右侧完整预览，代码入口默认折叠。
- [x] 用户消息右侧、助手消息左侧，去掉头像及头像占位。
- [x] 创作标题与说明压缩成单行 header。
- [x] 保留会话发送、停止、追问、设置及现有源码 / 版本能力。
- [x] 桌面、窄屏、深色、关键交互与设计对照完成。
- [x] 类型检查、现有测试和变更格式检查通过。

final result: passed

## 应用工坊输入区后续调整（2026-10-01）

- 按用户要求，对照故事应用 `workbench/assistant.tsx` 与 `workbench.css` 调整输入区；上方截图及视觉验收记录对应调整前版本。
- 输入框改为故事助手的 12 px 圆角、12 px 内距、柔和阴影及焦点描边；多行输入最小高度 76 px、最大高度 180 px、行高 1.75。
- 底部同步模型下拉、权限图标与共享圆形发送／停止按钮；思考等级与过程显示保留在创作设置中。
- 本轮 `pnpm --filter @isle/app-workshop check`、格式与 `git diff --check` 通过。按用户指示，未进行浏览器效果验收，由用户自行验证。
- 随后按用户要求移除「创作设置」按钮、弹窗及对应样式；输入框底部仅保留模型、权限与发送／停止按钮。类型与变更格式检查通过，效果仍由用户自行验证。
- 根据最新要求，将 AI 助手移至右侧、应用预览移至左侧，保持原有栏宽比例、输入框及会话样式；代码展开区随预览移至左侧，窄屏仍先预览后会话。同步调整分隔线、DOM 顺序及方向性说明文案。类型与变更格式检查通过，浏览器效果由用户自行验证。
- 预览标题栏移除「可以试用」标签及对应样式；展开使用 `Maximize2`，收起使用方向相反的 `Minimize2`，按钮名称与提示继续随状态切换。类型与变更格式检查通过，浏览器效果由用户自行验证。
- 针对滚动预览时标题下方边框轻微抖动的问题，新增持续挂载的 `.wk-runtime-surface`，由外层固定覆盖边框，内层运行页面隔离布局与绘制。灵感便签内页实际滚动至 `scrollTop = 153` 时，外框仍为 `x = 14, y = 463, width = 847.5234375, height = 237`，边框为 1 px，位置、尺寸和颜色均未变化；展开／收起预览正常。类型检查、浏览器错误日志与变更格式检查通过。未在原生宿主中复现细微闪动，实际观感由用户继续验证；最终预览截图为 `implementation/preview-border-fixed.jpg`。

## 应用工坊 header 调整（2026-10-02）

- 保留顶部返回入口与应用名，运行页和继续开发页共用 `ApplicationHeader`，高度统一为 56 px。
- 左侧预览 header 与右侧助手 header 共用 54 px 高度，位于代码与预览内容上方；保存状态、版本管理、保存版本、更新预览和查看代码集中于该区域。窄屏使用带名称和提示的图标操作。
- 更新预览继续保存源码并重新构建，移除代码区及空态的重复更新按钮；展开／收起预览按钮浮动在预览容器右上角，保留相反图标。固定外框及内部绘制隔离继续保留。
- `pnpm --filter @isle/app-workshop check` 与 `git diff --check` 通过。沿用用户自行验证视觉效果的安排，本轮未进行浏览器视觉验收；此前截图对应旧 header。

## 应用工坊并排工作区与紧凑操作（2026-10-02）

**Source and comparison evidence**

- 用户选择方案 2：代码与预览并排，保留左侧文件树，通过文件夹按钮折叠；随后要求版本、视图与更新操作统一并缩短文案。最终视觉参考为 `output/design/app-workshop-code-layout-2026-10-02/selected-refinement/split-view-compact-controls.png`，原始尺寸 1672 × 941 px，提示词保存在同目录的 `compact-controls-manifest.json`。
- 实现预览：`http://127.0.0.1:5197/`。桌面浏览器 viewport 为 1280 × 754 CSS px，devicePixelRatio = 1；顶部 34 px 为独立开发预览控制，工坊区域为 1280 × 720 CSS px。
- 实现原图：`output/design/app-workshop-code-layout-2026-10-02/implementation/split-view-desktop-final-raw.png`（1280 × 754 px）。裁掉开发控制后保存为 `implementation/split-view-desktop.png`（1280 × 720 px）；参考图等比归一至相同目标尺寸。
- 完整并列比较：`implementation/desktop-comparison.png`；针对本轮重点的 header 操作比较：`implementation/header-controls-comparison.png`。已实际打开两张组合图检查布局与可读性。
- 比较状态为浅色、专注计时器、同时显示、文件树展开、预览 25:00。参考中的代码和聊天是示意内容；实际使用隔离工作区的真实源码与全新会话空态。只对工坊壳层和操作区域作设计比较，保留内嵌应用自身的计时器样式、现有源码和真实会话内容。

**Findings and correction history**

- [P2, resolved] 窄屏同时显示时，内容网格最低 880 px，而外层工作区仅 440 px，助手从预览之前开始，产生重叠。第一次修正后，自动网格轨道又随源码行数增长，代码与预览各达到 1498 px，影响页面密度。此阶段结果为 blocked。
- 为窄屏明确工作区高度为 header + 880 px，代码与预览轨道为 480 / 400 px；仅代码、仅预览与放大预览分别设置独立高度。后续证据为 `implementation/split-view-mobile-final-raw.png`（390 × 878 px），实测代码 y = 204–684、预览 y = 684–1084、助手 y = 1084–1644，无重叠、无横向页面溢出。桌面修正后重新捕获并打开上述组合比较图，未发现新的 P0 / P1 / P2 问题。

**Required fidelity surfaces**

| Surface | Assessment |
| --- | --- |
| Fonts / typography | 延用产品系统字体与中文回退。标题 14 px、操作 12 px、代码 13 px / 22 px，层级与参考一致。版本显示 V1，保存显示两字，视图和更新无可见长文案；文件名可横向滚动，未扩大工具栏高度。 |
| Spacing / layout | 顶部 56 px、两侧 header 54 px；操作均为 32 px 高、6 px 圆角。桌面代码区约 560 × 610 px，编辑器约 416 × 566 px，可显示约 25 行；预览框约 289 × 586 px。保留已有 AI 栏宽 31.6%，代码比例默认 64% 且可调整，文件树 144 px；这些比例是保留产品现有会话宽度的实现约束。 |
| Colors / tokens | 沿用现有 border、surface-raised、muted、primary、primary-subtle 与 primary-border。中性操作使用相同边框与表面，保存为紫色主按钮，当前视图浅紫选中；没有新增独立色值或装饰渐变。 |
| Image quality / assets | 壳层无位图资产。标准操作沿用与产品及参考相符的 Lucide 图标；内嵌计时器由真实运行应用提供，保持其响应式布局，不以图片占位。截图按实际 CSS 区域归一，未将密度差异当作设计偏差。 |
| Copy / content | 保留应用名、保存状态、AI header 与现有会话文案；版本缩为 V1，保存缩为「保存」。三个视图和更新按钮均有完整 aria-label 与 title，选中状态由 aria-pressed 表达。示意稿中的助手回复不替换真实会话空态。 |

**Interaction and validation evidence**

- 已验证同时显示、仅代码与仅预览；切换后未保存编辑内容原样保留，临时验证内容已恢复。
- 已验证文件树折叠 / 展开，窄代码区域保留左侧浮动文件树。分隔条键盘调整 64 → 69 → 64，实际拖动到约 60% 后恢复；指针释放后 resizing 状态清除。
- 已验证放大预览隐藏代码与助手、收起后恢复同时显示；模式选择同步显示正确的选中状态。
- 已验证紧凑更新按钮实际完成构建、V1 按钮打开版本管理。计时器开始后切换到仅代码再返回，仍显示「暂停」，运行实例状态保留；随后重置至 25:00。
- 浏览器 error 日志为空。`pnpm --filter @isle/app-workshop check`、Prettier 检查与 `git diff --check` 通过。
- 本轮验证使用隔离开发工作区与内存会话；未重新测试真实模型生成、原生宿主滚动细微闪动或深色全部交互。最终观感仍可由用户在宿主中自行验证。

**Open Questions / Follow-up Polish**

没有阻碍本轮布局和操作改造的问题；未新增需要阻塞交付的视觉差异。

**Implementation Checklist**

- [x] 全高并排代码与预览，右侧保留 AI 助手。
- [x] 文件树保留且可折叠，三种图标视图切换。
- [x] 版本、保存、更新和视图统一紧凑操作样式。
- [x] 桌面设计对照、窄屏修正和关键交互检查完成。
- [x] 类型、运行边界和变更格式检查通过。

final result: passed
