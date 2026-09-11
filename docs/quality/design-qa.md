# 界面设计验收记录

> 以下为历史验收记录的中文译文，记录当时的测试结果，并非本次重新执行。截图路径是原始本机证据，其他机器上可能不可用。

# 设置总览设计验收

- 设计参考图： `/Users/haowen.zheng/.codex/generated_images/019fb3b8-dc87-78e1-92d8-689f94ea1408/exec-27679986-a134-441a-aab4-1d9b62a872bb.png`
- 用户最后修正： `/var/folders/9y/fm57w30x4575__8ltjq_62q80000gn/T/codex-clipboard-9d75b21f-21b0-48e8-990e-a02faf63ed6c.png`，并要求移除仅针对 LLM 的高亮样式
- 实现截图： `/tmp/isle-claw-settings-uniform-1248x783.png`
- 全景对比： `/tmp/isle-claw-settings-uniform-comparison.png`
- 局部对比： `/tmp/isle-claw-settings-focus-comparison-v3.png`
- 浏览器路由： `http://127.0.0.1:4173/#/settings`
- 状态：浅色主题、设置总览、无弹窗。
- 浏览器视口： `1248 × 783` CSS 像素，设备缩放比为 1
- 参考图像素： `1583 × 993`
- 实现像素： `1248 × 783`
- 密度归一化：将实现截图缩放到 `1584 × 994`，参考图补齐 1 像素至 `1584 × 994` 后等尺寸对比。

## 检查结果

- 没有遗留需要处理的 P0、P1、P2 差异。
- 排版：使用现有 Inter Variable 与中文系统字体回退，保持标题、行名称、描述、分类、字重、行高、换行和字距的层级。
- 间距与布局：移除独立“设置”标题，“应用设置”与关闭操作共用标题区。三个 96 px 导航行对齐、使用轻量分隔，默认样式一致，不再仅为 LLM 设置下划线或背景。
- 颜色与令牌：使用现有 `background`、`border`、`primary`、`foreground`、`muted-foreground`。克制的紫色指示与冷灰连续背景符合选定方向。
- 图像与图标：页面无位图，设置、角色、工作流、关闭和箭头使用项目现有 Lucide 图标，没有新增占位或手绘素材。
- 文案：标题、辅助说明、三个目标页面名称、描述、分类和关闭标签均符合确认稿。
- 预期差异：参考图包含 macOS 窗口按钮及填充的侧栏模拟数据，浏览器截图则使用当前空工作区；这是壳层与运行状态差异，不属于本次设置内容修改。

## 对比记录

1. 首次直接使用 `1584 × 994` CSS 视口对比，未归一化图像密度，导航行显得过于紧凑。
2. 曾临时增加行高，在归一化视口和截图密度后撤回；最终 96 px 行高更符合参考图的分隔与内容节奏。
3. 归一化后的全景与局部对比无 P0/P1/P2 问题，剩余壳层和数据差异为预期运行状态差异。
4. 按用户最后修正移除 LLM 专属紫色下划线；DOM 检查确认三个导航行均无强调指示，默认背景透明。

## 已验证主要交互

- LLM 设置打开 `#/settings/llm`。
- 角色设置打开对应弹窗，关闭后返回 `#/settings`。
- 协作流程设置打开对应弹窗，关闭后返回 `#/settings`。
- 关闭设置导航到 `#/chat`。
- 760 px 与 639 px 窄屏检查无横向溢出；640 px 以下收起分类标签，侧栏沿用现有响应式行为。
- 交互与响应式检查后的浏览器控制台无警告或错误。

## 后续微调

- P3：原生 Tauri 的窗口装饰和平台字体栅格化可能与浏览器略有差别；除非原生截图出现可见回归，否则无需改动。

## 实施检查表

- [x] 移除重复的设置页标题。
- [x] 仅保留“应用设置”标题区与关闭操作。
- [x] 将卡片改为三个通栏导航行。
- [x] 去掉编号，三个导航行使用相同默认样式。
- [x] 保留三个路由与弹窗行为。
- [x] 验证响应式布局、控制台、TypeScript、格式和生产构建。

最终结果：通过

---

# 知识库改版设计验收

## 验收证据

