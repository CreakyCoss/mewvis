# 项目结构说明

## 目录结构

```
isle/
├── claw/          # 你的代码
├── ai/            # 外部依赖
│   └── pi/        # 来自 https://github.com/earendil-works/pi.git
├── docs/          # 文档
└── .git/          # 项目 Git 仓库
```

## Git 仓库说明

本项目使用 **Git Subtree** 方式管理 `ai/pi` 目录，将上游仓库完全合并到本仓库中。

### 远程仓库

- `origin` → 你的仓库（https://gitee.com/creaky/isle.git）
- 上游 pi → https://github.com/earendil-works/pi.git

详细操作说明请查看 [docs/git.md](git.md)

---

## 快速操作

| 操作 | 命令 |
|------|------|
| 拉取上游 pi | `make pull-pi` |
| 推送代码 | `make push` |
| 查看状态 | `make status` |
| 查看日志 | `make log` |

---

## 注意事项

- `ai/pi` 目录内没有嵌套的 `.git`，它是本仓库的一部分
- 团队成员 clone 后会直接获得完整的 `ai/pi` 代码
