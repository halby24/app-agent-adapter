import type { Agent, AgentSession, SessionOptions } from "backend-adapter";
import { createAcpxAgent, createPiChatAgent } from "backend-adapter";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toBackendProviderId } from "provider-management";
import type { HarnessChoice, ProviderChoice } from "provider-management";

/**
 * チャット用エージェントの生成設定。
 *
 * 選んだバックエンドに、チャットに必要な指定を加えたもの。ファイルの読み書きと
 * ツールの利用は行わない。どちらのバックエンドもモデルはIDとAPIキーで指定する。
 */
export type ChatAgentOptions =
  | (ProviderChoice & {
      /**
       * セッションで使うモデルID。
       *
       * `provider-management`の`listModels()`で調べられる。
       */
      readonly model: string;

      /** プロバイダのAPIキー。 */
      readonly apiKey: string;

      /**
       * すべてのセッションに適用するシステム指示。
       *
       * @defaultValue 省略時や空文字の場合は短い中立のチャット指示を使う。
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
 * プロバイダを選んだ場合は内蔵のPI Coding Agentをチャット用に固定した構成で動かす。
 * ハーネスを選んだ場合は、セッションごとに使い捨ての作業ディレクトリを作り、
 * そこで操作を拒否した状態で動かす。どちらの場合もセッションの生成時に
 * 一時ディレクトリを作り、`{@link AgentSession.close}`で片付ける。
 */
export function createChatAgent(options: ChatAgentOptions): Agent {
  if (options.kind === "provider") {
    return createProviderChatAgent(options);
  }
  return createHarnessChatAgent(options);
}

/**
 * プロバイダを選んだときのチャット用エージェントを生成する。
 *
 * 内蔵のPI Coding Agentをチャット用に固定した構成で動かす。モデルとAPIキーは
 * バックエンドが扱うプロバイダ名に読み替えて渡す。
 */
function createProviderChatAgent(
  options: ProviderChoice & {
    readonly model: string;
    readonly apiKey: string;
    readonly instructions?: string;
  },
): Agent {
  return {
    async createSession(sessionOptions?: SessionOptions): Promise<AgentSession> {
      return createSessionWithTempWorkspace((cwd) =>
        createPiChatAgent({
          cwd,
          model: {
            provider: toBackendProviderId(options.id),
            id: options.model,
            apiKey: options.apiKey,
          },
          instructions: options.instructions,
        }).createSession(sessionOptions),
      );
    },
  };
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
      return createSessionWithTempWorkspace((cwd) =>
        createAcpxAgent({
          agent: options.id,
          cwd,
          model: options.model,
          instructions: options.instructions,
          // チャットなので、エージェントに操作を許さない。
          permissionMode: "deny-all",
        }).createSession(sessionOptions),
      );
    },
  };
}

/**
 * 使い捨ての作業ディレクトリを作り、その中でセッションを生成する。
 *
 * プロバイダとハーネスのどちらのチャットでも使う。チャットには作業ディレクトリの
 * 指定がないため、一時領域に作り、セッションを閉じるときに片付ける。
 * 生成に失敗した場合は作ったディレクトリを残さない。
 */
async function createSessionWithTempWorkspace(
  createInner: (cwd: string) => Promise<AgentSession>,
): Promise<AgentSession> {
  const cwd = await mkdtemp(join(tmpdir(), "uniform-interface-chat-"));
  let session: AgentSession;
  try {
    session = await createInner(cwd);
  } catch (error) {
    await removeWorkspace(cwd);
    throw error;
  }
  return withRemovedWorkspace(session, cwd);
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
