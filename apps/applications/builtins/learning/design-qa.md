# 学习应用富内容、通用公式与受控实验：设计验收

- 日期：2026-10-03
- 最终结果：**passed**
- 当前范围：在既有富内容、图解与独立实验台上，扩展通用公式编辑、受控表达式模型和对应课程编辑功能。遵循现有视觉规范与宿主边界。
- 实现入口：`main/FormulaEditor.tsx`、`main/ExperimentEditor.tsx`、`main/InteractiveExperiment.tsx`、`main/experiments.ts`、`main/expression.ts`、`main/rich-content.css`。
- 本地预览：<http://127.0.0.1:5178/>；课程库点击“互动实验示例”，可体验抛物线、电路、成本与收益、正弦曲线。

## 桌面下拉样式修复（2026-10-03）

新增的公式、图解与实验选择框此前直接使用系统默认外观，没有复用课程编辑器已有的箭头和边距。现在统一使用 `SelectField` 包装原生 `select`，保留原生菜单、标签关联与键盘选择行为。

- 普通选择框统一为 40 px 高，右侧预留 32 px 给自绘箭头；长选项省略显示，紧凑题型选择框保持 108 × 34 px。
- 同步修正曲线切换和实验参数控件的布局选择器，明确宽度与收缩规则；焦点、禁用、浅色与深色状态共用应用样式。
- 在 1280 px、1568 px 桌面布局和 390 px 窄屏检查，选择框与容器等宽，页面没有水平溢出；窄屏长预设名称未遮挡箭头。
- 实际操作验证变量控件切换、公式来源键盘选择（空格展开、方向键选择、回车确认）、电阻选项对电流与功率的联动，以及曲线结果切换。未保存测试编辑。
- 类型与运行边界检查、构建、64 / 64 项测试、相关文件 `git diff --check` 通过，浏览器控制台无警告或错误。此轮为样式与公共控件整理，没有新增单元测试或宿主改动。

证据：[修复前](../../../../prototypes/learning-rich-content/qa/select-desktop-before.png)、[桌面修复后](../../../../prototypes/learning-rich-content/qa/select-desktop-after.png)、[宽桌面](../../../../prototypes/learning-rich-content/qa/select-desktop-wide.png)、[窄屏](../../../../prototypes/learning-rich-content/qa/select-mobile-after.png)、[深色主题](../../../../prototypes/learning-rich-content/qa/select-dark-after.png)。

## 通用公式与实验更新（2026-10-03）

本次沿用既有设计方向与内容块的上下布局，扩展配置能力；没有新增宿主能力或权限。以下首版与布局调整章节保留为历史记录，当前范围以本节为准。

- 公式编辑：正文支持行内与独立公式；新增分式、根式、幂、求和、积分、矩阵快捷插入、符号说明、分步推导，以及与实验计算结果的绑定。
- 实验编辑：模型与公式、输入变量、展示方式、教学任务四个区域；提供五种预设，可配置滑块、数字输入、下拉选项、开关与多个计算结果。
- 学习体验：数值、SVG 曲线、采样表可组合；支持自由探索、数值 / 区间目标、曲线匹配，保存最近 8 次观察并恢复。不同单位的结果切换曲线查看。
- 桌面配置区在可用宽度足够时并列展示设置与学生预览，窄屏顺序排列。保留“保存课时 → 保存课程”的原有层级。

浏览器实际验证：

