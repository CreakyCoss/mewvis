# @isle/tavern

Isle 内置的原生酒馆应用。源码只使用 `@isle/app-sdk` 提供的工具、
技能、设置 Schema 和 Cordis 生命周期契约。

## 能力

- 管理一个个独立酒馆，每个酒馆拥有自己的角色卡、世界书和角色扮演规则
- 为模型生成当前酒馆的上下文
- 应用包自带沙箱酒馆工作台，不依赖 Isle 内部业务页面
- 设置独立保存到 `apps/isle-tavern/settings.yaml`
- Schema 默认值、用户覆盖和 `$version` 迁移由 `defineSettings` 管理

## 工具

- `tavern_list`
- `tavern_save`
- `tavern_remove`
- `tavern_activate`
- `tavern_context`

## 打包

源码只维护 `isle.app`，不携带手写 DSH 清单。发布兼容包时运行：

```sh
pnpm app:pack -- applications/builtins/tavern --target dsh
```

生成的 DSH 包会内联 SDK 与设置 Schema 实现，并自动生成
`cordis.patch.yml`；同一产物仍能由 Isle 原生加载。
