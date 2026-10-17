/**
 * 選んだバックエンドを統一インターフェースのエージェントとして扱う。
 *
 * バックエンドの選択（どのプロバイダやハーネスを、どのモデルで使うか）は
 * `provider-management`が扱う。このパッケージは、その選択を{@link createAgent}で
 * バックエンド方式によらない{@link Agent}に変換し、生成後の{@link AgentSession}の
 * 扱いを共通にする。{@link Agent}と{@link AgentSession}の型は`backend-adapter`が定義する。
 *
 * @packageDocumentation
 */
export { createAgent } from "./create-agent.ts";
export { AgentError } from "backend-adapter";
export type { AgentErrorCode } from "backend-adapter";
export type {
  Agent,
  AgentEvent,
  AgentSession,
  AgentUsage,
  FinishEvent,
  SendOptions,
  SessionOptions,
  TextDeltaEvent,
} from "backend-adapter";
