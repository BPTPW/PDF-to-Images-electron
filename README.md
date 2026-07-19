# PDF 转图片

本地 Electron 应用：拖入或选择一个 PDF，按页输出到源文件同名目录。默认导出 PNG、300 DPI。

## 调试与构建

```powershell
npm start
```

首次在新机器上运行时，先执行 `npm install`。常用命令如下：

```powershell
# 启动调试窗口
npm start

# 运行静态类型与单元测试
npm run typecheck
npm test

# 生成可分发的 Windows 应用目录
npm run package
```

`npm run package` 成功后，产物位于 `out/pdf-to-images-win32-x64/`，可直接运行其中的 `pdf-to-images.exe`。首次运行或打包时 Electron 会下载对应运行时；网络受限时需配置可访问 GitHub Releases 的网络环境后重试。

## 内置 Poppler 与许可证

Windows x64 所需的 Poppler `26.02.0` 已随项目放在 `resources/poppler/win32-x64/`；开发和发布均自动使用该版本，无需设置系统 `PATH`。所需 CJK 字符映射与许可证文件在 `resources/poppler/share/poppler/`。Poppler 由 [oschwartz10612/poppler-windows](https://github.com/oschwartz10612/poppler-windows) 的 `v26.02.0-0` 发行包提供；发布产品时须遵循其中的 GPL 许可证与来源提供义务。其他平台发布前需要补充对应的 `resources/poppler/<platform>-<arch>/` 二进制文件。

导出命名按页数确定补零宽度：总页数不超过 10 时为 `1.png`，不超过 100 时为 `01.png`，不超过 1000 时为 `001.png`。