1. 二次函数自由探索：记录 `a=1, x=2 → y=4` 与 `a=3, x=2 → y=12`，切换页签后恢复参数和两条记录。
2. 欧姆定律：电阻由 200 Ω 改为 400 Ω 后，电流为 0.03 A、功率为 0.36 W；断开开关，两项结果均为 0。切换功率曲线，显示正确的单位与非线性变化。
3. 成本收益挑战：销量 50 时利润 −400，检查未通过；销量 100 时利润 200，目标通过。销量越界后显示错误，禁用记录及导师分析入口。
4. 课程编辑：修改计算式、删除不用的变量、修改横轴范围；关联公式即时更新。将任务改为匹配 `3*x^2`，不达标的参考解阻止保存；预览调到 `a=3` 后检查最大采样误差为 0，并可设为有效参考解。
5. 公式编辑：分式按钮替换当前选区；独立公式与关联公式可切换；新增符号说明及推导步骤，预览正确渲染。
6. 保存链路：修改电路公式的等价写法、结果名称与公式说明，依次保存课时和课程；返回学习页后，公式、说明、名称及计算结果正确恢复。修改内容后的旧观察记录不沿用。
7. 响应式：1568 px 桌面编辑、760 px 学习页与 390 px 学习 / 编辑布局检查；手机端实际操作选项与记录，根页面无水平溢出。默认窗口与深色主题复核通过。
8. 发现公式卡片继承正文行高后产生多余纵向滚动条；调整 MathML 行高与公式留白，复核滚动尺寸等于可用尺寸，且公式完整显示。
9. 最终新预览页控制台无警告或错误。旧页曾出现共享 Chat UI 热更新的属性重复定义错误；未改动宿主，新页面验证正常。

自动验证：

- `pnpm --filter @mewvis/learning test`：**64 / 64 通过**。
- `pnpm --filter @mewvis/learning check`：类型与运行边界检查通过。
- `pnpm --filter @mewvis/learning build`：最终构建通过，JavaScript 约 689 KiB，低于 768 KiB 预算。
- 覆盖表达式优先级与非法语法、域错误与预算、变量 / 依赖校验、五种预设、参考解与采样目标、观察记录恢复 / 隔离 / 存储失败、旧一次函数及高精度目标兼容、公式绑定与 AI 采用。

当前界面证据：

- [公式讲解](../../../../prototypes/learning-rich-content/qa/generic-formula-lesson.png)、[通用实验台](../../../../prototypes/learning-rich-content/qa/generic-ohm-lab.png)
- [公式编辑](../../../../prototypes/learning-rich-content/qa/generic-formula-editor.png)、[实验配置](../../../../prototypes/learning-rich-content/qa/generic-experiment-editor.png)
- [手机实验台](../../../../prototypes/learning-rich-content/qa/generic-lab-mobile.png)、[手机操作](../../../../prototypes/learning-rich-content/qa/generic-lab-mobile-controls.png)、[手机编辑](../../../../prototypes/learning-rich-content/qa/generic-editor-mobile.png)
- [平板实验台](../../../../prototypes/learning-rich-content/qa/generic-lab-tablet.png)、[深色主题](../../../../prototypes/learning-rich-content/qa/generic-lab-dark.png)

限制：计算引擎支持有界标量表达式，不运行 JavaScript；不做符号求解、量纲校验或自动验证推导。曲线挑战只判断采样点误差。浏览器使用内存存储和模拟聊天；真实模型、宿主数据库及宿主重启未做端到端联调，持久化与恢复逻辑由自动测试覆盖。没有发现仍需修复的 P0 / P1 / P2 项。

## 教学内容编辑调整（2026-10-03）

根据用户反馈，内容块改为上下布局：顶部同一行依次放序号、类型标签和右侧操作按钮，下面的编辑区占满卡片可用宽度。删除桌面端的标签侧栏、操作按钮绝对定位及为按钮预留的编辑区空白。

- 正文和提示文本框默认 8 行、最小高度 200 px；代码框默认 10 行、最小高度 240 px，保留纵向拖动调整。
- 在浏览器中分别新增正文、代码和提示块，实测初始高度为 200 / 240 / 200 px；新增正文仍自动获得焦点。
- 1280 px、1568 px 和 390 px 宽度检查通过。顶部按钮与标签同行，编辑区位于标题行下方并与其等宽；390 px 下页面没有水平溢出。
- 类型与运行边界检查、最终构建通过；浏览器控制台无警告或错误。本轮只调整布局及输入框尺寸，没有新增单元测试。
- 最终结果：**passed**。下方首版对照保留为过程记录，当前教学内容编辑器以本次截图为准。

实际界面：[桌面编辑器](../../../../prototypes/learning-rich-content/qa/editor-stacked-desktop.png)、[窄屏编辑器](../../../../prototypes/learning-rich-content/qa/editor-stacked-mobile.png)。

