# GitHub 发布与安装

LifeOS 的源码仓库根目录保留 `manifest.json`、`versions.json`、`README.md`；编译产物通过 GitHub Release 分发，不需要提交到源码仓库。

## 用户安装：BRAT

发布第一个 GitHub Release 后：

1. 在 Obsidian 设置 → 社区插件中安装并启用 **BRAT**。
2. 在 BRAT 设置中选择 **Add Beta plugin**，输入 `https://github.com/Baixiaomo0716/ObsidianLifeOS`。
3. 选择对应版本或最新版本，添加插件，然后启用 **LifeOS**。
4. 通过命令面板搜索 LifeOS 打开工作台。

后续更新请在 BRAT 中跟踪最新版本（Latest），并执行检查更新；如果固定选择了某个版本标签，需先修改跟踪版本。仅推送源码不会产生可下载更新，必须等待新版本 Release 及安装附件发布完成。更新后在 Obsidian 中关闭再启用 LifeOS，或重启应用，以加载新代码。

使用 BRAT 1.1.0 或以上。当前 Release 标记为开发预览；BRAT 可以安装预发布版本。最低 Obsidian 版本以该 Release 的 `manifest.json` 为准，当前为 1.13.4。

目前还未提交 Obsidian 社区目录审核，因此不能通过搜索 LifeOS 直接安装。

## 用户安装：下载 ZIP

从 [GitHub Releases](https://github.com/Baixiaomo0716/ObsidianLifeOS/releases) 页面下载 `life-os.zip`（不是源码 ZIP），解压后把 `life-os` 文件夹放到目标库的 `.obsidian/plugins/`，启用 LifeOS。ZIP 内只包含 `main.js`、`manifest.json`、`styles.css`。

## 维护者发布

1. 把项目上传到自己的 GitHub 仓库，并启用 GitHub Actions。保留现有 Gitee 远程，需要时另外添加 GitHub 远程。
2. 保持 `package.json` 和 `manifest.json` 中的版本一致，在 `versions.json` 增加该版本与最低 Obsidian 版本的映射。
3. 提交变更，把版本标签推送到 GitHub。首次标签为 `0.1.1`，**不加 `v` 前缀**；后续每个新版本使用新标签，不复用已发布的标签。
4. `.github/workflows/release.yml` 自动安装依赖、执行 `pnpm check`、核对版本及标签、生成三份插件文件、安装 ZIP 和 SHA-256 摘要，再创建预发布 Release。
5. Actions 全部成功且 Release 附件齐全后，用户才可以通过 BRAT 安装。

已有标签需要重新运行时，可在 GitHub Actions → Release Obsidian plugin → Run workflow 中填写该标签（例如 `0.1.1`）。工作流按该标签检出并校验源码，无需删除或移动标签。发布成功后不要重复创建同一版本。

发布附件：

```text
GitHub Release: 0.1.2
├── main.js
├── manifest.json
├── styles.css
├── life-os.zip
└── SHA256SUMS.txt
```

三份插件文件必须作为独立附件上传；只上传 ZIP 无法满足 Obsidian/BRAT 的安装要求。

本地预览发布文件：执行 `pnpm build`、`pnpm verify`、`pnpm release:prepare`。文件生成在 `releases/github/life-os/`，不上传开发库、个人笔记、本地配置或依赖目录。该命令不创建远程 Release。

当前工作流使用开发预览 Release。以后申请社区目录时，需补齐合适的许可证及官方要求，并发布正式 Release。

参考：[Obsidian 官方发布要求](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)、[BRAT 开发者说明](https://github.com/TfTHacker/obsidian42-brat/blob/main/BRAT-DEVELOPER-GUIDE.md)。
