import type { Agent, AgentSession, SessionOptions } from "backend-adapter";
import { createAcpxAgent, createPiChatAgent } from "backend-adapter";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentConnection } from "./backend-selection.ts";
import { toPiModel } from "./backend-selection.ts";

/**
 * チャット用エージェントの生成設定。
 *
 * 選んだバックエンドに、チャットに必要な指定を加えたもの。ファイルの読み書きと
 * ツールの利用は行わない。どちらのバックエンドもモデルはIDとAPIキーで指定する。
 *
 * @remarks
 * プロバイダを選んだ場合、`instructions`の省略時や空文字のときは短い中立のチャット指示を使う。
 */
export type ChatAgentOptions = AgentConnection;

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
  return {
    createSession: (sessionOptions) =>
      createSessionWithTempWorkspace((cwd) => createChatSession(options, cwd, sessionOptions)),
  };
}

function createChatSession(
  options: ChatAgentOptions,
  cwd: string,
  sessionOptions: SessionOptions | undefined,
): Promise<AgentSession> {
  if (options.kind === "provider") {
    return createPiChatAgent({
      cwd,
      model: toPiModel(options),
      instructions: options.instructions,
    }).createSession(sessionOptions);
  }
  return createAcpxAgent({
    agent: options.id,
    cwd,
    model: options.model,
    instructions: options.instructions,
    permissionMode: "deny-all", // チャットなので、エージェントに操作を許さない。
  }).createSession(sessionOptions);
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
