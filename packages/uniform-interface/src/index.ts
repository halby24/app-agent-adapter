/**
 * 選んだバックエンドを統一インターフェースのエージェントとして扱う。
 *
 * どのバックエンドを選ぶかは`provider-management`が扱い、このパッケージは
 * 選ばれたバックエンド（`provider-management`の`AgentChoice`）を、用途に合わせて
 * 次の2つの入口でバックエンド方式によらない{@link Agent}に変換する。
 *
 * - {@link createChatAgent}: ファイルを扱わず、ツールも使わないチャット用
 * - {@link createCodingAgent}: 作業ディレクトリを指定し、ファイルを扱わせるエージェント向け
 *
 * {@link Agent}と{@link AgentSession}の型は`backend-adapter`が定義する。
 *
 * @packageDocumentation
 */
export { createChatAgent } from "./chat-agent.ts";
export type { ChatAgentOptions } from "./chat-agent.ts";
export { createCodingAgent } from "./coding-agent.ts";
export type { CodingAgentOptions } from "./coding-agent.ts";
export { AgentError } from "backend-adapter";
export type { AgentErrorCode } from "backend-adapter";
export type {
  Agent,
  AgentEvent,
  AgentSession,
  AgentUsage,
  FinishEvent,
  FinishReason,
  PermissionMode,
  SendOptions,
  SessionOptions,
  TextDeltaEvent,
} from "backend-adapter";