## 设计来源与比较方式

采用本次设计阶段选定的学习端与编辑端图稿，副本保存在 `prototypes/learning-rich-content/references/`。原图来自本会话生成的设计图，未使用其他产品页面作为视觉来源。

| 页面 | 设计图像素尺寸 | 最终实现截图像素尺寸 | 对照图 |
| --- | --- | --- | --- |
| 独立实验台 | 1487 × 1058 | 1487 × 1022 | [学习端对照](../../../../prototypes/learning-rich-content/qa/learner-comparison-final.png) |
| 富内容编辑 | 1568 × 1003 | 1568 × 1021 | [内容编辑对照](../../../../prototypes/learning-rich-content/qa/editor-comparison-final.png) |
| 图解编辑 | 1568 × 1003 | 1568 × 1003 | [图解编辑对照](../../../../prototypes/learning-rich-content/qa/diagram-comparison-final.png) |
| 实验配置 | 1568 × 1003 | 1568 × 1003 | [实验配置对照](../../../../prototypes/learning-rich-content/qa/experiment-comparison-final.png) |

比较时匹配桌面宽度，检查完整界面和公式局部。对照板对两侧采用相同比例缩放，另保存原始截图。生成图没有 CSS 密度元数据；浏览器截图的可见高度受到截图表面限制，并包含顶部开发预览栏，不能据此声称逐像素一致。`learner-content.png` 仅裁去开发栏，用于展示实际应用。

响应式补充检查使用 760 px 和 390 px 宽度。390 px 下页面根节点没有水平溢出；参数表在编辑器内部提供横向滚动。

## 视觉检查与修正

| 检查项 | 首轮问题 / 决策 | 最终状态 |
| --- | --- | --- |
| 页面结构 | 学习端需要保留目录、课时与导师三栏，并将实验从正文独立出来 | 正文 / 实验 / 测验导航明确；实验页有任务、参数、图形和检查反馈 |
| 编辑器层级 | 首轮遮罩过重，纵向内容块使公式与图解被挤到视窗外 | 改为浅色原生表面与紧凑横向块布局；课程步骤保持可见 |
| 图解密度 | 首轮只看到部分节点，编辑与预览关系不够直接 | 采用节点双字段行和左右分区，四节点示例可完整编辑与预览 |
| 实验配置密度 | 首轮参数区域过高，试跑按钮被推到下方 | 压缩参数表与图形高度，折叠可选提示 / 反馈，核心试跑操作进入可见区域 |
| 公式与图解 | 需要真实渲染、数据可编辑和错误处理 | 本地 KaTeX 输出 MathML；图解由结构化节点渲染；公式输入错误有提示 |
| 窄屏学习 | 导师面板初始占用过多实验空间 | 实验页默认收为 56 px 标题栏，可展开并返回实验 |
| 窄屏编辑 | 参数输入框继承的内边距截断 `0.1` | 修正内边距，复核步长与初始值清晰显示 |
| 颜色与主题 | 实验主题色需兼顾浅色表面 | 浅色主题使用更深的青绿色；深色主题单独复核坐标、曲线、控制和反馈 |
| 状态与文字 | 图稿中的聊天记录不应当作为实际生成结果展示 | 使用现有导师的真实初始状态、上下文与快捷操作，编辑区标明尚未保存到课程 |

首轮及修正证据：

- [编辑器首轮](../../../../prototypes/learning-rich-content/qa/editor-comparison-initial.png) → [编辑器最终](../../../../prototypes/learning-rich-content/qa/editor-comparison-final.png)
- [图解密度修正前](../../../../prototypes/learning-rich-content/qa/diagram-comparison-before-density-fix.png) → [图解最终](../../../../prototypes/learning-rich-content/qa/diagram-comparison-final.png)
- [实验配置修正前](../../../../prototypes/learning-rich-content/qa/experiment-comparison-before-density-fix.png) → [实验配置最终](../../../../prototypes/learning-rich-content/qa/experiment-comparison-final.png)
- [窄屏学习最终](../../../../prototypes/learning-rich-content/qa/learner-mobile-revised.png)、[窄屏编辑最终](../../../../prototypes/learning-rich-content/qa/editor-mobile-revised.png)、[平板编辑](../../../../prototypes/learning-rich-content/qa/editor-tablet.png)、[深色实验台](../../../../prototypes/learning-rich-content/qa/learner-dark.png)

