# 酒馆设置 · 方案 1 实现验收

final result: passed

没有未解决的 P0/P1/P2 问题。验收对象是用户选定的第 1 张设计稿，以及当前工作区中的真实 `TavernManageContent` 组件。

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
