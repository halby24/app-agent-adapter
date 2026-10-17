/**
 * ローカルアプリ向けのAIエージェントアダプタ。
 *
 * 次の2種類のエージェントを同じ公開APIで提供する。
 *
 * - 言語モデルを直接呼び出すエージェント（`{@link createModelAgent}`）
 * - 既存のコーディングエージェントをHarnessAgent経由で動かすエージェント（`{@link createHarnessAgent}`）
 *
 * セッションは複数ターンの会話履歴をメモリに保持するが、永続化は行わない。
 *
 * @packageDocumentation
 */
export { createHarnessAgent } from "./harness-agent.ts";
export { createModelAgent } from "./model-agent.ts";
export { AgentError } from "./errors.ts";
export type { AgentErrorCode } from "./errors.ts";
export type {
  Agent,
  AgentEvent,
  AgentSession,
  AgentUsage,
  FinishEvent,
  HarnessAgentLike,
  HarnessAgentOptions,
  HarnessSandboxSession,
  HarnessSessionLike,
  ModelAgentOptions,
  SendOptions,
  SessionOptions,
  TextDeltaEvent,
} from "./types.ts";