## 有意保留的差异

- 沿用当前应用的紧凑字号、紫色主色、组件和间距体系。图稿用于确定信息结构与交互，不将新功能整体切换为另一套产品样式。
- 绘制数学上正确的坐标轴：纵轴位于 `x = 0`。设计图中的坐标轴位置存在示意误差，未照搬。
- 图解与坐标图均由配置数据驱动。图解采用可访问的节点列表，实验图使用 Canvas 并提供文字描述；使用现有 Lucide 图标，不以栅格图替代可操作控件。
- 公式采用系统 MathML 字体与单色排版。图稿中的变量彩色装饰和快捷符号面板未纳入本版；支持直接编辑 LaTeX 与即时预览。
- 图解预览显示当前节点配置，公式由独立公式块承载。原有示例与知识点继续保留在课时编辑表单中，可滚动编辑。
- 编辑器底部保持“保存课时”与外层“保存课程”的现有草稿层级，并给出保存范围提示。

## 功能验收

浏览器实际操作验证：

1. 打开函数示例，查看正文、MathML 公式和四节点图解，切换到独立实验页。
2. 初始 `k = 1, b = 1`，目标点为 `(2, 5)`，检查得到当前 `y = 3`、相差 `2` 的未通过反馈。
3. 使用键盘操作滑块至 `k = 2, b = 1`，检查通过；切走再返回，恢复最近一次已保存检查。
4. 在课程编辑中试跑初始参数得到失败结果；保存未改变内容的课时与课程后，学习端仍恢复之前 `k = 2, b = 1` 的成功记录，验证预览不会写入学习进度。
5. 编辑公式说明、图解节点、排列方向；新增提示块并上下移动；保存课时及课程，再次打开确认内容保留。
6. 配置无效步长 `0` 时阻止保存与试跑；恢复 `0.1` 后正常显示学生预览。
7. 检查 390 px 下的学习操作、导师展开 / 返回、编辑参数可读性；检查 760 px 下的编辑布局。
8. 新打开的预览页无控制台警告或错误。旧页面曾受共享聊天组件热更新影响报错；新页面启动与重新验证正常，未为此修改宿主。

自动验证：

- `pnpm --filter @mewvis/learning test`：55 / 55 通过。
- `pnpm --filter @mewvis/learning check`：应用类型与运行边界检查通过。
- `pnpm --filter @mewvis/learning build`：最终构建通过。
- 相关源码与文档的 `git diff --check` 通过。
- 新测试覆盖富内容与旧格式往返、Markdown / 公式安全渲染、参数边界与离散可达性、记录隔离与失效、AI 富内容采用和未保存表单冲突保护。

## 范围与限制

- 没有新增宿主能力或权限，也未改变宿主接口。富内容渲染与受控实验在学习应用内执行；实验只支持预置线性函数模板，不执行输入的 JavaScript。
- 保持现有 v2 数据形态兼容，新增字段可选。本次未更改版本清理标记；旧纯文本课时无修改保存时仍保持原形态。
- 浏览器使用本地开发预览的内存存储和模拟聊天。真实模型服务、真实宿主数据库和跨宿主重启流程未做端到端联调；数据序列化与重新实例化恢复由自动测试覆盖。
- 未运行 `test/browser-smoke.mjs`；本次交互验证使用浏览器实际操作完成。
- 本轮未发现仍需修复的 P0 / P1 / P2 项。快捷公式符号面板属于后续增强，不阻塞本次交付。

最终界面：[学习端](../../../../prototypes/learning-rich-content/qa/learner-content.png)、[富内容编辑](../../../../prototypes/learning-rich-content/qa/editor-stacked-desktop.png)、[图解编辑](../../../../prototypes/learning-rich-content/qa/diagram-final.png)、[实验配置](../../../../prototypes/learning-rich-content/qa/experiment-final.png)。
