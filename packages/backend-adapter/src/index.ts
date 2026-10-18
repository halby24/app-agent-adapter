/**
 * ローカルアプリ向けのAIエージェントアダプタ。
 *
 * 次のエージェントを同じ公開APIで提供する。
 *
 * - ACP互換のコーディングエージェントをacpx経由で動かすエージェント（`{@link createAcpxAgent}`）
 * - 内蔵のPI Coding Agentを動かすエージェント（`{@link createPiAgent}`）
 * - ツールなしのチャット用に固定したPIエージェント（`{@link createPiChatAgent}`）
 *
 * セッションは複数ターンの会話履歴をメモリに保持するが、永続化は行わない。
 *
 * @packageDocumentation
 */
export { createAcpxAgent } from "./acpx-agent.ts";
export { createPiAgent } from "./pi-agent.ts";
export { createPiChatAgent } from "./pi-chat-agent.ts";
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
  FinishReason,
  PiAgentOptions,
  PiChatAgentOptions,
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
