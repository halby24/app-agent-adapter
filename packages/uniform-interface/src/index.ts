/**
 * エージェントのバックエンドを統一インターフェースで扱う。
 *
 * プロバイダ（AI SDKの言語モデル）とハーネス（ACP互換のコーディングエージェント）を
 * {@link listAgentOptions}で事前に列挙し、利用者が選んだものを{@link createAgent}で
 * エージェントに変換する。生成後の{@link Agent}と{@link AgentSession}の扱いは
 * 選択したバックエンドによらず同じで、型は`backend-adapter`が定義する。
 *
 * @packageDocumentation
 */
export { findAgentOption, listAgentOptions } from "./catalog.ts";
export type { AgentOption, AgentOptionKind, HarnessOption, ProviderOption } from "./catalog.ts";
export { createAgent } from "./selection.ts";
export type { AgentSelection, HarnessSelection, ProviderSelection } from "./selection.ts";
export { AgentError } from "backend-adapter";
export type { AgentErrorCode } from "backend-adapter";
export type {
  AcpxPermissionMode,
  Agent,
  AgentEvent,
  AgentSession,
  AgentUsage,
  FinishEvent,
  SendOptions,
  SessionOptions,
  TextDeltaEvent,
} from "backend-adapter";
