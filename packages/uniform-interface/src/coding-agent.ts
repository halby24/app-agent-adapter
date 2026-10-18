import type { Agent, PermissionMode } from "backend-adapter";
import { createAcpxAgent, createPiAgent } from "backend-adapter";
import type { HarnessChoice, ProviderChoice } from "provider-management";
import { toBackendProviderId } from "provider-management";

/**
 * エージェント向けの生成設定。
 *
 * 選んだバックエンドに、作業ディレクトリを指定してファイルを扱わせるための指定を加えたもの。
 * 使うバックエンドは選んだ種類で変わり、利用者側は意識する必要がない。
 *
 * - ハーネス: acpxでエージェントを起動する
 * - プロバイダ: 内蔵のPI Coding Agentを動かす。プロバイダのAPIキーとモデルIDを指定する
 */
export type CodingAgentOptions =
  | (ProviderChoice & {
      /** セッションの作業ディレクトリ。エージェントはこのディレクトリを基準にファイルを扱う。 */
      readonly cwd: string;

      /**
       * セッションで使うモデルID。
       *
       * @remarks
       * チャットと同じくモデルIDとAPIキーで指定し、バックエンドが
       * プロバイダのモデルとして解決する。
       */
      readonly model: string;

      /** プロバイダのAPIキー。 */
      readonly apiKey: string;

      /**
       * すべてのセッションに適用するシステム指示。
       *
       * @defaultValue 省略時はシステム指示を送信しない。
       */
      readonly instructions?: string;

      /**
       * エージェントが要求した操作の扱い。
       *
       * @defaultValue 省略時はバックエンドの既定（`"deny-all"`）。
       */
      readonly permissionMode?: PermissionMode;
    })
  | (HarnessChoice & {
      /** セッションの作業ディレクトリ。エージェントはこのディレクトリを基準にファイルを扱う。 */
      readonly cwd: string;

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

      /**
       * エージェントが要求した操作の扱い。
       *
       * @defaultValue 省略時はバックエンドの既定（acpxは`"deny-all"`）。
       */
      readonly permissionMode?: PermissionMode;
    });

/**
 * エージェント向けのエージェントを生成する。
 *
 * @param options - 選んだバックエンドと、作業ディレクトリなどの指定。
 * @returns セッションを生成できるエージェント。
 * @throws `Error` — プロバイダを選んだ場合に、バックエンドが扱わないモデルやプロバイダを指定したとき。
 * @remarks
 * プロバイダを選んだ場合は内蔵のPI Coding Agentを動かすため、バックエンドが扱うモデルである必要がある。
 */
export function createCodingAgent(options: CodingAgentOptions): Agent {
  if (options.kind === "provider") {
    return createPiAgent({
      cwd: options.cwd,
      model: {
        provider: toBackendProviderId(options.id),
        id: options.model,
        apiKey: options.apiKey,
      },
      instructions: options.instructions,
      permissionMode: options.permissionMode,
    });
  }

  return createAcpxAgent({
    agent: options.id,
    cwd: options.cwd,
    model: options.model,
    instructions: options.instructions,
    permissionMode: options.permissionMode,
  });
}
