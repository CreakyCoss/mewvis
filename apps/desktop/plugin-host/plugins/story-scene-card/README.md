# @isle/story-scene-card

Isle 内部的第一份可移植小说能力。它只依赖 DeepSeek Harness 的 Cordis `tools` / `skills` 服务，因此同一入口既能由 Isle Agent Runtime 加载，也能放进标准 DSH Bundle。

当前插件用于验证便携契约：Skill 负责说明使用时机，`isle_story_scene_card` 工具负责生成结构化场景卡。

包内同时声明了 `isle.ui` 沙箱页面。DeepSeek Harness 继续读取标准 `dsh.bundle`，Isle 则把
`isle-ui.js` / `isle-ui.css` 放进无网络、无同源权限的 iframe，只通过
`window.islePlugin.executeTool()` 调用本插件拥有的工具。因此同一 npm 包可以发布到 DSH
社区市场，也能在 Isle 中得到专用的场景卡工作台。
