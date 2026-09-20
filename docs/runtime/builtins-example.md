# 内置工具与技能示例

示例位于 `apps/agent-runtime/src/engines/builtins/example/`，是一个未注册的最小能力包，演示原内置能力的目录结构和声明方式。工具只统计传入的文本，不依赖故事应用或工作区数据。

```text
example/
├── index.ts                     # defineBuiltin 组合工具和技能
├── protocol.ts                  # 版本化协议及 API 类型
├── tool/
│   ├── definition.ts            # 工具参数、风险等级、输入校验与实现工厂
│   └── service.ts               # 协议方法的实现
└── skills/
    ├── definition.ts            # 技能名称、资源目录、依赖协议
    └── example-text-stats/
        └── SKILL.md             # 给模型的使用流程
```

从 `index.ts` 开始阅读。`defineBuiltin` 检查工具定义是否满足技能所需协议；运行时的 `assertBuiltinToolImplementation` 检查实现是否提供协议方法；工具入口使用 Zod 校验实际参数。

例如输入 `{ "text": "你好🙂" }`，输出为 `{ "codePoints": 3, "utf8Bytes": 10, "lines": 1 }`。

示例目录没有被父级 `builtins/index.ts` 导入，也没有加入 `builtinRegistry`，因此不会加载技能、注册工具或保留技能名称。示例源码参与 TypeScript 检查，但技能资源不随运行时复制。`resolveSourcePath` 展示源码目录中的资源定位方式；将来若复制成正式能力，需显式处理注册及打包后的资源路径。
