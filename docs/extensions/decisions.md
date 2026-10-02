# 智能判断能力与插件

系统提供统一的 `decisions.evaluate` 协议。调用方只描述材料、问题及输出约束，不选择提供者、不传规则 ID。宿主可以直接实现该能力，也可以将它绑定给一个已启用的插件实现。

```ts
const result = await ctx.host.decisions.evaluate({
  input: "方案内容……",
  question: "这份方案是否具备开始实施的条件？",
  output: { type: "boolean" },
}, { signal });
```

调用方在清单的 `host.required` 或 `host.optional` 中声明 `decisions.evaluate`；可用性通过 `host.supports` 查询。插件提供者声明 `host.provides: ["decisions.evaluate"]`，并在同步 setup 中调用 `ctx.provide("decisions.evaluate", handler)`。提供者仍通过现有运行模块加载，但不会成为某个 Agent 的专用工具协议。只有工具/命令入口需要各 Agent 的适配。

## 输入与结果

标准输入严格为 `{ input, question, output }`：

- `input`：本次判断的材料，1–24000 字。
- `question`：本次判断目标，1–4000 字。
- `output`：`{ type: "boolean" }`、`{ type: "choice", options: [...] }` 或 `{ type: "score", levels: [...] }`。选项与档位为 2–10 个不同的非空字符串，评分按档位索引从 0 开始。

标准结果包含 `type`、`value`、`status` 和 `reason`。`value: null` 仅对应 `abstained`；其他结果可为 `accepted` 或 `review_required`。可选 `confidence: { value, source }` 区分 `model_self_report`、`calibrated`、`rule`，调用方不能将不同来源直接当作同一种概率。宿主校验返回类型、选项和评分边界，提供者不能改变调用方的输出约束。

## 判断插件内部

`apps/extensions/decisions` 实现并提供此能力。它复用当前会话模型，不连接 Jev，不需要 TypeSafe API Key。是否联网取决于当前模型配置。

处理顺序：

1. 匹配启用的用户自定义规则。
2. 无可靠匹配时匹配插件内置规则：执行条件、方案质量、意图分类、资料相关性、证据支持。
3. 仍未命中则使用通用判断。

用户规则只有内部用途：名称、启用状态、适用条件、判断标准、优先级和复核阈值。添加规则不会增加命令，也不会改变外部协议。模型只评估规则适用性，匹配自评值达到 0.8 才视为命中；代码按优先级、匹配值、规则 ID 的顺序选择一条。每层至多一次匹配请求，未启用自定义规则时跳过该层。

规则命中后，只按该标准执行判断。否定结果、低置信度或弃答不会触发下一层；执行异常明确失败。格式错误最多重试一次，不将请求失败包装为“未命中”。普通模型的匹配值和判断置信度均为自评，未经统计校准。

模型请求使用 `tasks.run({ tools: "none", ... })`，不加载工具、技能和应用资源，不继承原聊天历史。匹配与判断子任务沿用输出记录、超时和取消机制。一次判断通常有 2–3 次模型请求，加上必要的格式修正；它不具备 Jev 的专用模型性能或校准保证。

## 在界面中使用

完整重启桌面开发服务，在插件管理中打开“智能判断标准”。一级页面通过“自定义规则 / 内置规则”页签分开显示。内置规则平铺展示名称、适用条件、判断标准、优先级和复核阈值，仅供查看，不提供编辑或删除操作。两类规则共用卡片布局，完整展示名称、适用条件、判断标准、状态、优先级和复核阈值。点击自定义规则名称或“添加规则”打开编辑弹窗。保存后立即刷新列表，取消或关闭丢弃草稿。删除按钮放在外层列表，首次点击变为错误色的“确认”按钮，再次点击才删除；移开焦点取消确认。弹窗使用应用级 `plugin.dialog` 与宿主 `DialogSlot`。没有自定义规则也可直接使用。

聊天输入 `/` 可选择“需求分类”“方案评分”“执行条件判断”。这些是固定的便利入口，都经过同一套规则匹配。通用“智能判断”命令接受结构化参数，模型工具 `evaluate` 也使用相同标准输入。

协作插件的步骤可勾选“完成后判断结果”，填写判断问题和输出约束。材料为该步骤输出，判断结果附加到步骤结果中供后续步骤引用；当前不自动分支或跳转。协作插件只认协议，不知道规则 ID 或判断插件 ID。

旧版本的 `profiles` 模板配置已被 `rules` 替代，不保留旧协议兼容；已有手动配置需按新的规则结构重新配置。

## 宿主边界

宿主负责注册、权限、查找提供者、输入输出校验、信号传递和资源释放，不包含匹配或判断规则。没有提供者时为 unsupported；多个提供者时明确报冲突，不按加载顺序任选一个。提供者使用自己的配置、能力授权和状态事务。递归调用在获取状态锁前拒绝，调用链限制为 8 层。

## 验证

```sh
pnpm --filter @mewvis/extension-decisions check
pnpm --filter @mewvis/extension-decisions test
pnpm --filter @mewvis/extension-host test
pnpm --filter @mewvis/agent-runtime test:extensions
pnpm --filter @mewvis/server test:extensions
```

测试覆盖分层匹配、优先级、输出约束、弃答与取消、原生宿主实现、跨插件提供者路由及状态隔离、递归和重复提供者，以及真实协作插件 → SDK → 宿主 → 判断插件 → Pi 的链路。使用本地模型桩，不调用付费模型。
