---
name: project-architecture
description: 税务可视化报告工具的整体架构、项目结构、开发流程
metadata:
  type: project
---

# 项目架构

## 三层结构

```
report-template/          ← React + Vite + TypeScript 源码（可编辑）
  └─ src/CompleteDashboard.tsx  ← 仪表盘主组件
  └─ vite.config.ts             ← 用 vite-plugin-singlefile 内联打包成单 HTML

report-template/dist/index.html  ← npm run build 产物

根目录 index.html              ← 构建产物的副本，Python 读取为模板
shengc.py                      ← Tkinter GUI 生成器
```

## 数据流

CSV/Excel → shengc.py 读取清洗聚合 → JSON → 注入 index.html → 输出分析报告 HTML → React 渲染

## 开发流程

1. 改 UI：编辑 `report-template/src/CompleteDashboard.tsx`
2. 构建：`cd report-template && npm run build`
3. 替换模板：`cp report-template/dist/index.html index.html`
4. 测试：用 shengc.py 生成报告验证

## 关键约定

- 前端通过 `window.__REPORT_DATA__` 获取 Python 注入的数据
- `vite-plugin-singlefile` 将所有 CSS/JS 内联到单个 HTML
- Python 工具默认从脚本同目录读取 index.html 作为模板
