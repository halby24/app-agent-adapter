import type { Agent, AgentSession, ModelAgentOptions, SessionOptions } from "./types.ts";
import { ModelAgentSession } from "./session.ts";

/**
 * 言語モデルを直接呼び出すエージェントを生成する。
 *
 * @param options - 使用するモデルと、全セッション共通の指示。
 * @returns セッションを生成できるエージェント。
 * @remarks
 * 生成したエージェントはツールを公開せず、モデルのテキスト出力だけを扱う。
 * セッションの会話履歴はメモリにのみ保持され、永続化されない。
 * 既存のコーディングエージェントを動かす場合は{@link createHarnessAgent}を使う。
 */
export function createModelAgent(options: ModelAgentOptions): Agent {
  return {
    createSession(sessionOptions?: SessionOptions): Promise<AgentSession> {
      const instructions = sessionOptions?.instructions ?? options.instructions;
      return Promise.resolve(new ModelAgentSession(options.model, instructions));
    },
  };
}
