import { defineConfig } from "vite-plus";

export default defineConfig({
  // lint/fmtはルートのvite.config.tsが担当する。
  pack: {
    dts: {
      generator: "tsgo",
    },
    exports: true,
  },
});
