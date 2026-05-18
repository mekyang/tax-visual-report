---
name: github-repo
description: GitHub 仓库地址和 CI/CD 入口
metadata:
  type: reference
---

# GitHub 仓库

- **仓库**: https://github.com/mekyang/tax-visual-report
- **Actions**: https://github.com/mekyang/tax-visual-report/actions
- **触发方式**: push 到 master/main 自动触发，也可手动 workflow_dispatch
- **产物**: 每次构建产出两个 artifact — 税诉通-Windows (exe) 和 税诉通-Linux-ARM64 (二进制)
- **工作流文件**: `.github/workflows/main.yml`
