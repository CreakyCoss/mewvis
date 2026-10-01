# 应用工坊设计验收

final result: passed

## 2026-10-02 首页第 2 版「连续分栏」

本轮仅调整首页，按最近一组设计稿中显示的第 2 张实现。左侧保留应用列表，品牌和新建入口移到列表顶部；右侧由应用介绍及操作带、铺满剩余空间的应用预览组成。保留状态标签的固定右侧列、删除确认及操作按钮垂直居中。

final result: passed

### 比较目标与证据

- 源设计：`/Users/haowen.zheng/.codex/generated_images/01a0f769-9f15-7e10-a09f-fec0a9335702/exec-a4e2d945-e1eb-4e72-89de-e38a1f80b872.png`。原图为 1713 × 918 栅格像素，未提供 CSS 视口或设备密度元数据；按图像比例缩放并舍入到 1280 × 686，不声称像素精确复刻。
- 实现：`http://127.0.0.1:5185/`，1280 × 720 CSS px、1× 截图。扣除顶部 34 px 开发工具条后，工坊区域为 1280 × 686；浅色主题、四个示例项目、选中专注计时器、25:00 初始状态。
- 本轮截图目录：`/Users/haowen.zheng/Development/projects/isle/output/design/app-workshop-2026-10-02/design-language/implementation/`。
- 最终全景及重点比较将源图和实现同时放入 `07-final-comparison.png`（2576 × 722）和 `07-final-focused.png`（2576 × 256），已一起查看；`06-home-final.png` 为最终工坊截图，`05-home-pending.png` 为待生成项目状态。
- `03-narrow-after.png` 为 820 × 720 窄窗口，`04-home-mobile.png` 为 390 × 844 手机布局。源稿没有对应窄窗口设计，响应式布局按既有产品行为适配。

### 五项视觉检查

| 表面 | 结果 |
| --- | --- |
| 字体与排版 | 复用现有中文系统字体。列表名称 16 px、说明 14 px；详情标题 22 px。状态标签 13 px，76 × 24 px，四行均固定在同一列。源稿部分文字的光学重量略有差异，属于 P3。 |
| 间距与布局 | 左侧宽 320 px，源稿归一化后约 319 px；详情操作带实际高 97 px，预览直接衔接下方画布。桌面按钮中心与介绍区中心只差 0.5 px。820 px 下操作组独立成行，390／320 px 下无文档水平溢出，窄手机的删除操作可换行。 |
| 颜色与令牌 | 使用现有灰色背景、浅紫选中项、紫色主按钮和语义状态令牌；待生成标签补充灰色底，使其与侧栏有区分。删除使用弱化红色文字与图标。 |
| 图像与图标 | 沿用 Lucide 图标，未引入新的图片素材。计时器图标使用圆形底，其他列表图标保持简洁。计时环及应用内部文字属于示例应用，其尺寸与源稿示意存在 P3 差异，本轮未修改应用内容。 |
| 文案与内容 | 保留既有名称、说明、状态和更新时间，无新增概览、筛选或填充内容；没有「我的小应用」、可见预览标题或「仅查看」。待生成状态继续显示现有开发入口。 |

### 迭代与操作验证

| 问题 | 调整与证据 |
| --- | --- |
| P2：820 px 下操作按钮挤压应用标题，导致不合理换行 | 增加 1100 px 断点，将操作组放到介绍下方。`02-narrow-before.png` → `03-narrow-after.png`，标题和说明恢复可读。 |
| P2：待生成标签底色与灰色侧栏混合 | 加深中性状态标签底色，保留统一尺寸。最终 `06-home-final.png` 中四个状态均清晰可读、左右对齐。 |

浏览器中实际打开并取消新建和删除确认弹窗；「运行」打开计时器使用页，「继续开发」打开原有编辑页，均可返回首页。选择待生成项目时不显示运行按钮，继续开发、删除与开始开发入口可见。首页预览中的应用操作保持禁用。桌面控制台没有 error/warn，测量记录保存在 `verification.json`。

