/**
 * {@link AgentError}が表す失敗の種類。
 *
 * - `session-closed`: 閉じたセッションでターンを送信しようとした。
 * - `session-busy`: 前のターンが完了する前に次のターンを送信しようとした。
 * - `permission-unsupported`: ターン単位の権限指定を扱えないセッションに指定した。
 * - `turn-failed`: エージェントがターンを失敗として終えた。
 */
export type AgentErrorCode =
  | "session-closed"
  | "session-busy"
  | "permission-unsupported"
  | "turn-failed";

/**
 * エージェントの状態に起因する失敗。
 *
 * プロバイダやモデルに起因する失敗は、判別可能な場合はこの型で包まず、
 * そのまま呼び出し元へ伝播する。{@link AgentErrorCode}の`turn-failed`だけは
 * 例外オブジェクトではなく結果として通知される失敗を包むため、
 * `cause`にエージェントが報告した詳細を保持する。
 */
export class AgentError extends Error {
  /** 失敗の種類。 */
  readonly code: AgentErrorCode;

  /**
   * @param code - 失敗の種類。
   * @param message - 利用者向けの説明。
   * @param options - 元の例外などを保持するための標準オプション。
   */
  constructor(code: AgentErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AgentError";
    this.code = code;
  }
}
