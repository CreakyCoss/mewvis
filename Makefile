.PHONY: help

help: ## 显示帮助
	@echo "可用命令:"
	@echo "  make pull-pi       - 拉取上游 pi 最新代码"
	@echo "  make push          - 推送代码到远程仓库"
	@echo "  make status        - 查看 Git 状态"
	@echo "  make log           - 查看最近提交记录"

## 拉取上游 pi 最新代码
pull-pi:
	git subtree pull --prefix=ai/pi https://github.com/earendil-works/pi.git main --squash

## 推送代码到远程仓库
push:
	git push origin main

## 查看 Git 状态
status:
	git status

## 查看最近提交记录
log:
	git log --oneline -10

## 添加新的外部依赖（用法: make add-subtree PREFIX=ai/xxx URL=https://github.com/xxx/xxx.git BRANCH=main）
add-subtree:
	git subtree add --prefix=$(PREFIX) $(URL) $(BRANCH) --squash