本轮没有运行类型检查或测试套件，也没有调用真实模型或修改原生应用工作区数据；未完成深色主题、零项目状态和完整可访问性审计。最终比较没有遗留可操作的 P0、P1 或 P2 问题，上述应用内容及图稿光学差异作为 P3 保留。

## 2026-10-01 首页留白调整纠正

用户明确首页问题是既有元素的设计过于松散。已移除上一轮新增的概览、数量统计、搜索、筛选与创建方向引导，恢复原来的应用列表、详情、界面预览及空状态内容。以下旧版探索截图仅作历史记录，当前首页以 `13-home-spacing-only.png` 和 `14-home-spacing-mobile.png` 为准。

仅通过布局与尺寸提高密度：桌面列表宽度为 320 px（原为 34%），行高实际为 89.5 px（原为 124 px），列表／详情图标为 40／52 px（原为 60／76 px）；详情内边距收紧为 20 px，操作按钮实际高度为 39 px（原为 46 px），详情头与预览间距同步压缩。保留既有标题和说明，未增加页面功能。

在 1280 × 720 桌面视口检查了列表选择与预览；390 × 844 窄窗口中 clientWidth 与 scrollWidth 均为 390，列表和详情正常堆叠。桌面控制台无 error/warn；窄窗口检查壳首次初始化仍记录了一条 MutationObserver 错误，工坊级临时 error 诊断未捕获它，应用与子视图均正常显示。暂不将窄窗口控制台无错误列为本轮通过项，临时诊断代码已移除。

## 2026-10-01 首页密度、弹窗与使用流程改进

本轮按用户提出的四个问题调整现有布局，不再将首页与最初图稿作等尺寸复刻比较。截图目录：`/Users/haowen.zheng/.codex/visualizations/2026/10/01/workshop-refinement/`。桌面视口为 1280 × 720，顶部 34 px 为开发预览工具条；窄窗口通过 390 × 844 应用 iframe 验证。

| 流程与问题 | 实现及验证 | 截图证据 |
| --- | --- | --- |
| 1. 新建小应用：弹窗位于左上角（P2） | 使用原生 dialog 的固定定位与自动外边距居中；桌面左／上为 380／136.95 px，尺寸 520 × 446.09，中心为 640 × 360。窄窗口左／上为 17／198.95 px，尺寸 356 × 446.09，中心为 195 × 422。名称输入自动聚焦，取消后返回首页。 | `02-create-before.png` → `08-create-after.png`；`11-create-mobile.png` |
| 2. 首页：列表、图标与留白过大（P2） | 列表改为 320 px，收紧行高、图标及详情头部间距；增加数量概览、名称／说明搜索和状态筛选。实际验证“开发中”只显示待生成项目、描述搜索匹配计时器、无结果显示恢复入口。空列表提供创建步骤与需求方向，选择“阅读记录”预填名称和说明，创建后进入真实项目编辑页。 | `01-home-before.png` → `05-home-after.png`；`09-empty-home.png`；`10-home-mobile.png` |
| 3. 首页界面预览：整体 inert 和 pointer-events 阻止滚动（P1） | 移除对整个 iframe 的禁用；在现有 opaque sandbox 内拦截应用操作，保留浏览器默认滚动，并禁止首页状态写入。实际 PageDown 将 scrollTop 从 0 改为 314，End 到达 1759.5（内容高度 2093、视口 334），可看到第 20 项与页尾。强制点击“标记已读”后仍为 0。 | `03-scroll-before.png` → `06-scroll-after.png` |
| 4. 使用：继续开发及模式切换混入使用流程（P1） | 独立使用页占满工坊内容区，只保留浮动返回按钮；修改应用先返回首页。桌面画布为 1280 × 686，窄窗口为 390 × 750（均扣除开发工具条）。使用页无工坊头部、模式切换或继续开发按钮；实际点击“标记已读”变为 1，返回后首页只读预览仍为 0。 | `04-use-before.png` → `07-use-after.png`；`12-use-mobile.png` |

视觉检查：桌面及窄窗口文本、状态、搜索、操作按钮和预览边界均可读，无水平溢出；390 px 下 document 的 clientWidth 与 scrollWidth 均为 390。颜色与图标继续使用现有主题令牌及图标库。深色主题、完整可访问性审计与真实模型调用不属于本轮已完成的验证范围。

