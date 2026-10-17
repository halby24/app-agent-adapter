import type { ElectrobunConfig } from "electrobun";

/**
 * Electrobunのビルド設定。
 *
 * チャットのバックエンドはacpx、PI Coding Agent、AI SDKなどNode寄りの依存を
 * 使うため、メインプロセスはCottontailではなくBunで動かす。ソースの実行と
 * バンドルはHutchが行い、バンドルに含めきれない依存は`external`で実行時に
 * node_modulesから読む。
 */
export default {
  app: {
    name: "Chat Test",
    identifier: "dev.halby.app-agent-adapter.chat-test",
    version: "0.0.0",
  },
  build: {
    mainProcess: "bun",
    bun: {
      entrypoint: "src/bun/index.ts",
      // バックエンドはacpx、PI Coding Agent、AI SDKなど動的読み込みを含むNode向けの
      // 依存を抱えるため、バンドルせず実行時にワークスペースのnode_modulesから解決する。
      external: ["provider-management", "uniform-interface"],
    },
    views: {
      mainview: {
        entrypoint: "src/mainview/index.ts",
      },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/mainview/index.css": "views/mainview/index.css",
    },
  },
} satisfies ElectrobunConfig;
