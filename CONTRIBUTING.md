# Contributing / 参与贡献

## 中文

感谢你参与 DeepSeek Harness Desktop。

1. 提交 Issue 前请先搜索是否已有相同问题。
2. 修改应集中在桌面封装、构建、发布或跨平台适配层；Harness 本身的问题请反馈到上游项目。
3. 不要提交 API Key、用户数据、日志、`node_modules` 或构建产物。
4. 提交 Pull Request 前运行：

   ```sh
   pnpm install --frozen-lockfile
   pnpm verify
   pnpm test
   pnpm smoke:harness
   ```

5. 涉及打包时还应运行对应平台构建和 `pnpm verify:bundle`。不能在 macOS 上声称已完成 Windows 真机验证。

## English

Thank you for contributing to DeepSeek Harness Desktop.

1. Search existing issues before opening a new one.
2. Keep changes in the desktop wrapper, packaging, release, or cross-platform adaptation layers. Report Harness product issues to the upstream project.
3. Never commit API keys, user data, logs, `node_modules`, or build artifacts.
4. Before opening a pull request, run:

   ```sh
   pnpm install --frozen-lockfile
   pnpm verify
   pnpm test
   pnpm smoke:harness
   ```

5. Packaging changes also require a target-platform build and `pnpm verify:bundle`. Do not claim Windows runtime validation from macOS.
