import type { AcpxPermissionMode, Agent } from "backend-adapter";
import { createAcpxAgent } from "backend-adapter";
import type { HarnessChoice } from "provider-management";

/**
 * エージェント向けの生成設定。
 *
 * 選んだバックエンドに、作業ディレクトリを指定してファイルを扱わせるための指定を加えたもの。
 */
export type CodingAgentOptions = HarnessChoice & {
  /** セッションの作業ディレクトリ。エージェントはこのディレクトリを基準にファイルを扱う。 */
  readonly cwd: string;

  /**
   * セッションで使うモデル。
   *
   * エージェントが受け付けるモデルID（`"gpt-5.4"`など）を指定する。
   *
   * @defaultValue 省略時はエージェントが選ぶ既定のモデル。
   */
  readonly model?: string;

  /**
   * すべてのセッションに適用するシステム指示。
   *
   * @defaultValue 省略時はシステム指示を送信しない。
   */
  readonly instructions?: string;

  /**
   * エージェントが要求した操作の扱い。
   *
   * @defaultValue 省略時はバックエンドの既定（acpxは`"deny-all"`）。
   * @remarks
   * ファイルの書き込みやコマンド実行を許すには`"approve-all"`などを明示する。
   */
  readonly permissionMode?: AcpxPermissionMode;
};

/**
 * エージェント向けのエージェントを生成する。
 *
 * @param options - 選んだバックエンドと、作業ディレクトリなどの指定。
 * @returns セッションを生成できるエージェント。
 * @remarks
 * 現時点で対応するのはハーネスだけ。プロバイダを選んだ場合のエージェント（tool useあり）は
 * 未対応で、{@link CodingAgentOptions}にも含めていない。
 */
export function createCodingAgent(options: CodingAgentOptions): Agent {
  return createAcpxAgent({
    agent: options.id,
    cwd: options.cwd,
    model: options.model,
    instructions: options.instructions,
    permissionMode: options.permissionMode,
  });
}
