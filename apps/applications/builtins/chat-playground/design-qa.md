# 调试台 · 紧凑密度验收

日期：2026-10-03。当前需求：保留方案 2 的布局与功能，缩小过大的字号、控件和留白。用户本轮反馈优先于初始设计图的尺寸。上一轮报告保存在 `prototypes/chat-playground-redesign/qa/initial-design-qa.md`。

**Findings**

- [P2，已修复] 标题最大 40px、主操作 50px 高，1280 × 800 应用窗口内只能露出一个后续入口。统一为 24px 页标题、18px 章节标题、16px 卡片标题、14px 入口标题、13px 正文及导航、12px 辅助文字；主按钮 34px，侧栏 188px，卡片和间距同步收紧。最终截图完整显示三个入口。
- [P2，已修复] 687px 侧栏窗口中结果表头换行、哈希被拆断。表头列最小 112px，哈希使用单行省略并保留完整结果操作；`25-compact-panel.jpg` → `26-compact-panel-refined.jpg` 已复核。
- [P2，已修复] 聊天区域收紧后，空状态被滚动到可见区域外。定制聊天的头部、消息区、底部间距与空状态高度同步调整；`27-compact-chat.jpg` → `29-compact-chat-final.jpg`，空状态文字与发送控件均在可视区域内。

当前无待修复的 P0 / P1 / P2 设计问题。

**Comparison evidence**

- Source visual truth（布局参考）：`/Users/haowen.zheng/Development/projects/isle/prototypes/chat-playground-redesign/02-capability-gallery.png`。密度尺寸以用户本轮反馈与下列新规格为准。
- 调整前：`/Users/haowen.zheng/Development/projects/isle/prototypes/chat-playground-redesign/qa/23-before-density-desktop.jpg`。
- 最终实现：`/Users/haowen.zheng/Development/projects/isle/prototypes/chat-playground-redesign/qa/32-compact-final-desktop.jpg`。
- Full-view comparison：`/Users/haowen.zheng/Development/projects/isle/prototypes/chat-playground-redesign/qa/35-density-comparison.jpg`。左侧调整前、右侧调整后，在同一比较图中核对整体密度与首屏内容。
- Focused comparison：`/Users/haowen.zheng/Development/projects/isle/prototypes/chat-playground-redesign/qa/36-density-type-controls.jpg`。等比例裁切页标题、示例标题、输入与操作区域；没有缩放原始内容。
- 渲染 URL：`http://127.0.0.1:5173/`。
- CSS 视口 1280 × 834、devicePixelRatio=1；排除 34px 开发预览栏，前后实现均为 1280 × 800 像素。比较图为 2560 × 800 像素，显示时可以缩放，原始截图保持 1:1。初始生成图为 1487 × 1058，只用于结构与视觉语言参考。
- State：浅色、能力总览、默认文本、运行前示例、代码折叠。没有把不同工具运行数值误判为设计差异。
- 比较历史：初始大尺寸截图 → 桌面紧凑版 `24-compact-desktop.jpg` → 修复窄窗表格及聊天空状态 → 最终 `32-compact-final-desktop.jpg` 和同尺度完整、重点区域对照，确认问题关闭。

**Required fidelity surfaces**

| 检查面 | 结果 |
| --- | --- |
| 字体与层级 | 统一 12 / 13 / 14 / 16 / 18 / 24px 字号；页标题固定上限，取消随宽度放大的 vw 规则。700px 以下页标题 22px。系统字体回退保持原实现，字重与行高经重点区域对照复核 |
| 空间与布局 | 188px 侧栏、40px 顶栏、20–24px 内容留白、34px 按钮、38px 示例输入框；保留左右运行/结果与三个后续入口。内容宽度低于 620px 时纵向排列，避免仅按窗口宽度导致不必要堆叠 |
| 颜色与主题 | 沿用全部共享语义色与焦点指示，浅色与深色截图检查通过，无主题颜色漂移 |
| 图像与图标 | 无新增图像资产；Lucide 图标按控件缩为 16–20px，导航 17px。原有标准图标、文本输入中的表情均保留 |
| 文案与内容 | 六类导航、示例说明、返回结果和接入代码保持原内容；通过字号和布局提高密度，没有删除功能来缩短页面 |

**Interactions and responsive checks**

- 1280 × 834：总览、聊天、数据表单、审批、内嵌视图截图通过。聊天发送控件可见，内嵌视图成功挂载，子视图 16px 标题和 13px 正文同步调整。
- 687 × 690：原生面板宽度下可保持两列，结果表格可读，DOM 检查无横向溢出。证据：`26-compact-panel-refined.jpg`。
- 390 × 844：单列、输入与按钮完整可达，无横向溢出。证据：`34-compact-mobile.jpg`。粗指针设备保留至少 40px 的主要操作触控高度。
- 深色：`33-compact-dark.jpg`；输入、卡片、文字及语义状态保持可读。
- 工具执行仍实际返回 14 字符、17 字节与 Node SHA-256，完整结果入口保留。
- 最终恢复默认窗口尺寸并整页加载；本次加载检查没有控制台 error。

**Validation**

- `pnpm --filter @mewvis/chat-playground check`：通过。
- `pnpm --filter @mewvis/chat-playground build`：通过。
- 本应用 `git diff --check`：通过。
- 本轮仅改应用样式及子视图样式，没有修改 SDK 或执行逻辑；未重复全仓构建及模型审批测试。

**Implementation checklist**

- [x] 统一字号、侧栏、控件和卡片密度
- [x] 各能力页面与内嵌视图同步
- [x] 修复窄窗表格与聊天空状态
- [x] 同尺寸前后对照及重点区域复核
- [x] 浅色、深色、面板宽度和窄屏检查
- [x] 类型检查与独立打包

**Follow-up polish**

没有阻碍本轮密度调整交付的待办。真实模型、原生审批等宿主能力的验证范围沿用上一轮报告。

final result: passed