窄窗口复查发现公共视图 SDK 在文档根元素尚未创建时启动 MutationObserver 会报错。改为观察文档本身后，重新打开的窄窗口控制台无 error/warn，预览操作拦截仍正常。补充 SDK 回归测试确认没有根元素时可以初始化，并在释放时断开观察器与移除事件监听；18 项 SDK 测试通过。

验证限制：CUA 的坐标滚轮／拖拽输入在首页和没有操作拦截的使用页均未改变滚动位置，因此不将这些输入列为已通过；本轮实际证据确认了键盘默认滚动、完整内容可达和预览只读。真实 Isle 宿主中的鼠标滚轮、拖动滚动条与触摸滚动仍需复验。

工程检查：应用类型与运行边界检查、14 项打包项目工具测试、18 项 SDK 测试、6 个内置应用统一打包、53 页文档检查及 git diff --check 均通过。本轮所有测试数据位于独立预览临时目录，未修改用户的原生应用工作区。

## 2026-10-01 源码目录改造补充验证

小应用工作源码已从项目 JSON 展开到 `source/`；编辑页显示 `source`、`src` 和嵌套目录，根目录配置可直接编辑。浏览器中实际修改了 `package.json`，创建了 `src/data/settings.json` 并成功构建，随后检查磁盘文件与界面内容一致、项目元数据不再包含工作源码。

补充截图为同一证据目录中的 `editor-source-directory.png`（1280 × 720 桌面视口）和 `editor-source-directory-mobile.png`（390 × 844 应用 iframe，周围是开发检查页面）。窄窗口检查发现文件导航被纵向布局压缩，已通过禁止文件栏收缩修复；导航高度恢复到 40 px，可水平滚动并选择 `package.json`，页面 clientWidth 与 scrollWidth 均为 390。新浏览器标签页控制台没有 error 或 warn。

14 项 Node 测试通过，覆盖真实宿主加载 authoring skill、源码读写、格式校验、历史恢复、聊天保留、外部修改冲突、事务中断恢复和源码路径边界。类型及运行边界检查通过。真实模型调用的验证缺口仍按下文保留。

## Findings

最终比较没有遗留可操作的 P0、P1 或 P2 问题。验收范围为用户选择的第 3 套首页与第 3 套编辑页、对应的核心操作及响应式布局。真实 Isle 模型生成、原生宿主安装启动和完整跨浏览器自动化仍有下述验证缺口；本报告不将本地模拟聊天视为真实模型验证。

## 比较目标与证据

源设计：

- 首页第 3 套：`/Users/haowen.zheng/.codex/generated_images/01a0f380-ccfe-7b20-87f7-02be06a793b8/exec-bf268ef3-aa06-4d3c-9a2e-487fbfb1a430.png`
- 编辑页第 3 套：`/Users/haowen.zheng/.codex/generated_images/01a0f380-ccfe-7b20-87f7-02be06a793b8/exec-22c7603c-3b9e-4a7a-ab08-b9fb3528bf9a.png`

实现地址：`http://127.0.0.1:5183/`。实际截图与组合比较位于：

`/Users/haowen.zheng/.codex/visualizations/2026/09/30/01a0f380-ccfe-7b20-87f7-02be06a793b8/qa-workshop/`

| 证据文件 | 用途 |
| --- | --- |
| `home-desktop.png` | 浏览器渲染的首页，选中专注计时器、已有保存版本、浅色主题 |
| `editor-desktop.png` | 浏览器渲染的编辑页，App.tsx、构建成功、模拟聊天已完成 |
| `editor-idle-desktop.png` | 重新加载后的编辑页初始聊天状态，用于最终展示 |
| `home-comparison.png` | 首页源设计与实现放在同一张图中进行全景比较 |
| `editor-comparison.png` | 编辑页源设计与实现放在同一张图中进行全景比较 |
| `home-focused-comparison.png` | 首页标题、列表、详情头部的放大比较 |
| `editor-focused-comparison.png` | 编辑页文件树、标签与代码排版的放大比较 |
| `home-mobile.png`、`editor-mobile.png` | 390 CSS px 窄窗口布局 |
| `editor-dark.png` | 工坊及子视图的深色主题 |
| `iteration-01-home.png`、`iteration-01-editor.png` | 较早的探索比较，仅用于追溯，不作为等尺寸精确比较依据 |
| `workshop-screens.png` | 最终首页与空闲编辑页展示图 |

