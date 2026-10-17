import { createAgentRegistry } from "acpx/agent-registry";
import { HARNESS_IDS } from "./catalog.ts";

/**
 * ハーネスが利用できるかどうかの検出結果。
 *
 * - `installed`: 実行に必要なものが見つかった。
 * - `missing`: 実行に必要なもの（実行ファイルやパッケージ）が見つからない。
 * - `unknown`: acpxがこの方法では検出しない。実行のたびに取得するタイプなどが該当する。
 */
export type AcpxHarnessStatus = "installed" | "missing" | "unknown";

/**
 * ハーネスの検出結果。
 */
export interface AcpxHarness {
  /** acpxの組み込み名。{@link listAgentOptions}のハーネスのIDと同じ。 */
  readonly id: string;

  /** acpxが定義する表示名（`"Claude Code"`など）。名前がない場合はIDと同じ。 */
  readonly name: string;

  /** 利用できるかどうか。 */
  readonly status: AcpxHarnessStatus;
}

/**
 * 一覧にあるハーネスが利用できるかを検出する。
 *
 * @returns 一覧にあるすべてのハーネスの検出結果。
 * @remarks
 * 実行ファイルが`PATH`にあるか（npxなどで都度取得するものはローカルにパッケージがあるか）を
 * 見るだけで、エージェントは起動しない。認証済みかどうかまでは分からないため、実際に
 * 使えるかどうかはセッションの生成で確かめる必要がある。
 */
export function listAcpxHarnesses(): readonly AcpxHarness[] {
  const registry = createAgentRegistry();
  return HARNESS_IDS.map((id) => {
    const inspection = registry.inspect(id);
    if (inspection === undefined) {
      return { id, name: id, status: "unknown" };
    }
    return {
      id,
      name: inspection.name,
      status: inspection.launch.kind === "installed" ? "installed" : "missing",
    };
  });
}
