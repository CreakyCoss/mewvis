# 代码结构

`main/App.tsx` 负责项目库与工作区切换。业务代码按项目管理、数值玩法和文字冒险组织；各领域内部再区分纯逻辑、文件读写和界面。

```text
main/
  App.tsx
  projects/
    model.ts                 # 项目、设计说明、命名版本、项目库状态
    catalog.ts               # 类型、玩法方向、格式与模拟器对应关系
    compatibility.ts         # 跨类型的项目就绪检查
    document.ts              # 项目 JSON 校验、解析及旧格式读取
    paths.ts                 # 项目目录与文件路径规则
    repository.ts            # SDK 读写、项目索引、备份与冲突保护
    examples.ts / templates/ # 只读系统示例
    components/              # 项目库、新建、设置、概览、方向选择
  turn/
    Workspace.tsx            # 数值项目的导航、草稿编辑与页面协调
    model.ts / definitions.ts
    engine.ts / simulators.ts
    rules/                   # 关系图、定义检查器、效果与回合编辑
    playtest/                # 场景和决策策略配置、编辑、持久化
    records/                 # 对局/实验记录协议、文件读写、试玩控制
    experiments/             # 对照计算、实验执行、报告
    views/                   # 规则、试玩、历史和版本页面
    components/              # 工作区弹窗
  narrative/
    Workspace.tsx            # 叙事项目的导航、草稿保存与试玩协调
    model.ts / validation.ts # 独立叙事模型及校验
    engine.ts / analysis.ts  # 条件、后果、分支执行与结构分析
    records.ts / repository.ts
    views/                   # 人物、剧情、变量、试玩、记录等页面
    components/              # 选项编辑器、变量值输入及显示名称
  shared/
    contracts.ts             # 校验问题与模拟器引用等公共契约
    utils.ts                 # 深拷贝与标识生成
    components/              # 沙盒表单与弹窗
  styles/
    index.css                # 唯一样式入口，明确导入顺序
    ...                      # 基础、布局、表单及各功能样式
test/
  run.mjs                    # 领域测试入口
  domain/                    # 数值核心、对照、模拟器、叙事测试
  helpers/domain.mjs         # 测试用 TypeScript 打包与清理
  projects.mjs               # 生产文件服务集成测试
  host-fixture.mjs            # 隔离宿主服务
  preview-packed.mjs         # 打包应用的人工验收服务
```

## 依赖与修改位置

- `shared` 不依赖项目或具体玩法。叙事的模型、校验和执行不引用数值玩法模块。
- 模型、校验器、执行器、对照计算和记录解析保持纯 TypeScript，不依赖 React 或文件 SDK。项目层可以组合两类模型进行创建、解析和就绪检查。
- `repository.ts` 负责 SDK、原子写入及外部修改保护；页面和 Hook 调用仓库，不直接操作文件。工作区通过 `saveProject(project)` 保存当前项目。
- `Workspace.tsx` 负责导航和协调。独立页面放在 `views`，场景配置、历史加载、对局操作及可续跑实验的 Hook 放在对应功能目录。页面组件不相互导入工作区。
- 直接从所属模块导入类型和函数，不用集中转导出文件掩盖依赖方向。Select 继续直接使用宿主 `NativeSelect`，不扩展宿主组件。
- 仅 `App.tsx` 导入 `styles/index.css`。其导入顺序保留原有 CSS 层叠关系，新增样式放入对应功能文件，避免再向单个样式文件累加。

目录调整不改变项目磁盘结构、JSON 格式、模拟器版本或现有文件的读取规则。

## 验证

在仓库根目录执行：

```sh
pnpm --filter @mewvis/gameplay-lab check
pnpm --filter @mewvis/gameplay-lab test
pnpm --filter @mewvis/gameplay-lab test:projects
pnpm --filter @mewvis/gameplay-lab build
```

界面变更使用 `preview:packed` 检查项目创建、编辑、保存、试玩、回放和重新打开。该服务使用临时项目目录，不读取真实用户项目。
