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
