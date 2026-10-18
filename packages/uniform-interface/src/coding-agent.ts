import type { Agent } from "backend-adapter";
import { createAcpxAgent, createPiAgent } from "backend-adapter";
import type { PermissionMode } from "backend-adapter";
import type { HarnessConnection, ProviderConnection } from "./backend-selection.ts";
import { toPiModel } from "./backend-selection.ts";

type CodingExtras = {
  /** セッションの作業ディレクトリ。エージェントはこのディレクトリを基準にファイルを扱う。 */
  readonly cwd: string;

  /**
   * エージェントが要求した操作の扱い。
   *
   * @defaultValue 省略時はバックエンドの既定（`"deny-all"`）。
   */
  readonly permissionMode?: PermissionMode;
};

/**
 * エージェント向けの生成設定。
 *
 * 選んだバックエンドに、作業ディレクトリを指定してファイルを扱わせるための指定を加えたもの。
 * 使うバックエンドは選んだ種類で変わり、利用者側は意識する必要がない。
 *
 * - ハーネス: acpxでエージェントを起動する
 * - プロバイダ: 内蔵のPI Coding Agentを動かす。プロバイダのAPIキーとモデルIDを指定する
 *
 * @remarks
 * プロバイダを選んだ場合、`instructions`を省略したときはPIの既定プロンプトを使う。
 */
export type CodingAgentOptions =
  | (ProviderConnection & CodingExtras)
  | (HarnessConnection & CodingExtras);

/**
 * エージェント向けのエージェントを生成する。
 *
 * @param options - 選んだバックエンドと、作業ディレクトリなどの指定。
 * @returns セッションを生成できるエージェント。
 * @throws `Error` — プロバイダを選んだ場合に、バックエンドが扱わないモデルやプロバイダを指定したとき。
 * @remarks
 * プロバイダを選んだ場合は内蔵のPI Coding Agentを動かすため、バックエンドが扱うモデルである必要がある。
 */
export function createCodingAgent(options: CodingAgentOptions): Agent {
  if (options.kind === "provider") {
    return createPiAgent({
      cwd: options.cwd,
      model: toPiModel(options),
      instructions: options.instructions,
      permissionMode: options.permissionMode,
    });
  }

  return createAcpxAgent({
    agent: options.id,
    cwd: options.cwd,
    model: options.model,
    instructions: options.instructions,
    permissionMode: options.permissionMode,
  });
}
