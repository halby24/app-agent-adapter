import type { Agent, AgentOptions, AgentSession, SessionOptions } from "./types.ts";
import { ModelAgentSession } from "./session.ts";

/**
 * 言語モデルを直接呼び出すエージェントを生成する。
 *
 * @param options - 使用するモデルと、全セッション共通の指示。
 * @returns セッションを生成できるエージェント。
 * @remarks
 * 生成したエージェントはツールを公開せず、モデルのテキスト出力だけを扱う。
 * セッションの会話履歴はメモリにのみ保持され、永続化されない。
 */
export function createAgent(options: AgentOptions): Agent {
  return {
    createSession(sessionOptions?: SessionOptions): Promise<AgentSession> {
      const instructions = sessionOptions?.instructions ?? options.instructions;
      return Promise.resolve(new ModelAgentSession(options.model, instructions));
    },
  };
}
