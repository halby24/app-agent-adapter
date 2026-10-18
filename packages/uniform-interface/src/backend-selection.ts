import type { PiModelSelection } from "backend-adapter";
import type { HarnessChoice, ProviderChoice } from "provider-management";
import { toBackendProviderId } from "provider-management";

/** プロバイダを選んだときの接続指定（作業ディレクトリ等は各入口が足す）。 */
export type ProviderConnection = ProviderChoice & {
  /**
   * セッションで使うモデルID。
   *
   * `provider-management`の`listModels()`で調べられる。
   *
   * @remarks
   * モデルIDとAPIキーで指定し、バックエンドがプロバイダのモデルとして解決する。
   */
  readonly model: string;

  /** プロバイダのAPIキー。 */
  readonly apiKey: string;

  /**
   * すべてのセッションに適用するシステム指示。
   *
   * 省略時の既定は入口ごとに異なる（{@link createChatAgent}は短い中立のチャット指示、
   * {@link createCodingAgent}はPIの既定プロンプト）。
   */
  readonly instructions?: string;
};

export type HarnessConnection = HarnessChoice & {
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
};

/** 選んだバックエンドへの接続指定。 */
export type AgentConnection = ProviderConnection | HarnessConnection;

/** プロバイダの指定を、バックエンドが扱うモデル指定に読み替える。 */
export function toPiModel(connection: ProviderConnection): PiModelSelection {
  return {
    provider: toBackendProviderId(connection.id),
    id: connection.model,
    apiKey: connection.apiKey,
  };
}
