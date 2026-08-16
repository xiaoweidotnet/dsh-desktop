# DeepSeek Harness Desktop 发布手册

本项目只依赖已发布的 `@deepseek-ai/dsh` npm 运行时。开发工作区和生产包都不下载、不保留 DeepSeek Harness 源码 checkout。

## 第一次配置

把本项目放入一个 GitHub 仓库，并在仓库的 Actions secrets 中配置：

### macOS

- `MAC_CERTIFICATE_BASE64`：Developer ID Application 证书的 base64 内容
- `MAC_CERTIFICATE_PASSWORD`：证书密码
- `APPLE_ID`：Apple Developer 账号
- `APPLE_APP_SPECIFIC_PASSWORD`：用于公证的 app-specific password
- `APPLE_TEAM_ID`：Apple Team ID

### Windows

- `WINDOWS_CERTIFICATE_BASE64`：代码签名 PFX 证书的 base64 内容
- `WINDOWS_CERTIFICATE_PASSWORD`：PFX 密码

证书、密码和 API Key 不得提交到仓库。Release workflow 会在缺少对应凭据时直接失败，不发布未签名的正式包。

## 发布流程

1. 合并 `.github/workflows/harness-runtime-sync.yml` 生成的运行时更新 PR。
2. 确认 `pnpm check:harness`、`pnpm verify` 和 `pnpm test` 通过。
3. 把桌面版本递增到新的稳定版本，例如 `0.1.1`。
4. 创建并推送 tag：

   ```sh
   git tag v0.1.1
   git push origin v0.1.1
   ```

5. `release.yml` 会依次构建并发布：
   - macOS ARM64 DMG/ZIP
   - macOS x64 DMG/ZIP
   - Windows x64 可解压 ZIP
   - Windows ARM64 可解压 ZIP

正式发布前必须在 Windows 机器上解压 x64/ARM64 对应 ZIP，双击 `DeepSeek Harness.exe` 启动 Harness，并验证 PowerShell 工具和应用内工作区选择；macOS 两个架构还要确认 Gatekeeper 和公证状态正常。

## 更新链路

`harness-runtime-sync.yml` 每周只检查 npm Registry 上已发布的 `@deepseek-ai/dsh` 版本。发现变化后，它会更新精确依赖闭包、递增桌面 patch 版本并创建 PR，全程不下载 Harness 源码。合并后推送新 tag，Release workflow 生成新的签名桌面包。macOS 已安装应用通过 `electron-updater` 检查 GitHub Release，下载并在用户确认后重启安装；Windows 使用便携 ZIP，不调用 NSIS/EXE 安装器，应用内会提示用户下载最新版 ZIP、退出旧版本并解压到新目录。

已安装的旧版本不会直接执行 Git、pnpm 或 Node.js，也不会自行修改本地 Harness 源码。更新来自新的完整桌面包；Windows 更新时工作区和设置仍保存在用户数据目录，不会因替换应用目录而丢失。

## 本地验证

本地 `--publish never` 构建故意不连接更新渠道，也没有发行签名。可以验证包边界和运行时，但不能替代真实 Release 验收：

```sh
pnpm verify
pnpm test
pnpm smoke:harness
pnpm dist:dir
pnpm verify:bundle
```
