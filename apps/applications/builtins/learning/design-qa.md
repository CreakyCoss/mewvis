# 学习应用富内容与受控实验：设计验收

- 日期：2026-10-03
- 最终结果：**passed**
- 范围：按已选的独立实验台方案，完成富内容课时、公式、图解、课程编辑和受控函数实验。遵循当前学习应用的视觉规范与现有宿主边界。
- 实现入口：`main/App.tsx`、`main/LessonEditor.tsx`、`main/RichContentEditor.tsx`、`main/ExperimentEditor.tsx`、`main/FunctionExperiment.tsx`、`main/rich-content.css`。
- 本地预览：<http://127.0.0.1:5178/>；课程库点击“函数实验示例”，打开第二课“斜率与截距”。

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
