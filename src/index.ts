/**
 * ローカルアプリ向けのAIエージェントアダプタ。
 *
 * 言語モデルを直接呼び出すエージェントを提供する。セッションは複数ターンの会話履歴を
 * メモリに保持するが、永続化は行わない。ツール利用にはまだ対応していない。
 *
 * @packageDocumentation
 */
export { createAgent } from "./agent.ts";
export { AgentError } from "./errors.ts";
export type { AgentErrorCode } from "./errors.ts";
export type {
  Agent,
  AgentEvent,
  AgentOptions,
  AgentSession,
  FinishEvent,
  SendOptions,
  SessionOptions,
  TextDeltaEvent,
} from "./types.ts";
