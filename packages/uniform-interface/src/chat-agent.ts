import type { Agent, AgentSession, SessionOptions } from "backend-adapter";
import { createAcpxAgent, createModelAgent } from "backend-adapter";
import type { LanguageModel } from "ai";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessChoice, ProviderChoice } from "provider-management";

/**
 * チャット用エージェントの生成設定。
 *
 * 選んだバックエンドに、チャットに必要な指定を加えたもの。ファイルの読み書きと
 * ツールの利用は行わない。
 */
export type ChatAgentOptions =
  | (ProviderChoice & {
      /** ターンの生成に使用する言語モデル。 */
      readonly model: LanguageModel;

      /**
       * すべてのセッションに適用するシステム指示。
       *
       * @defaultValue 省略時はシステム指示を送信しない。
       */
      readonly instructions?: string;
    })
  | (HarnessChoice & {
      /**
       * セッションで使うモデル。
       *
       * エージェントが受け付けるモデルID（`"gpt-5.4"`など）を指定する。
       *
       * @defaultValue 省略時はエージェントが選ぶ既定のモデル。
       */
      readonly model?: string;

      /**
       * すべてのセッションに適用するシステム指示。
       *
       * @defaultValue 省略時はシステム指示を送信しない。
       */
      readonly instructions?: string;
    });

/**
 * チャット用のエージェントを生成する。
 *
 * @param options - 選んだバックエンドと、チャットに必要な指定。
 * @returns セッションを生成できるエージェント。
 * @remarks
 * プロバイダを選んだ場合は、モデルを直接呼び出す（tool useなし）。ハーネスを選んだ場合は、
 * セッションごとに使い捨ての作業ディレクトリを作り、そこで操作を拒否した状態で動かす。
 */
export function createChatAgent(options: ChatAgentOptions): Agent {
  if (options.kind === "provider") {
    return createModelAgent({ model: options.model, instructions: options.instructions });
  }
  return createHarnessChatAgent(options);
}

/**
 * ハーネスをチャット用に使うエージェントを生成する。
 *
 * チャットには作業ディレクトリの指定がないため、セッションごとに使い捨ての
 * 作業ディレクトリを作り、`"deny-all"`でファイルの読み書きとコマンド実行を拒否する。
 */
function createHarnessChatAgent(
  options: HarnessChoice & { readonly model?: string; readonly instructions?: string },
): Agent {
  return {
    async createSession(sessionOptions?: SessionOptions): Promise<AgentSession> {
      const cwd = await mkdtemp(join(tmpdir(), "uniform-interface-chat-"));
      let session: AgentSession;
      try {
        session = await createAcpxAgent({
          agent: options.id,
          cwd,
          model: options.model,
          instructions: options.instructions,
          // チャットなので、エージェントに操作を許さない。
          permissionMode: "deny-all",
        }).createSession(sessionOptions);
      } catch (error) {
        await removeWorkspace(cwd);
        throw error;
      }
      return withRemovedWorkspace(session, cwd);
    },
  };
}

/**
 * セッションを閉じるときに、使い捨ての作業ディレクトリも片付ける。
 *
 * エージェントが書き残したものごと削除する。
 */
function withRemovedWorkspace(session: AgentSession, cwd: string): AgentSession {
  return {
    send: (input: string, options) => session.send(input, options),
    async close(): Promise<void> {
      await session.close();
      await removeWorkspace(cwd);
    },
  };
}

/** 使い捨ての作業ディレクトリを削除する。 */
async function removeWorkspace(cwd: string): Promise<void> {
  await rm(cwd, { recursive: true, force: true });
}
