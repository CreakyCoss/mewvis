# Novel-Claw Tauri 客户端技术规格书

## 1. Context

### 项目背景
构建一个基于 Tauri 的桌面客户端，支持多工作区与 AI 进行聊天交互，具备文件编辑和技能调用能力。数据存储统一使用 SQLite，工作区数据库存放在工作区目录内。

### 核心需求
1. 多工作区管理（创建、切换、删除、指向实际目录）
2. AI 聊天交互 + 文件编辑保存 + 技能调用
3. SQLite 数据库存放在工作区目录内
4. AI SDK 可插拔切换
5. 支持多模型配置

### 技术选型依据
- **pi-ai** (`@earendil-works/pi-ai`) — 统一 LLM API，支持 20+ 提供者
- **pi-coding-agent** (`@earendil-works/pi-coding-agent`) — 内置 read/bash/edit/write 工具，支持 SDK 和 RPC 导出
- **Tauri v2** + `tauri-plugin-sql` (SQLite 支持成熟)
- **React** + **Tailwind CSS** + **shadcn/ui** (现代前端 UI)

---

## 2. UI 框架对比

### shadcn/ui vs Ant Design (antd)

| 维度 | shadcn/ui | antd |
|------|-----------|------|
| **定位** | 组件库源码，可复制粘贴到项目中 | 完整 UI 框架，通过 npm 安装 |
| **定制性** | 高（源码在手，可任意修改） | 中（通过 props/theme 定制） |
| **包大小** | 小（只添加需要的组件） | 大（完整 bundle） |
| **样式方案** | Tailwind CSS | Less/CSS-in-JS |
| **学习曲线** | 低（HTML + Tailwind 基础） | 中（需要理解 antd 概念） |
| **许可** | MIT（可商用） | MIT（可商用） |

**结论**：选用 **shadcn/ui** + **Tailwind CSS**
- 组件源码直接放在项目中，维护方便
- Tailwind CSS 原子化样式，定制灵活
- 无需 npm 发版，复制即用

---

## 3. 核心决策

### 3.1 pi-ai 与 pi-coding-agent 引用方案

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| **npm workspaces** | 配置 `workspace:*` 协议，import 时写包名 | import 路径干净（`@earendil-works/pi-ai`），无需私有仓库 | 需要在 ai/pi 目录先 build |
| **本地 npm 仓库** | 用 Verdaccio 搭建私有 registry，publish 后引用 | 完全模拟真实 npm 体验 | 需要额外运行 registry 服务 |
| **复制 dist 文件** | build 后复制 dist 到项目 vendor 目录，用 path alias | 简单直接 | 版本管理困难，需手动同步 |

**推荐：npm workspaces**
- 配置 `package.json` 的 `workspaces` 字段指向 `ai/pi/packages/*`
- import 时使用包名 `@earendil-works/pi-ai`，不是相对路径
- npm 会自动解析到本地 workspace 包

```json
// novel-claw/package.json
{
  "workspaces": [
    "ai/pi/packages/*"
  ],
  "dependencies": {
    "@earendil-works/pi-ai": "workspace:*",
    "@earendil-works/pi-coding-agent": "workspace:*"
  }
}
```

构建流程：
1. `cd ai/pi && npm install && npm run build` — 构建所有包
2. 回到根目录 `npm install` — npm workspaces 链接本地包
3. 前端 `import { ... } from '@earendil-works/pi-ai'` — 正常使用

---

## 4. 技术架构

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri Desktop App                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │   Frontend  │  │ AI Adapter   │  │  Rust Backend   │  │
│  │   (React)   │◄─┤    Layer     │◄─┤  (SQLite Cmds)  │  │
│  └─────────────┘  └──────┬──────┘  └────────┬────────┘  │
│                           │                  │           │
│                           ▼                  │           │
│  ┌────────────────────────────────────────────┴────────┐ │
│  │           pi-coding-agent (SDK/RPC)                  │ │
│  │  - 内置 read/bash/edit/write 工具                   │ │
│  │  - 会话管理                                         │ │
│  │  └────────────────────────────────────────────────┘ │ │
│  │                      ▼                              │ │
│  │           pi-ai (Provider Registry)                 │ │
│  │  - OpenAI / Anthropic / Google / ...                │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 4.2 数据库架构

#### 全局数据库 (`~/.novel-claw/config.db`)

```sql
-- 工作区列表
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,              -- 工作区实际目录路径
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_active INTEGER DEFAULT 0
);

-- LLM 提供者配置（含多模型）
CREATE TABLE llm_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider_type TEXT NOT NULL,     -- 'anthropic', 'openai', 'google', etc.
    api_key TEXT,
    base_url TEXT,
    is_default INTEGER DEFAULT 0,
    models_json TEXT NOT NULL,       -- JSON 数组：[{"id": "claude-sonnet-4-7", "name": "Claude Sonnet 4"}]
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 全局设置
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

#### 工作区数据库 (`{workspace_path}/workspace.db`)

> **注意**：暂不设计具体 schema，只确保数据库文件创建在 `{workspace_path}/workspace.db`

---

### 4.3 AI 适配层设计

```typescript
// ai/adapters/base.ts
export interface AIAdapter {
  readonly name: string;
  readonly providerType: string;
  chat(options: ChatOptions): Promise<ChatResult>;
  streamChat(options: ChatOptions, onChunk: (chunk: ChatChunk) => void): () => void;
}

