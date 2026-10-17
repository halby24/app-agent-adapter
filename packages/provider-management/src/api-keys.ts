import { PROVIDER_IDS } from "./catalog.ts";
import type { ProviderId } from "./catalog.ts";

/**
 * プロバイダごとのAPIキー。
 *
 * キーの取得（環境変数、キーチェーン、利用者による入力など）は利用者側の責務で、
 * 集めたキーをこの形でまとめて渡す。設定しないプロバイダは省略するか`undefined`を渡す。
 */
export type ApiKeys = Partial<Record<ProviderId, string>>;

/**
 * APIキーを保持する場所。
 *
 * 作成時に渡されたキーの写しを持ち、渡されたオブジェクトを後から書き換えても内容は変わらない。
 */
export interface ApiKeyStore {
  /**
   * 指定したプロバイダのAPIキーを返す。
   *
   * @param providerId - 取り出すプロバイダのID。
   * @returns 保持しているAPIキー。未設定の場合は`undefined`。
   */
  get(providerId: ProviderId): string | undefined;

  /**
   * 指定したプロバイダのAPIキーを保持しているかを返す。
   *
   * @param providerId - 確認するプロバイダのID。
   * @returns 保持している場合は`true`。
   */
  has(providerId: ProviderId): boolean;
}

/**
 * まとめて渡されたAPIキーを保持する場所を作る。
 *
 * @param apiKeys - プロバイダごとのAPIキー。
 * @returns 作成時に渡されたキーの写しを持つ場所。
 * @remarks
 * 空文字のキーは未設定として扱う（環境変数などから空文字が渡る場合があるため）。
 */
export function createApiKeyStore(apiKeys: ApiKeys): ApiKeyStore {
  const stored = new Map<ProviderId, string>();
  for (const providerId of PROVIDER_IDS) {
    const apiKey = apiKeys[providerId];
    if (apiKey !== undefined && apiKey !== "") {
      stored.set(providerId, apiKey);
    }
  }

  return {
    get(providerId: ProviderId): string | undefined {
      return stored.get(providerId);
    },
    has(providerId: ProviderId): boolean {
      return stored.has(providerId);
    },
  };
}
