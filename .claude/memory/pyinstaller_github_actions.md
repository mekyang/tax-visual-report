---
name: pyinstaller-github-actions-packaging
description: PyInstaller + GitHub Actions 多平台打包的经验和踩坑记录
metadata:
  type: feedback
---

# GitHub Actions + PyInstaller 多平台打包

## 适用的项目模式

Python GUI (Tkinter/PyQt) + 前端模板文件 → 单文件 exe

## 关键经验

### 1. 单文件内嵌资源
- PyInstaller `--add-data "template.html;."` 把资源打包进 exe
- 运行时资源在 `sys._MEIPASS`，不是 exe 所在目录
- 必须写路径解析函数区分开发/打包模式：`getattr(sys, 'frozen', False)` 判断

### 2. 跨平台矩阵构建
- Windows: `windows-latest` runner，`--add-data` 用 `;` 分隔
- Linux ARM64: `ubuntu-22.04-arm` runner（GitHub 提供），`--add-data` 用 `:` 分隔
- 不要用 QEMU 模拟，太慢太复杂，直接用 GitHub 原生 ARM runner

### 3. npm ci 跨平台陷阱
- `npm ci` 要求 lock 文件和平台完全一致，ARM64 runner 会因缺少 ARM 原生包而失败
- 跨平台构建用 `npm install` 而非 `npm ci`，让它按平台自动解析

### 4. 工作流触发
- `on: push` + `workflow_dispatch` 兼顾自动和手动
- 产物用 `actions/upload-artifact@v4` 上传，到 Actions 页面下载

### 5. glibc 兼容性（Linux 打包的核心坑）
- `setup-python` 的 Python 随 runner 的 glibc 编译，`ubuntu-22.04` 链 glibc 2.35
- 目标系统（如麒麟 V10）glibc 更低时直接报 `GLIBC_2.35 not found`
- **根本原因：glibc 版本取决于构建环境，不是 Python 版本号，降 Python 版本没用**
- **解决：改用 Miniconda Python**，它在 CentOS glibc 2.17 环境编译，兼容任何现代 Linux
- 验证：`strings 二进制 | grep "GLIBC_" | sort -u` 查看最低要求

### 6. 不要过度设计兼容性
- 用户熟悉自己的目标环境，默认用最新 runner 即可
- 不需要手动指定旧版 Python/旧版依赖，除非明确报错
- 遇到兼容性问题再针对性解决，不要提前优化
