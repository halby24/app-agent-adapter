/**
 * ローカルアプリ向けのAIエージェントアダプタ。
 *
 * 次の2種類のエージェントを同じ公開APIで提供する。
 *
 * - 言語モデルを直接呼び出すエージェント（`{@link createModelAgent}`）
 * - ACP互換のコーディングエージェントをacpx経由で動かすエージェント（`{@link createAcpxAgent}`）
 *
 * セッションは複数ターンの会話履歴をメモリに保持するが、永続化は行わない。
 *
 * @packageDocumentation
 */
export { createAcpxAgent } from "./acpx-agent.ts";
export { createModelAgent } from "./model-agent.ts";
export { createPiAgent } from "./pi-agent.ts";
export { listPiModels } from "./pi-models.ts";
export { AgentError } from "./errors.ts";
export type { AgentErrorCode } from "./errors.ts";
export type {
  AcpxAgent,
  AcpxAgentOptions,
  AcpxPermissionMode,
  AcpxSessionOptions,
  Agent,
  AgentEvent,
  AgentSession,
  AgentUsage,
  FinishEvent,
  ModelAgentOptions,
  PiAgentOptions,
  PiModel,
  PiModelSelection,
  PiModelsOptions,
  ReasoningDeltaEvent,
  SendOptions,
  SessionOptions,
  TextDeltaEvent,
  ToolCallEvent,
  ToolCallUpdateEvent,
  ToolKind,
  ToolResultEvent,
} from "./types.ts";
