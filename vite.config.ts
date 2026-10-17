import { defineConfig } from "vite-plus";

export default defineConfig({
  // モノレポ全体のlint/fmt設定。パッケージ固有の設定はoverridesで追加する。
  staged: {
    "*": "vp check --fix",
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
