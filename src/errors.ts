/**
 * {@link AgentError}が表す失敗の種類。
 *
 * - `session-closed`: 閉じたセッションでターンを送信しようとした。
 * - `session-busy`: 前のターンが完了する前に次のターンを送信しようとした。
 * - `turn-unfinished`: ツール承認待ちなど、アダプタが扱わない入力待ちでターンが終わった。
 * - `option-unsupported`: 使用中のバックエンドが対応しない設定を渡した。
 * - `invalid-stream-part`: バックエンドの出力イベントが想定した形を満たしていない。
 */
export type AgentErrorCode =
  | "session-closed"
  | "session-busy"
  | "turn-unfinished"
  | "option-unsupported"
  | "invalid-stream-part";

/**
 * エージェントの状態に起因する失敗。
 *
 * プロバイダやモデルに起因する失敗はこの型で包まず、そのまま呼び出し元へ伝播する。
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