- 设计参考图： `/Users/haowen.zheng/.codex/generated_images/019fc7af-b051-7ba3-83bc-2fc50029eb5a/exec-d90953d9-1222-408e-8fa9-47e1fd6c0798.png`
- 浏览器中的知识库列表： `/Users/haowen.zheng/.codex/visualizations/2026/08/03/019fc7af-b051-7ba3-83bc-2fc50029eb5a/knowledge-redesign-qa/implementation-list-final.png`
- 全景对比： `/Users/haowen.zheng/.codex/visualizations/2026/08/03/019fc7af-b051-7ba3-83bc-2fc50029eb5a/knowledge-redesign-qa/list-comparison-final.png`
- 二级管理页面： `/Users/haowen.zheng/.codex/visualizations/2026/08/03/019fc7af-b051-7ba3-83bc-2fc50029eb5a/knowledge-redesign-qa/implementation-detail-final.png`
- 响应式截图： `/Users/haowen.zheng/.codex/visualizations/2026/08/03/019fc7af-b051-7ba3-83bc-2fc50029eb5a/knowledge-redesign-qa/implementation-list-1024.png`
- 反馈后的中等宽度列表： `/Users/haowen.zheng/.codex/visualizations/2026/08/03/019fc7af-b051-7ba3-83bc-2fc50029eb5a/knowledge-redesign-qa/polish-after-list-1400.png`
- 反馈后的总览： `/Users/haowen.zheng/.codex/visualizations/2026/08/03/019fc7af-b051-7ba3-83bc-2fc50029eb5a/knowledge-redesign-qa/polish-after-overview-1440.png`
- 反馈后的设置布局： `/Users/haowen.zheng/.codex/visualizations/2026/08/03/019fc7af-b051-7ba3-83bc-2fc50029eb5a/knowledge-redesign-qa/polish-after-settings-1440.png`
- 扁平列表参考： `/Users/haowen.zheng/.codex/visualizations/2026/08/03/019fc7af-b051-7ba3-83bc-2fc50029eb5a/knowledge-redesign-qa/embedding-list-reference.png`
- 最终扁平知识库列表： `/Users/haowen.zheng/.codex/visualizations/2026/08/03/019fc7af-b051-7ba3-83bc-2fc50029eb5a/knowledge-redesign-qa/flat-list-1440.png`
- 最终扁平总览： `/Users/haowen.zheng/.codex/visualizations/2026/08/03/019fc7af-b051-7ba3-83bc-2fc50029eb5a/knowledge-redesign-qa/flat-overview-1440.png`
- 最终扁平文件页面： `/Users/haowen.zheng/.codex/visualizations/2026/08/03/019fc7af-b051-7ba3-83bc-2fc50029eb5a/knowledge-redesign-qa/flat-files-1440.png`
- 最终扁平设置页面： `/Users/haowen.zheng/.codex/visualizations/2026/08/03/019fc7af-b051-7ba3-83bc-2fc50029eb5a/knowledge-redesign-qa/flat-settings-1440.png`
- 浏览器路由： `http://127.0.0.1:1420/#/knowledge`
- 状态：浅色主题、六个真实感知识库数据、无弹窗。
- 浏览器视口： `1440 × 1024` CSS 像素，设备缩放比为 1。
- 参考图像素： `1488 × 1058`, 归一化到 `1440 × 1024` 进行对比。
- 实现像素： `1440 × 1024`; 实现截图无需进行密度归一化。
- 响应式视口： `1024 × 768` CSS 像素，设备缩放比为 1。

## 检查结果

