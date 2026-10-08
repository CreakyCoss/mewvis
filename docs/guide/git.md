# Git 仓库与上游同步

Mewvis 主仓库位于 [CreakyCoss/mewvis](https://github.com/CreakyCoss/mewvis)。`main` 是文档站的发布分支；文档变更合并后由 GitHub Actions 自动构建。

## 获取仓库与远程配置

```sh
git clone https://github.com/CreakyCoss/mewvis.git
cd mewvis
git remote -v
```

| 名称         | 地址                                       | 用途                       |
| ------------ | ------------------------------------------ | -------------------------- |
| `origin`     | `https://github.com/CreakyCoss/mewvis.git` | 直接克隆主仓库时的默认远程 |
| `pi`（可选） | `https://github.com/earendil-works/pi.git` | 更新 `ai/pi` 的上游源码    |

远程名称与地址保存在各自检出的 `.git/config` 中，不随源码提交。旧 Gitee 地址 `https://gitee.com/creaky/isle.git` 不再作为项目的默认远程；已有检出若仍将它设为 `origin`，可改为：

```sh
git remote set-url origin https://github.com/CreakyCoss/mewvis.git
```

从个人 fork 开发时，`origin` 应指向自己的 fork，并可将 Mewvis 主仓库添加为 `upstream`。此时向 `origin` 推送个人分支，再向主仓库提交 Pull Request。

## 日常开发

在独立分支完成修改，再合并到主仓库：

```sh
git fetch origin
git switch -c feature/my-change origin/main
git status
git diff
git add <修改的文件>
git commit -m "说明这次修改"
git push -u origin feature/my-change
```

检查内容后提交 Pull Request。文档修改需运行 `pnpm docs:check` 和 `pnpm docs:site:build`；涉及功能时运行对应模块检查。推送的分支名应与当前开发分支一致。

## 更新 Pi 上游源码

`ai/pi` 通过 Git Subtree 纳入本仓库，普通 clone 已包含其源码，不需要初始化 submodule，也不需要在该目录创建独立 `.git`。

更新前先提交当前工作，并在独立分支执行：

```sh
git subtree pull --prefix=ai/pi https://github.com/earendil-works/pi.git main --squash
pnpm install
pnpm build:ai
```

上游 `main` 的更新会作为压缩提交合并到 `ai/pi`。本仓库对上游源码有适配改动，冲突需逐项处理；合并后核对 Runtime 的依赖、模型协议和插件能力，并运行相关测试。插件兼容基准的维护方法见 [Pi 兼容基准与协议规格](../extensions/pi-compatibility.md)。

不要在已包含 `ai/pi` 的检出中重复执行 `git subtree add`。日常修改随 Mewvis 仓库提交；需要向 Pi 项目贡献时，先在自己的 Pi fork 整理改动，再向上游提交 Pull Request。
