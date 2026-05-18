---
name: tkinter-pyinstaller-pitfalls
description: Tkinter GUI + PyInstaller 打包时遇到的坑
metadata:
  type: feedback
---

# Tkinter + PyInstaller 常见问题

## 1. Excel 引擎问题
- `xlrd >= 2.0` 不再支持 `.xlsx`，只支持 `.xls`
- pandas `read_excel()` 默认用 xlrd → 遇到 xlsx 就报 `not supported`
- **解决**：显式指定 `engine='openpyxl'`

## 2. Tcl/Tk 对 Unicode 的限制
- Tkinter 的 Text 控件不能处理 BMP 外的 Unicode（如 emoji 📄 U+1F4C4）
- 当 stdout 重定向到 Tkinter Text 时，print 这些字符会导致崩溃
- **解决**：日志中去掉 BMP 外字符，或过滤后再写入 Text 控件

## 3. PyInstaller 路径问题
- 打包后 `__file__` 不可用，需要用 `sys.executable` 定位 exe 目录
- `--add-data` 打包的文件在 `sys._MEIPASS` 临时目录
- 必须封装路径解析函数，开发/打包两种模式走不同路径