- 没有遗留需要处理的 P0、P1、P2 差异。
- 排版：使用现有 Inter Variable 与中文系统字体回退，保持页面标题、辅助文案、表头、知识库元数据、模型名称和语义状态的层级。
- 间距与布局：保留克制的页头、搜索与创建操作、连续表格、紧凑行、轻量分隔和留白。二级页面复用同一壳层，分为总览、文件、设置，不增加另一套导航。
- 颜色与令牌：使用现有 background、card、border、primary、foreground、muted。靛蓝为唯一品牌强调色，绿色、琥珀色、红色分别用于索引就绪、等待、无效状态。
- 表面层级：最终与 LLM/Embedding 设置列表对齐，知识库使用连续 `surface` 画布、扁平页头、分隔线、行悬停和语义状态填色，移除大白卡片、圆角面板边框和面板阴影。
- 素材与图标：数据库、目录、文件、状态、导航和操作均使用现有 Lucide 图标，没有新增占位、手绘 SVG、emoji 或近似素材。
- 文案：列表展示目录、选定向量模型、文档数、索引状态和更新时间；详情明确说明索引只针对当前知识库目录和模型。
- 局部证据：1440 px 全景对比中，页头与六行表格在原比例下均清楚可读，无需另裁局部即可评估文字、状态标签、分隔线和列间距。
- 预期差异：参考图使用简短 `/data/knowledge/...` 路径和固定时间，实现使用真实桌面路径与相对更新时间，用于验证截断和动态状态，不改变确认的布局。

## 对比记录

1. V1 符合目录式界面方向及核心视觉系统，但只有五个知识库，与参考数据不符；补充第六个知识库，使状态覆盖与表格密度一致。
2. 交互检查发现浏览器预览修改向量模型后虽保存配置，却未显示索引过期；修复并重测后，保存将“索引就绪”改为“等待更新”，重建后恢复。
3. 响应式检查发现小窗口列布局需收紧；最终根据表格容器实际宽度调整，优先让目录、其次模型列退让，保留索引状态、最近更新与行箭头。
4. V2 在归一化的 `1440 × 1024` 下确认壳层、六行密度、页头操作、表格层级、靛蓝强调与语义状态均无待处理差异。
5. 反馈后测量 1280 px 布局，`clientWidth === scrollWidth`，行箭头后有 25 px 留白；1180、1100、1024 px 均无溢出。
6. 设置页由紧凑堆叠卡片扩展为 240 px 标签列与弹性控件。
7. 最终与有数据的 Embedding 设置列表对比，将列表容器、总览卡片、文件卡片、设置面板和配置侧卡统一融入页面画布，以相同边框和悬停语言分隔。

## 已验证主要交互

- 创建流程先选择目录，以目录名填充名称，保存模型绑定后直接进入新知识库管理页。
- 点击知识库行打开包含总览、文件和设置的二级页面。
- 文件页列出支持的文件，并提供重新扫描操作。
- 修改向量模型只将当前知识库标记为“等待更新”。
- 确认重建后运行当前知识库索引流程，并恢复“索引就绪”。
- 模型失效时保留知识库，提示选择替代模型，不静默删除绑定。
- `1024 × 768` 下未发现横向溢出或主要操作不可达。
- 在 1400、1280、1180、1100、1024 px 检查表格，最近更新时间与行箭头始终完整可见。
- 交互与响应式检查后的浏览器控制台无警告或错误。

## 实施检查表

- [x] 将单页知识工作区改为知识库列表和二级管理路由。
- [x] 创建知识库时先选择目录。
- [x] 按知识库持久保存目录与向量模型配置绑定。
- [x] 按知识库追踪索引状态和重建，取消全局状态。
- [x] 保留已删除配置的 ID，仅无法解析的绑定显示“模型失效”。
- [x] 提供总览、递归文件列表、设置、删除与重建。
- [x] 符合确认的目录视觉与响应式行为。
- [x] 中等宽度保留表格布局，保护最近更新与箭头列。
- [x] 展开设置布局，使知识库表面层级与应用一致。
- [x] 所有知识库页签使用 LLM/Embedding 扁平列表的背景、分隔和悬停样式。
- [x] 通过 TypeScript、生产构建、Rust 格式、Rust 检查、47 项 Rust 单元测试，以及浏览器交互、控制台和视觉对比。

## 后续微调

- P3：浏览器预览无法完全表示原生 Tauri 字体栅格化及系统目录选择器；非预览环境使用真实 Tauri 选择器。

最终结果：通过

---

# 故事库卡片设计验收

## 验收证据

