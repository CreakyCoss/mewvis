# Git 仓库说明

## 仓库配置

| 远程仓库 | 地址 | 用途 |
|---------|------|------|
| `origin` | http://zhw:zhw89757.@localhost:9080/zhw/novel-claw.git | 你的主仓库 |
| 上游 pi | https://github.com/earendil-works/pi.git | 外部依赖仓库 |

---

## 远程仓库操作

### 查看远程仓库
```bash
git remote -v
```

### 添加新的远程仓库
```bash
git remote add <name> <url>
```

### 删除远程仓库
```bash
git remote remove <name>
```

---

## Subtree 操作（ai/pi）

本项目使用 **Git Subtree** 将 `ai/pi` 完全合并到本仓库中。

### 添加新的外部依赖

```bash
git subtree add --prefix=<本地路径> <上游仓库URL> <分支> --squash
```

示例：
```bash
git subtree add --prefix=ai/pi https://github.com/earendil-works/pi.git main --squash
```

### 拉取上游更新

```bash
git subtree pull --prefix=<本地路径> <上游仓库URL> <分支> --squash
```

示例：
```bash
git subtree pull --prefix=ai/pi https://github.com/earendil-works/pi.git main --squash
```

### 推送 subtree 到上游（谨慎使用）

```bash
git subtree push --prefix=<本地路径> <上游仓库URL> <分支> --squash
```

---

## 日常开发流程

### 提交代码
```bash
git add .
git commit -m "提交说明"
git push origin main
```

### 查看状态
```bash
git status
git log --oneline -5
```

### 撤销未提交的修改
```bash
git restore .
```

### 丢弃本地所有修改（谨慎）
```bash
git reset --hard origin/main
```

---

## 分支操作

### 查看分支
```bash
git branch -a
```

### 创建新分支
```bash
git checkout -b <分支名>
```

### 切换分支
```bash
git checkout <分支名>
```

### 合并分支
```bash
git checkout main
git merge <分支名>
```

---

## 注意事项

1. **不要删除 `ai/pi/.git` 之外的上游 .git 文件夹** - subtree 已完全合并
2. **拉取上游更新时使用 `--squash`** - 将所有修改合并为一个 commit
3. **推送前先 pull** - 避免冲突
4. **团队成员 clone 后无需额外操作** - 直接获得完整代码