### 视口与归一化

- 两张源设计均为 1487 × 1058 像素。没有 CSS 视口或设备密度元数据，按名义 1× 栅格解释，不声称像素精确复刻。
- 实现浏览器视口实际测得 1400 × 1000 CSS px，截图为 1400 × 1000 像素，密度为 1×。上方 34 px 是开发预览工具条，应用自有区域为 1400 × 966。
- 源图移除左侧 64 px 宿主导航栏后为 1423 × 1058。宿主导航不由应用工坊重复实现。
- 源应用区域按宽度等比缩放到 1400 × 1041，裁去底部 75 px 空白；实现裁去 34 px 开发工具条。组合比较中的两侧均为 1400 × 966，无非等比拉伸。
- 组合图为 2816 × 1008，包含 16 px 间隔和 42 px 说明条。重点比较图分别为 1416 × 312 和 1196 × 392。
- 390 × 844 CSS px 窄窗口通过开发用 iframe 页面验证；页面实际 scrollWidth 为 390，无水平溢出。此处为响应式网页验证，源设计没有对应窄窗口视觉稿。

首页两侧均为浅色、四个项目、选中计时器、25:00 初始时间。编辑页两侧均为 App.tsx、已保存与构建成功的状态；真实示例源码含异步状态保存，与设计示意代码不同。完成态聊天截图使用 SDK 内存模拟消息，源设计使用示意开发回复；只比较聊天区域布局与控件，消息内容不作逐字匹配。另存空闲聊天截图呈现实际初始状态。

## 五项视觉检查

| 表面 | 检查结果 |
| --- | --- |
| 字体与排版 | 使用已有设计系统的系统中文字体栈和等宽代码栈。标题、正文、标签、代码行高与层级已逐项查看；桌面无异常换行，窄窗口标题正常横排。图稿缺少字体元数据，部分图稿字重和光学字号略大，作为 P3 保留。 |
| 间距与布局 | 首页左列为 34%，右侧详情头与大预览保持第 3 套结构。编辑页为 216 px 文件区、弹性代码／预览区、420 px 助手区；1400 px 下的主要区域比例与源稿接近。自适应较短视口使上下分区高度改变；没有隐藏固定控件或区域重叠。 |
| 颜色与令牌 | 复用 Isle 公共主题令牌：浅背景、白色面板、紫色主操作、灰色边框和绿色成功状态。选中项使用淡紫背景。深色主题下子视图同步更新，文本与控件可读。源稿轻微紫色渐变以产品已有实色令牌表达。 |
| 图像与图标 | 源设计没有照片、插画或需要生成的栅格素材。工坊图标使用现成图标库，未嵌入整张设计图模拟页面。计时环属于可运行示例应用的状态 UI，其弧度和重置按钮表现与示意稿存在 P3 差异；它不是工坊的装饰图片。 |
| 文案与内容 | 首页、文件区、运行预览、助手标题与主要操作沿用第 3 套中文文案。版本历史、新建文件、构建失败、运行失败、空项目与冲突提示补全真实流程。共享 Chat 组件保留模型及权限控件；开发预览的技术诊断回复只来自模拟宿主，不作为正式产品助手文案。 |

## 比较与修复历史

首次检查与修复期间存在的问题均曾阻塞验收。较早视觉图未按相同内容区域归一化，因此最终验收重新生成等尺寸组合图和重点区域图。