// ai/adapters/pi-ai.ts
export class PiAIAdapter implements AIAdapter {
  readonly name = 'pi-ai';
  readonly providerType: string;
  constructor(private registry: ApiRegistry, private model: Model<Api>) {}
  chat(options: ChatOptions): Promise<ChatResult> { ... }
  streamChat(options, onChunk): () => void { ... }
}

// ai/adapters/factory.ts
export function createAdapter(
  providerType: string,
  config: ProviderConfig,
  registry: ApiRegistry
): AIAdapter { ... }
```

### 4.4 核心模块结构

```
src-tauri/
├── src/
│   ├── main.rs                 # Tauri 入口
│   ├── lib.rs                  # 库入口
│   ├── commands/              # Tauri Commands
│   │   ├── mod.rs
│   │   ├── workspace.rs       # 工作区 CRUD
│   │   ├── chat.rs            # 聊天操作
│   │   └── settings.rs        # 设置管理
│   ├── db/                     # SQLite 操作
│   │   ├── mod.rs
│   │   ├── config_db.rs        # 全局配置数据库
│   │   └── workspace_db.rs    # 工作区数据库
│   └── errors.rs              # 错误类型

src/                             # React 前端
├── main.tsx
├── App.tsx
├── components/
│   ├── ui/                     # shadcn/ui 组件
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   └── ...
│   ├── WorkspaceSelector.tsx
│   ├── ChatView.tsx
│   ├── SettingsPanel.tsx
│   └── ProviderConfig.tsx
├── hooks/
│   ├── useWorkspace.ts
│   ├── useChat.ts
│   └── useAIAdapter.ts
├── ai/
│   ├── adapters/
│   │   ├── base.ts
│   │   ├── pi-ai.ts
│   │   └── factory.ts
│   └── registry.ts            # pi-ai registry 封装
└── stores/
    └── workspaceStore.ts      # zustand 状态管理
```

---

## 5. 实现计划

### Phase 1: 项目初始化
1. 初始化 Tauri v2 项目 (`npm create tauri-app@latest`)
2. 配置 `tauri-plugin-sql` (SQLite 支持)
3. 配置前端框架 (React + Vite + TypeScript)
4. 配置 **Tailwind CSS** + **shadcn/ui**
5. 配置 npm workspaces 引用 `ai/pi/packages/*`
6. 设置目录结构

### Phase 2: 数据库层
1. 实现 `config_db.rs` — 全局配置数据库
2. 实现 `workspace_db.rs` — 工作区数据库（创建在 `{workspace_path}/workspace.db`）
3. 实现 workspace commands（创建/切换/删除，验证目录存在）
4. 实现 llm_providers 的 CRUD（含 models_json）

### Phase 3: AI 适配层
1. 定义 `AIAdapter` 接口
2. 实现 `PiAIAdapter` — 封装 pi-ai
3. 实现 `AdapterFactory` — 支持动态切换 Provider
4. 前端 Hook 封装

### Phase 4: 前端 UI
1. 工作区选择器组件（侧边栏）
2. 聊天界面（消息列表 + 输入框）
3. 设置面板（Provider + Model 配置）
4. 状态管理（Zustand）

### Phase 5: 集成与测试
1. 端到端聊天流程
2. 工作区切换
3. Provider/Model 切换

---

## 6. 关键文件

| 文件 | 作用 |
|------|------|
| `ai/pi/packages/ai/src/types.ts` | AI 类型定义 (Model, StreamFunction) |
| `ai/pi/packages/ai/src/api-registry.ts` | Provider 注册表 |
| `ai/pi/packages/ai/package.json` | 包配置 |
| `ai/pi/packages/coding-agent/src/index.ts` | pi-coding-agent SDK 导出 |
| `src-tauri/src/db/config_db.rs` | 全局配置数据库 |
| `src-tauri/src/db/workspace_db.rs` | 工作区数据库 |
| `src-tauri/src/commands/workspace.rs` | 工作区 Tauri Commands |
| `src-tauri/src/commands/llm.rs` | LLM Provider Commands |
| `src/ai/adapters/base.ts` | AI 适配器接口 |
| `src/ai/adapters/pi-ai.ts` | pi-ai 适配器实现 |
| `src/ai/adapters/factory.ts` | 适配器工厂 |

---

## 7. 验证方案

1. **数据库验证**
   - 启动应用后检查 `~/.novel-claw/config.db` 是否创建
   - 创建工作区后检查指定目录下 `workspace.db` 是否创建

2. **工作区目录验证**
   - 创建工作区时选择实际目录
   - 切换工作区后，加载对应目录下的配置和数据

3. **AI 聊天验证**
   - 配置 Provider 和 Model
   - 发送测试消息，验证流式响应

4. **多模型验证**
   - 配置多个 Provider
   - 每个 Provider 下配置多个 Model
   - 切换 Model 时验证不同响应