# DeepSeek Harness Desktop 项目目标

## 总目标

把 DeepSeek Harness 包装成一个普通用户安装后即可打开的 Windows/macOS 桌面应用：用户不需要预先安装 Node.js、pnpm 或执行命令；应用启动后自动运行上游 `dsh web`，在桌面窗口中显示原生 Harness Web UI，并保留上游的调用方式、插件架构、会话能力和工作区能力。

## 已确定的技术路线

1. 使用 Electron 作为跨平台桌面壳，因为它自带 Node.js 运行时，能够直接承载当前以 Node.js 为前提的 Harness CLI。
2. 不修改 DeepSeek Harness 主代码。桌面端通过子进程原样执行 `@deepseek-ai/dsh` 的 `web` 命令，只注入端口、`DSH_HOME` 和工作目录。
3. 使用本机回环地址和临时空闲端口，避免端口冲突，也不把具备本地文件/命令能力的 Harness 暴露到局域网。
4. 将 `DSH_HOME` 映射到 Electron 的用户数据目录；工作区默认为 Documents 下的 `DeepSeek Harness Workspace`，用户可从菜单切换。
5. 以 DeepSeek 官方发布的精确版本 `@deepseek-ai/dsh` npm 包作为唯一 Harness 运行时来源；项目不下载、不保留上游源码 checkout，并提供 npm 版本同步脚本和漂移检查。
6. 桌面版本更新与 Harness 版本更新分层：npm 发布新运行时后由同步脚本更新依赖闭包并递增桌面 patch 版本；GitHub Actions 生成并发布新的桌面包，已安装应用通过对应平台的更新渠道获取新 Release。

## 面向小白的体验要求

- 双击应用后自动启动，不显示终端窗口，不要求配置 PATH。
- 启动页能说明当前状态；失败时给出“重新启动”“选择工作区”“打开日志”三个可理解的动作。
- Harness 正式界面保持上游原样，API Key 等模型配置在 Harness 的设置界面完成。
- 会话、设置、凭证和附件在本机持久化；退出后再次打开可以继续使用。
- 外部网页在系统浏览器中打开；本地 Harness 服务只监听 `127.0.0.1`。

## 验收完成条件

### 源码与方案

- [x] 项目设计阶段已阅读上游 README、AGENTS.md、CLI、Web bundle、Web server、profile/home path 和持久化相关入口；理解完成后不在项目中保留源码副本。
- [x] 已确认原始启动命令为 `dsh web`，默认 Web UI 为本地 HTTP 服务，Node.js 是主要用户门槛。
- [x] 已形成“Electron + 内置 Node + 原样 dsh 子进程 + 本地 WebView”的方案，并在 `AGENTS.md` 固化边界。

### 本地可运行 MVP

- [x] `pnpm install` 可以安装桌面壳和精确版本的 Harness 运行时。
- [x] `pnpm dev` 会打开桌面窗口，自动创建工作区与 Harness 数据目录，并启动上游 Web UI。
- [x] 启动进程使用 `dsh web --port <free-port>`，Windows 额外使用上游支持的 `--patch` 适配目录选择器，而不是替换或复制 Harness 的调用协议。
- [x] 启动失败时能重试、选择工作区、打开日志；正常启动后进入上游 Web UI。
- [x] `pnpm verify` 与 `pnpm test` 通过，且至少完成一次真实本机启动冒烟验证。

### 跨平台交付

- [x] 已提供 `pnpm dist:mac`、`pnpm dist:win` 和 `pnpm dist:dir` 构建入口；Windows 发布目标为可直接解压的 ZIP，不生成安装器。
- [x] 已在 macOS 上生成并验证 macOS ARM64 DMG/ZIP 和未安装 App；macOS x64 DMG/ZIP 也已生成，并使用打包内置 Electron Node 运行时真实启动 `dsh web`。
- [x] 已从当前 macOS 工作区生成 Windows x64/arm64 未安装目录，确认 electron-builder 能带入 Harness 运行时；Windows 真机上的 UI、PowerShell 和原生子进程仍需在 Windows CI/机器上完成最终验证。
- [ ] 在 Windows CI/机器上生成并验证 Windows x64/arm64 ZIP、PowerShell 工具调用、应用图标和工作区目录选择。
- [ ] 正式发布前配置代码签名、公证、GitHub Release 仓库和更新凭据；macOS 自动更新代码已接入，Windows ZIP 使用应用内明确的手动替换提示。当前工作区没有发行者证书或远程仓库，不能伪造线上更新成功证据。