- 设计参考图： `/Users/haowen.zheng/.codex/generated_images/019fc141-08d5-7833-a15c-e8b3474fe838/exec-da726870-a91c-4415-9e59-0da9d3f02a4f.png`
- 浏览器实现截图： `/Users/haowen.zheng/.codex/visualizations/2026/08/02/019fc141-08d5-7833-a15c-e8b3474fe838/story-card-implementation.png`
- 全景对比： `/Users/haowen.zheng/.codex/visualizations/2026/08/02/019fc141-08d5-7833-a15c-e8b3474fe838/story-card-comparison.png`
- 卡片局部对比： `/Users/haowen.zheng/.codex/visualizations/2026/08/02/019fc141-08d5-7833-a15c-e8b3474fe838/story-card-focused-comparison.png`
- 响应式截图： `/Users/haowen.zheng/.codex/visualizations/2026/08/02/019fc141-08d5-7833-a15c-e8b3474fe838/story-card-implementation-1266.png`
- 浏览器路由： `http://localhost:1420/story-card-qa.html`
- 状态：浅色主题、有数据的故事网格、无菜单或弹窗。
- 参考视口： `1536 × 1024` CSS 像素，设备缩放比为 1。
- 参考图像素： `1538 × 1023`; 归一化到 `1536 × 1024` 进行对比。
- 实现像素： `1536 × 1024`; 实现截图无需进行密度归一化。
- 响应式视口： `1266 × 801` CSS 像素，设备缩放比为 1。

## 检查结果

- 没有遗留需要处理的 P0、P1、P2 差异。
- 字体与排版：使用现有 Inter Variable 与中文系统回退，保留“JSON 故事”、标题、简介、当前目标、统计和操作层级。超长测试标题在 247 px 容器内滚动宽 638 px，使用 `overflow: hidden`、`white-space: nowrap`、`text-overflow: ellipsis`；超长目标在 179 px 容器内宽 492 px，使用同样省略规则；简介限定为 40 px 两行，而测试正文滚动高度为 80 px。
- 间距与布局：彻底移除封面与头像区域；靛蓝细顶线、类型行、标题／简介、强调目标块、分隔统计和轻量底部操作按确认顺序排列。两个操作区域等宽，图标与文字组中心偏移均为 0 px。
- 颜色与令牌：卡片使用现有 `background`、`card`、`accent`、`primary`、`border`、`foreground`、`muted-foreground`，没有新增页面私有颜色、装饰渐变或替代图像。
- 图像与素材：新卡片不含位图、封面、背景图、头像、假缩略图或占位图；文件、目标、统计、操作、更多和删除均使用现有 Lucide 图标。
- 文案：保留故事标题、描述、目标、资源计数、“编辑”“酒馆”；“删除故事”仍位于更多菜单，并打开原有确认框。
- 预期差异：宽屏参考图有三列，实现遵守用户要求的最小 `16rem`，因此 1536 px 下为四列、每列 281 px；原应用 1266 px 下为三列、每列 294.492 px，容器与滚动宽度均为 923 px，无横向溢出。

## 对比记录

1. 在相同 `1536 × 1024` 视口截取实现，并归一化参考图两像素的尺寸差异。
2. 对比全屏及等宽首卡局部图，文字优先层级、靛蓝顶线、目标表面、统计、居中操作和更多入口符合确认方向；四列密度来自用户要求的 `16rem` 最小宽度，因此不作视觉修正。
3. 在原 `1266 × 801` 应用视口验证三列布局，无溢出，无新增 P0/P1/P2 问题。

## 已验证主要交互

- “编辑”使用正确故事调用卡片编辑回调。
- “酒馆”使用正确故事调用酒馆回调。
- 带唯一标签的更多按钮打开卡片菜单。
- “删除故事”打开现有删除确认框，“取消”关闭并返回卡片网格。
- 交互与响应式检查后的浏览器控制台无警告或错误。

## 实施检查表

- [x] 从已就绪卡片移除封面、背景图、头像和隐藏头像数量。
- [x] 将卡片重构为紧凑、文字优先的项目摘要。
- [x] 标题与目标单行省略，简介限制为两行。
- [x] 资源计数以有分隔的行内布局展示并支持安全截断。
- [x] 在等宽操作区域居中显示“编辑”与“酒馆”。
- [x] 删除入口移到右上更多菜单，保留确认行为。
- [x] 保留用户要求的 `16rem` 最小网格宽度。
- [x] 通过 TypeScript、格式、生产构建、浏览器交互、控制台与响应式检查。

## 后续微调

