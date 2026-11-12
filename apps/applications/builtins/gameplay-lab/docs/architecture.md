# 代码结构与框架边界

应用入口在 `app.config.ts` 明确指定 `main/app/App.tsx`。代码按项目应用、玩法框架、领域规则、验证工具及共享界面组织，框架拥有自己的结构定义、编辑器与游戏场景。

```text
main/
  app/
    App.tsx                         # 项目库、创建与工作区路由
    projects/                       # 项目格式、文件仓库、索引、内容目录及设置
      templates/                    # 可选示例内容，手动复制到项目
      components/                   # 创建、框架选择、设置、内容与异常提示
    workspaces/
      NumericWorkspace.tsx          # 数值方案保存、导航、版本与试玩会话协调
      turn/                         # 通用高级定义编辑与数值记录页面
  frameworks/
    creation.ts                     # 框架创建、预设与示例准备的统一注册
    composition/                    # 通用组合契约、兼容性解析、运行与界面装配及组合编辑页
    contracts.ts / catalog.ts       # 类型与框架登记，不依赖 React
    runtime-contracts.ts            # 各框架保留自身模型、状态、命令和玩家视图
    workspaces.tsx                  # 框架工作区登记，应用入口不分派玩法页面
    numeric-runtime.ts              # 数值框架执行登记
    numeric-ui-contracts.ts          # 数值工作区的专属页面/场景适配约定
    numeric-ui.ts                   # 数值框架界面登记
    card-scoring/
      composition/                  # 计分骨架、预设、运行、私有视图及界面装配
      extensions/pair-reward/        # 配对奖励的规则贡献、编辑与牌桌区域
      definition.ts                 # 组合计分范围及模型、模拟器绑定
      structure.ts                  # 必要得分/出牌/目标结构，不含示例卡牌
      editor/                       # 专属概览、卡牌、牌库、计分与回合配置
      play/                         # 独立牌桌、预估得分及牌区检查
      styles.css                    # 该框架的编辑与游戏样式
    resource-development/
      definition.ts / runtime.ts    # 回合资源发展范围与数值执行适配
    doudizhu/                       # 独立斗地主模型，不继承数值状态模型
      composition/                  # 骨架、布局、模块登记、经典预设及组合编辑
      definition.ts / model.ts / validation.ts
      rules/                        # 牌型识别、候选出牌、大小比较
      runtime/                      # 核心流程、开放类型契约及组合运行入口
      bots/                         # 只读取玩家视图的基础自动对手
      editor/                       # 规则、概览、版本和项目设置
      play/                         # 专属牌桌、历史列表及检查界面
      extensions/heroes/            # 洞察模块的配置、运行及界面注册
      records.ts / repository.ts    # 冻结记录、重算与文件仓库适配
      Workspace.tsx                 # 保存与对局会话协调
    branching-story/                # 条件叙事的模型、执行、编辑、阅读及记录
  domains/
    card/                           # 卡牌定义、牌库、实体牌、选牌、共享洗牌与校验
    turn/                           # 数值状态、行动、目标、结算及引用索引
  validation/
    playtest/                       # 场景、自动玩家、配置与编辑
    records/                        # 文件记录公共保存、数值对局及会话控制
    experiments/                    # 策略、版本、参数对照及报告
  shared/
    contracts.ts / content.ts       # 公共只读契约
    utils.ts / use-content-focus.ts
    components/                     # 表单、普通弹窗和独立试玩窗口
    turn/                           # 通用数值效果与周期编辑控件
  styles/                           # 应用工作台样式及唯一样式入口
```

## 修改约定

- `app` 负责用户项目、持久化与应用流程。编辑框架内容时使用受控更新，不让框架页面直接读写文件。
- `domains` 的模型、校验、执行与引用计算保持纯 TypeScript，不依赖 React、项目仓库或文件 SDK。
- `frameworks/*/definition.ts` 登记玩法边界，`structure.ts` 创建必要规则结构。编辑器和游戏场景按该框架的领域语言呈现，不要求用户重复搭建框架已有的流程。
- 组合计分的 `structure.ts` 在用户手动建项时创建得分状态、出牌行动、目标和空牌库。读取项目时不补写结构；已有当前格式内容由原规则解释。
- 游戏场景与自动玩家均调用相同的确定性执行器。`play/preview.ts` 只预估组合得分，最终结算、成本与越界检查由执行器完成。
- 试玩会话由 `validation/records/use-run-session.ts` 管理，每次操作保存成功后才更新可见状态。游戏窗口关闭保留记录，检查面板和实验样本共享冻结快照。
- 卡牌的主编辑入口为卡牌、牌库、计分与回合；内容目录与抽象定义保留为辅助和高级入口。
- 普通表单直接使用宿主 `NativeSelect`。不修改宿主或设计系统组件；游戏场景的样式限制在自身命名空间内。
- `styles/index.css` 是唯一样式入口，显式引入框架和共享窗口样式。运行窗口处理宿主安全区，窄屏保留 44px 操作高度。斗地主在关闭窗口、历史回放、检查面板或操作失败时暂停自动对手。

斗地主拥有独立的 `DoudizhuModel / DoudizhuState / DoudizhuCommand / DoudizhuView`，实现 `GameRuntime`。组合计分通过通用装配器接入数值核心，配对奖励按注册模块贡献有效规则，界面通过数值适配器装配；资源发展继续使用已有数值能力。条件叙事使用既有独立模型、执行与阅读工作区。