### Harness 运行时更新

- [x] `package.json` 使用精确版本记录完整 Harness npm 运行时闭包，不依赖源码提交或额外 manifest。
- [x] `pnpm check:harness` 能检测本地精确版本是否落后于 npm Registry 的已发布版本。
- [x] `pnpm sync:harness` 能将所有显式 Harness 运行时包更新到同一 npm 版本并递增桌面 patch 版本。
- [x] 项目验证会拒绝出现 `upstream` 源码目录；生产包边界验证同时确认 Harness npm 运行时存在。
- [x] 已接入 `electron-updater`、动态 GitHub Release 配置、npm 运行时定时同步 workflow 和 tag 发布 workflow。
- [ ] 在真实 GitHub 仓库完成一次签名 Release，并在已安装旧版本上验证下载、重启安装和失败回滚；这需要远程仓库和发行凭据。

## 最近一次本地验证记录（2026-08-16）

- `pnpm install --frozen-lockfile`、`pnpm verify`、`pnpm test`、`pnpm smoke:harness` 和 `pnpm check:harness` 已通过；后者只检查 npm 已发布运行时，不读取或下载源码。
- `pnpm dist:mac` 已生成 macOS ARM64 DMG/ZIP；`pnpm dist:mac:x64` 已生成 macOS x64 DMG/ZIP；Windows 目标已改为独立命名的 x64/ARM64 可解压 ZIP，压缩包内部保留应用运行所需的 EXE。两个 macOS 架构的打包内置 Harness 运行时均真实启动了 `dsh web` 并返回 HTTP 200。
- 开发模式以及打包 macOS ARM64/x64 App 的窗口启动链路均已实际验证：应用打开后自动启动真实 `dsh web`，本地页面返回 HTTP 200；Windows CI 配置已加入相同的最终包启动检查，Windows ARM64 则做包边界验证。
- `pnpm verify:bundle` 已分别验证 macOS ARM64、macOS x64、Windows x64 和 Windows ARM64 未安装目录：开发脚本、测试和构建配置均未打包，`@deepseek-ai/dsh`、PowerShell/sandbox 运行时、四架构 `sharp`/`koffi` 原生模块与 `electron-updater` 均存在。
- 发布配置已验证：仅当构建环境提供 `GITHUB_REPOSITORY` 时启用 GitHub publisher；正式 macOS 包由 `electron-updater` 自动检查，Windows ZIP 明确走手动替换流程，`--publish never` 的本地包不会误连发布渠道。
- Release workflow 已按平台隔离 macOS/Windows 签名凭据，串行发布 macOS ARM64/x64、Windows x64/ARM64 资产以避免同一 GitHub Release 资产竞争，并在 `RELEASE_BUILD=true` 且凭据缺失时 fail closed。
- 尚未虚构 Windows 真机运行、签名/公证或在线升级回滚结果；这些仍是发布前必须在对应平台和真实 Release 上完成的验收项。

## 当前结论

本工作区交付的是可运行的桌面封装、跨平台构建入口、Windows/macOS CI、npm 运行时同步 workflow 和可接入 GitHub Release 的更新实现。工作区不保留 Harness 源码，开发运行使用 `pnpm dev`；当前 macOS 可直接使用 `dist/DeepSeek-Harness-0.1.0-mac-arm64.dmg` 或 `dist/DeepSeek-Harness-0.1.0-mac-x64.dmg`。API Key、模型选择和工作区内容属于用户本机数据，不应写入仓库或构建产物。
