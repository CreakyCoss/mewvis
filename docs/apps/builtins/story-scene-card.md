# @isle/story-scene-card

Isle 内部的原生小说能力。源码只依赖 `@isle/app-sdk`，通过 Isle
私有的 Cordis 生命周期注册 Skill 和 Tool。

当前应用用于验证便携契约：Skill 负责说明使用时机，`isle_story_scene_card` 工具负责生成结构化场景卡。

包内同时声明了 `isle.ui` 沙箱页面。Isle 把 `isle-ui.js` /
`isle-ui.css` 放进无网络、无同源权限的 iframe，只通过
`window.isleApplication.executeTool()` 调用本应用拥有的工具。

源码不维护 `dsh.bundle` 或 `cordis.patch.yml`。发布到 DeepSeek Harness
前运行：

```sh
pnpm app:pack -- applications/builtins/story-scene-card --target dsh
```

打包器会把 SDK 和依赖写入单文件入口，并生成标准 DSH Bundle；该产物
同时保留 Isle UI 元数据，因此仍可直接导入 Isle。
