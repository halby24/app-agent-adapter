import type { AcpxPermissionMode, Agent } from "backend-adapter";
import { createAcpxAgent, createModelAgent } from "backend-adapter";
import type { LanguageModel } from "ai";
import type { HarnessOption, ProviderOption } from "./catalog.ts";

/**
 * プロバイダを選択したときの指定。
 *
 * 一覧の{@link ProviderOption}に、ターンの生成に必要な指定を加えたもの。
 */
export type ProviderSelection = ProviderOption & {
  /**
   * ターンの生成に使用する言語モデル。
   *
   * APIキーなどの認証はアプリ側の責務であり、認証済みのモデルをここに渡す。
   */
  readonly model: LanguageModel;

  /**
   * すべてのセッションに適用するシステム指示。
   *
   * @defaultValue 省略時はシステム指示を送信しない。
   */
  readonly instructions?: string;
};

/**
 * ハーネスを選択したときの指定。
 *
 * 一覧の{@link HarnessOption}に、エージェントの起動に必要な指定を加えたもの。
 */
export type HarnessSelection = HarnessOption & {
  /** セッションの作業ディレクトリ。エージェントはこのディレクトリを基準にファイルを扱う。 */
  readonly cwd: string;

  /**
   * すべてのセッションに適用するシステム指示。
   *
   * @defaultValue 省略時はシステム指示を送信しない。
   */
  readonly instructions?: string;

  /**
   * セッションで使うモデル。
   *
   * エージェントが受け付けるモデルID（`"gpt-5.4"`など）を指定する。
   *
   * @defaultValue 省略時はエージェントが選ぶ既定のモデル。
   * @remarks
   * 対応しないモデルを指定した場合は、acpxが返す`ACP_MODEL_UNSUPPORTED`の失敗がそのまま伝播する。
   */
  readonly model?: string;

  /**
   * エージェントが要求した操作の扱い。
   *
   * @defaultValue 省略時は`"deny-all"`（{@link createAgent}が補う）。
   */
  readonly permissionMode?: AcpxPermissionMode;
};

/**
 * 一覧から選んだバックエンドの指定。
 *
 * 一覧の{@link AgentOption}をそのまま広げ、選択したバックエンドに必要な指定を
 * 加えて作る。`kind`で種類を絞り込めるため、種類ごとに必要な指定は
 * `option.kind`の判定で分岐できる。
 */
export type AgentSelection = ProviderSelection | HarnessSelection;

/**
 * 一覧から選んだバックエンドのエージェントを生成する。
 *
 * @param selection - 選択した選択肢と、そのバックエンドに必要な指定。
 * @returns 選択したバックエンドのエージェント。利用方法は選択した種類によらず同じ。
 * @remarks
 * セッションの生成はエージェントの{@link Agent.createSession}で行う。プロバイダを選んだ場合は
 * 渡したモデルがそのまま使われ、ハーネスを選んだ場合はacpxがセッションごとにエージェントを起動する。
 */
export function createAgent(selection: AgentSelection): Agent {
  return selection.kind === "provider"
    ? createModelAgent({ model: selection.model, instructions: selection.instructions })
    : createAcpxAgent({
        agent: selection.id,
        cwd: selection.cwd,
        instructions: selection.instructions,
        model: selection.model,
        permissionMode: selection.permissionMode,
      });
}
