import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startPiSession } from "./pi-agent.ts";
import type { Agent, AgentSession, PiChatAgentOptions, SessionOptions } from "./types.ts";

/**
 * チャット用の中立指示。
 *
 * 未指定や空文字の場合にPIのコーディング用既定プロンプトの代わりに送る。
 * ツールやファイル操作を前提にせず、短く応答の言葉だけを指定する。
 * 空文字ではPIが既定に戻してしまうため、空文字も未指定と同じ扱いにする。
 */
const CHAT_SYSTEM_PROMPT =
  "You are a helpful chat assistant. Answer concisely in the user's language.";

/**
 * ツールなしのチャット用に固定したPIエージェントを生成する。
 *
 * @param options - 作業ディレクトリと、全セッション共通の設定。
 * @returns セッションを生成できるエージェント。
 * @remarks
 * コーディング用（`{@link createPiAgent}`）とは資源の隔離方針が異なる。ツールは使わず
 * （`noTools: "all"`）、PIの既定プロンプト・技能・文書・拡張を使わない。利用者の
 * `~/.pi/agent`は読まず、セッションごとに一時ディレクトリを割り当てて
 * `{@link AgentSession.close}`で破棄する。呼び出し側にSDKの細かい指定は露出しない。
 */
export function createPiChatAgent(options: PiChatAgentOptions): Agent {
  return {
    async createSession(sessionOptions?: SessionOptions): Promise<AgentSession> {
      // PIのSDKは依存が多いため、セッションを生成するときに読み込む。
      const { DefaultResourceLoader, SessionManager, SettingsManager } =
        await import("@earendil-works/pi-coding-agent");
      const rawInstructions = sessionOptions?.instructions ?? options.instructions;
      const instructions =
        rawInstructions === undefined || rawInstructions === ""
          ? CHAT_SYSTEM_PROMPT
          : rawInstructions;
      // 利用者の~/.pi/agentを読まないよう、セッションごとに一時ディレクトリを使う。
      // エージェントに終了処理がないため、所有権はセッションが持ち、closeで破棄する。
      const agentDir = await mkdtemp(join(tmpdir(), "pi-chat-agent-"));
      try {
        // 追加のモデル呼び出し（キャッシュ温め・要約・再試行）を抑え、1ターン1呼び出しにする。
        const settingsManager = SettingsManager.inMemory({
          cacheWarming: "off",
          compaction: { enabled: false },
          retry: { enabled: false },
        });
        const resourceLoader = new DefaultResourceLoader({
          cwd: options.cwd,
          agentDir,
          settingsManager,
          // コーディング用既定プロンプトを使わず、中立指示に置き換える。
          // SYSTEM.md / APPEND_SYSTEM.md の混入もここで断つ。
          systemPromptOverride: () => instructions,
          appendSystemPromptOverride: () => [],
          // 技能・文書・拡張・配色は読み込まない。会話に混ぜる資源を持たない。
          noSkills: true,
          noPromptTemplates: true,
          noContextFiles: true,
          noExtensions: true,
          noThemes: true,
        });
        // 読み込みを確定させる。これを呼ばないと、上の指定はプロンプトに反映されない。
        await resourceLoader.reload();

        return await startPiSession(
          {
            cwd: options.cwd,
            model: options.model,
            resourceLoader,
            // 会話履歴をディスクに残さない。
            sessionManager: SessionManager.inMemory(options.cwd),
            settingsManager,
            agentDir,
            noTools: "all",
          },
          () => rm(agentDir, { recursive: true, force: true }),
        );
      } catch (error) {
        // 起動に失敗した場合は一時ディレクトリを残さない。
        await rm(agentDir, { recursive: true, force: true }).catch(() => {});
        throw error;
      }
    },
  };
}
