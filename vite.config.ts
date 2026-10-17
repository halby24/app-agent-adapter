import { defineConfig } from "vite-plus";

export default defineConfig({
  // モノレポ全体のlint/fmt設定。パッケージ固有の設定はoverridesで追加する。
  staged: {
    "*": "vp check --fix",
  },
  lint: {
    // サンプルアプリの型はHutchが生成する`.hutch/devkit`（コミット対象外）に依存する。
    // 生成前でも`vp check`を通すため、アプリ側はアプリ固有の`typecheck`で検査する。
    ignorePatterns: ["apps/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