| 严重度与问题 | 修复 | 修复后证据 |
| --- | --- | --- |
| P0：子视图 ID 含不允许的冒号，预览无法启动 | 使用合法的项目 ID 与 scope 连接形式 | 最终首页和编辑截图均显示运行中的子视图 |
| P0：WebKit 中 Blob sandbox 导航停留在 about:blank | 公共视图运行时改用 srcdoc，保留 opaque origin、sandbox、CSP 和协议校验 | 最终截图显示 about:srcdoc 内容；CUA 验证嵌套视图可运行且不能读父页面；浏览器回归脚本补充 srcdoc 断言 |
| P0：冻结 Chat session 对象的 Proxy 包装导致运行错误 | 用公开会话方法的普通包装对象，在 send 前保存源码和更新上下文 | CUA 发消息后完成流式模拟回复，最终编辑页仍可操作 |
| P1：重新读取无法正确丢弃脏缓冲区 | 显式确认后强制读取，同时更新本地源码引用 | CUA 比较重新读取后的 textarea 内容与原文件一致 |
| P2：首页区域比例、图标尺寸、按钮与头部间距偏离源稿 | 调整 34% 列宽、60/76 px 图标、按钮尺寸和详情内边距 | `home-comparison.png`、`home-focused-comparison.png` |
| P2：编辑页源码密度、主要列宽与预览比例不合适 | 固定文件与助手宽度、46/54 中部行比例、可读代码字号；格式化预览示例源码 | `editor-comparison.png`、`editor-focused-comparison.png` |
| P2：窄窗口列表收缩与详情重叠 | 列表不收缩，布局堆叠并允许内容滚动 | `home-mobile.png`，390 px scrollWidth 检查 |
| P2：窄窗口标题挤成竖排、返回按钮名称被隐藏 | 详情头使用图标／文字网格、操作独立成行；返回按钮增加 aria-label | `home-mobile.png`、`editor-mobile.png` 和 CUA AX 树 |
| P2：新建弹窗未把焦点放到输入，代码 Tab 阻碍离开 | showModal 后聚焦输入；保留 Tab 缩进并让 Shift+Tab 离开代码区 | CUA 首次创建与新建文件流程；代码编辑器可用键盘退出 |

## 操作与工程验证

通过浏览器操作实际验证：

- 创建项目，进入编辑页，新建源码文件，编辑、构建、保存版本并打开使用。
- 构建诊断显示文件／行／列；语法错误不替换已保存的使用版本。
- runtime error 显示错误并禁止保存，修复后重新构建可用。
- 修改示例标题并保存后使用新版本；历史恢复确认后源码和运行版本一致恢复。
- 计时器开始、暂停和重置可用；开发预览状态与使用状态互相隔离。
- 发送需求前保存源码并传入最新项目上下文；模拟聊天完成后恢复可编辑状态。
- 桌面、390 px 窄窗口、深色主题、弹窗焦点和可访问名称检查。
- 嵌套 opaque sandbox 中读取 parent.document 被拒绝。

工程检查：应用类型与边界检查通过；项目工具的 7 项 Node 测试通过；6 个内置应用统一打包通过；53 篇文档检查通过；4 项宿主主题测试通过；git diff --check 无错误。

浏览器控制台在最终修复与重新捕获期间没有新的 error/warn。较早日志中的会话包装异常已修复；主动注入的运行错误属于失败状态验证，未计入最终常态错误。

## Open Questions / 验证缺口

- 本地预览使用 SDK 内存模型，不会调用真实模型。正式 Isle 环境中的工具调用、权限批准、连续 AI 改写与原生宿主启动尚未完成端到端验证。
- 已更新现有浏览器回归脚本中的 srcdoc 断言，但本次没有运行完整 Playwright 跨浏览器套件。这里只报告 CUA 实际浏览器验证和已运行的工程检查。
- 源设计没有移动、空项目、构建诊断和历史弹窗稿；这些状态按现有组件和主题实现，已做功能及响应式检查。

## Implementation Checklist

- [x] 两套第 3 方案均已定位并进行全景及重点区域比较。
- [x] 修复已发现的 P0/P1/P2，重新捕获并检查。
- [x] 核心创建、编辑、构建、保存、使用与恢复流程可操作。
- [x] 复用公开 SDK、Chat、主题及隔离的嵌入视图。
- [x] 本地预览继续运行并保留给用户。
- [x] 明确区分模拟模型与真实宿主验证范围。