`GameRuntime` 约定创建、校验、推进、玩家视图、合法候选和自动决策，不要求不同框架共享状态字段。数值验证、策略参数扫描仍只服务数值框架，斗地主当前提供人工试玩、基础自动对手及历史回放。

斗地主通过 `composition` 引用骨架、布局及模块版本，具体配置保存在 `extensions`。通用装配器根据注册模块接入初始化、合法命令、结算、私有视图和自动决策；界面装配器加入对应编辑页和牌桌区域。斗地主核心、工作区和基础牌桌不直接引用英雄实现。经典预设与自定义方案走同一流程，完整约定见[玩法组合与模块接入](composition.md)。目前不提供跨框架任意装配机制。

叙事和斗地主的文件记录共用 `validation/records/file-store.ts`，框架提供自己的解析与重算函数；公共仓库负责目录身份、独占创建、外部修改检查及不兼容文件的确认删除。组合计分的专属导航、编辑和牌桌由 `card-scoring/workspace-ui.tsx` 提供，`NumericWorkspace` 不再直接引用这些组件。

## 项目磁盘结构

用户仍手动创建项目并选择父目录。框架实现由应用内置，示例内容为可选来源；用户修改自己的 JSON。

```text
项目目录/
  models/core.json        # 内容、可调整规则及项目元数据、命名版本
  configs/playtest.json   # 数值玩法的场景与自动玩家
  runs/                   # 冻结模型、决策、事件与结果
  experiments/            # 实验方案与样本
  backups/                # 应用/重置示例前的副本，按需创建
  .mewvis/workspace.json  # 宿主目录登记
  workspace.db            # 宿主工作区数据库
```

本轮整理应用源代码，不在加载时移动用户目录或转换 JSON。项目元数据中的 `direction` 保存玩法框架标识，模拟器引用保存执行版本；目录项目、数值对局和实验继续使用当前的 v4/v3/v4 格式，斗地主模型使用 `gameplay-doudizhu-v1`，对局使用 `gameplay-doudizhu-run-v1`。不兼容内容提示并保留，只有用户确认后才可删除。

## 验证

```sh
pnpm --filter @mewvis/gameplay-lab check
pnpm --filter @mewvis/gameplay-lab test
pnpm --filter @mewvis/gameplay-lab test:projects
pnpm --filter @mewvis/gameplay-lab build
pnpm --filter @mewvis/gameplay-lab preview:packed
```

隔离预览使用生产 SDK、文件与数据库服务，目录选择器为测试替身，不访问真实用户项目。基础编辑能力与剩余缺口见[能力盘点](foundations.md)。

创建表单只读取 `frameworks/creation.ts` 的预设与描述，项目仓库通过相同注册创建或准备示例。斗地主和组合计分共用 `composition/Editor.tsx`，各自提供 `CompositionDesign`。

卡牌能力模块以自己的目标接入主动能力契约，使用共享抽牌和牌区移动原语；配置、引用检查、运行、编辑和面板放在 `card-scoring/extensions/card-abilities/`。命令后的 `afterAdvance` 结算按依赖顺序执行，和原命令处于同一原子操作；组合计分据此处理自己的阶段结束和专注时限。具体语义见[卡牌能力](card-abilities.md)。

棋盘经济以 `board-economy` 登记自己的创建、模型和工作区，实现独立 `BoardModel / BoardState / BoardCommand / BoardView` 与 `GameRuntime`。不进入数值模型或模拟器登记。棋盘复用 `shared/random.ts`、项目服务、`PlayWindow` 与 `createRecordStore`；卡牌的随机 API 作为相同整数序列的兼容别名保留。目录项目允许棋盘模型与其他类型共存，命名版本不能跨独立模型混用。

棋盘 `play/presentation.ts` 从已保存命令的前后状态构造只用于展示的掷骰、路径和收支帧；不推进引擎或写入记录。`use-board-presentation.ts` 管理播放、跳过、取消和减少动态效果，工作区在文件写入成功后才启动展示，并在播放期间暂停下一条自动命令。关闭、检查、回放、记录切换及后台状态会清理定时器并显示权威快照。收支说明直接来自冻结事件，包含真实支付金额和双方租金转移。

终局 `play/result.ts` 只从当前可见状态生成摘要，回放早期步骤不会显示未来结果；破产移交通过最后操作前后的归属快照核对，不能把赢家全部地产都当成移交所得。`BoardResult.tsx` 展示结算、终局资产与回放/返回设计入口；只读结果禁用新开对局，新局仍由工作区按当前草稿创建，不修改旧记录或实验样本。

`board-economy/experiments` 负责棋盘冻结实验、同种子调度、逐局持久化、取消续跑与配对统计。`createRecordStore` 可选记录目录与大小预算，默认仍为 `runs/`、4 MiB；棋盘实验用 `experiments/`、16 MiB。样本复用棋盘运行时及基础策略，读取时重算并用不可变指纹缓存已验证单元；规则指纹变化会失效。只读样本转换为临时 `BoardRecord` 供回放，不调用试玩记录保存。

`rent-scan.ts` 用整数百分之一表示倍率，从冻结基准只派生地产租金，保留原值基准并按实际租金向量去重。实验计划的可选 `scan` 字段沿用当前 v1 格式；校验器重新生成全部派生规则并核对，缓存签名包含扫描配置。扫描复用现有调度与持久化，按唯一规则计算 240 局预算；统计按倍率映射到唯一规则，趋势图在无成功样本处断开，配对差异仅使用与基准都成功的同种子样本。
