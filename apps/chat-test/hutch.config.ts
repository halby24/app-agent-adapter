/**
 * Hutchのプロジェクト設定。
 *
 * Electrobunのリリースは`electrobun`パッケージ（devDependencies）が指定する
 * ペア既定に任せ、ここではタスクだけを定義する。依存はリポジトリ全体の
 * pnpm workspaceで解決するため、Hutchの内蔵リゾルバではなくpnpmに委ねる。
 */
export default {
  packageManager: "pnpm",
  scripts: {
    dev: ["hutch", "electrobun", "dev", "--watch"],
    bundle: ["hutch", "electrobun", "build", "--env=stable"],
  },
};