- P3：原生 Tauri 字体栅格化可能与内置浏览器略有差异；除非原生截图暴露明显对齐回归，否则无需修改。

最终结果：通过

---

# 启动页设计验收

## 验收证据

- 设计参考图： `/Users/haowen.zheng/.codex/generated_images/019fbe82-1ae1-7d92-b3b8-b96a34b6cc63/exec-2210ce97-de9f-45c0-ae23-f936adccdf47.png`
- 浏览器实现截图： `/Users/haowen.zheng/Development/projects/isle-claw/.codex/product-design/startup-implementation/02-startup-loading-light.png`
- 全景对比： `/Users/haowen.zheng/Development/projects/isle-claw/.codex/product-design/startup-implementation/04-full-comparison.png`
- 标志文字局部对比： `/Users/haowen.zheng/Development/projects/isle-claw/.codex/product-design/startup-implementation/05-brand-comparison.png`
- 深色主题截图： `/Users/haowen.zheng/Development/projects/isle-claw/.codex/product-design/startup-implementation/03-startup-loading-dark.png`
- 窄窗口截图： `/Users/haowen.zheng/Development/projects/isle-claw/.codex/product-design/startup-implementation/06-startup-loading-narrow.png`
- 桌面视口： 1536 × 1024 CSS 像素，设备缩放比为 1。
- 窄窗口视口： 390 × 844 CSS 像素，设备缩放比为 1。
- 参考图与桌面实现均为 1536 × 1024 px，无需密度归一化。
- 状态：浅色主题、启动加载中；另检查加载完成、深色和窄窗口布局。

## 检查结果

- 没有遗留需要处理的 P0、P1、P2 差异。
- 字体与排版：保留现有 Inter／系统回退、粗体标志文字、中文辅助层级、字距与视觉平衡。生成概念图扩大了整体标志组合，但确认范围仅限猫形处理，因此保留生产启动页现有响应式文字比例。
- 间距与布局：文字标志、标语和状态保持现有垂直节奏与居中位置。猫头位于原小写 `i` 的点中心，桌面参考视口下为 18.36 × 18.36 CSS px；390 px 宽度下无重叠或溢出。
- 颜色与令牌：浅色和深色继续使用启动页现有语义颜色，靛蓝轮廓在两种主题中将猫形素材与文字标志联系起来。
- 图像与素材：Mewvis 猫头为专用 256 × 256 RGBA PNG，不是截图裁切、CSS 绘制、内联 SVG、占位图或 emoji。保留橙白脸、圆琥珀眼、粉色鼻子和靛蓝轮廓，透明边缘干净，无绿色杂边或不透明背景。
- 文案：“Mewvis”“你的 AI 故事创作伙伴”“正在准备创作空间”“准备好了”均正确。
- 状态与无障碍：加载时提供 `aria-busy="true"` 和温和状态通知；完成后改为 `aria-busy="false"`，文案变为“准备好了”，停止状态点动画。保留减少动效支持；装饰猫图 alt 为空，标题仍有可访问名称 Mewvis。
- 浏览器控制台：浅色、深色和完成状态检查均无错误或警告。
- 窗口壳层：参考图中的交通灯按钮由 macOS 窗口提供，不在网页中重建。

## 对比记录

1. 首次浏览器截图继承了保存的深色主题，不能与浅色参考对比；增加仅用于启动预览的 `startup-theme` 覆盖，不改变正常主题选择。
2. 重新在 1536 × 1024 截取浅色加载状态，对比全屏和文字标志局部；猫点处理、文案、对齐、配色与加载状态符合确认稿，有意保留生产标志较小比例。
3. 验证深色、完成状态及 390 × 844 窄屏，无新增 P0/P1/P2 问题。

## 实施检查表

- [x] 从静态和 React 启动页移除三只写实猫图。
- [x] 仅用 Mewvis 猫头替换小写 `i` 的点。
- [x] 预加载新素材用于首屏。
- [x] 保留浅色／深色、加载动画、完成状态及减少动效行为。
- [x] 通过 TypeScript、格式、生产构建、浏览器渲染、控制台与响应式检查。

## 后续微调

- P3：极窄窗口下猫头跟随原 `i` 点尺寸而变小，符合用户明确的尺寸要求。

最终结果：通过