## Follow-up Polish

- P3：图稿部分字体更粗、更大，可根据实际 Isle 宿主视口进一步调节光学重量。
- P3：示例计时器的圆环角度、重置按钮图标和文字与示意稿不完全相同；核心工坊区域已按选定布局实现。
- P3：真实 SDK 聊天控件比图稿多权限入口；保留产品现有组件的一致性。

final result: passed

---

# App Workshop homepage design QA

Final result: **passed**

## Scope and reference

- Implemented the selected compact-toolbar homepage direction, retaining the two-column layout. Runtime-page design is outside this change.
- Reference: `output/design/app-workshop-2026-10-01/selected-refinement/workshop-home-and-browser-runtime.png` (2167 × 725).
- Compared only its homepage crop, coordinates `(26, 55, 1075, 712)`, at 1049 × 657 without resampling.
- Implementation: `main/App.tsx`, `main/Home.tsx`, and homepage selectors in `main/styles.css`.
- Preview: <http://127.0.0.1:5185/>. Reading-list example selected in an isolated, seeded preview workspace.

## Visual comparison

Evidence under `output/design/app-workshop-2026-10-01/implementation/`:

- `home-comparison.png`: selected reference and final implementation side by side.
- `home-header-comparison.png`: focused comparison of the toolbar, first sidebar row, and selected-app introduction.
- `home-reference-size.jpg`: implementation at the same 1049 × 657 homepage dimensions as the reference. Browser viewport was 1049 × 691; the 34 px development toolbar was excluded. Density 1, no scaling.
- `home-desktop.jpg`: final 1280 × 686 homepage, excluding the development toolbar.
- `home-mobile.jpg`: final 390 × 844 browser view.
- `verification.json`: viewport bounds, mobile measurements, and console errors.

The reference and implementation were inspected together. The retained structure, restrained purple accent, compact list, inline metadata, and larger preview area match the approved direction.

| Surface | Result |
| --- | --- |
| Typography | Existing system font retained; 20 px selected-app title, 14 px list names and action labels, secondary text visually subdued. |
| Layout and spacing | Sidebar 300 px; list rows at least 64 px; introduction uses a centered grid; preview follows after 16 px. No excessive headings or bottom note. |
| Colors and surfaces | Existing theme tokens retained for borders, background, selected row, and primary action. Preview has a subtle border and 6 px radius. |
| Assets | Existing Lucide icons retained; list icons 32 px and selected-app icon 36 px. No new raster assets. |
| Copy | Removed the visible library heading and preview labels. Primary action reads “运行” as requested; preview retains an accessible region label. |

Intentional differences from the generated reference: spacing follows the compact implementation dimensions above, the primary-action label is “运行”, and the embedded example retains its own content styling. The workshop does not restyle application contents to match generated mock content.

## Layout and interaction verification

- At 1280 × 720, introduction center Y = 134 px and both action-button centers Y = 134 px: **0 px deviation**.
- At 820 × 720, wrapping introduction center Y = 138.5 px and action center Y = 138.5 px: **0 px deviation**. Actions remain inside the viewport.
- At 390 × 844, actions move beneath the introduction and share center Y = 353 px; all horizontal list cards measure 260 px. No document-level horizontal overflow.
- Verified selection of a saved application and a pending application, project menu opening/closing, create dialog opening/canceling, “继续开发” opening the editor, and “运行” opening the saved application with return to homepage.
- Homepage preview remains passive. Existing preview action is reported disabled in the accessibility tree.
- Fresh preview console contains no errors or warnings.
- `pnpm --filter @isle/app-workshop check` passed; `git diff --check` passed.

## Iteration and limits

The first mobile check exposed automatic minimum sizing that widened horizontal list cards. Added `min-width: 0` to rows, then rechecked all card widths and page overflow.

The pre-existing preview on port 5183 had stale host output and an editor error. Verification used a newly started isolated preview on port 5185; no unrelated editor or backend changes were needed.

No open P0/P1/P2 findings for this homepage change. Screen-reader walkthroughs and browser zoom were not tested; no comprehensive accessibility certification is implied.
