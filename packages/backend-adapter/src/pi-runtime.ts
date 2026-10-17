/** PIのモデルランタイムのクラス。 */
type PiModelRuntimeClass = typeof import("@earendil-works/pi-coding-agent").ModelRuntime;

/** PIのモデルと認証を扱うランタイム。 */
export type PiModelRuntime = NonNullable<Awaited<ReturnType<PiModelRuntimeClass["create"]>>>;

/** ランタイム作成の設定。 */
type PiRuntimeOptions = NonNullable<Parameters<PiModelRuntimeClass["create"]>[0]>;

/** 認証情報の置き場。 */
type PiCredentialStore = NonNullable<PiRuntimeOptions["credentials"]>;

/** 認証情報。 */
type PiCredential = NonNullable<Awaited<ReturnType<PiCredentialStore["read"]>>>;

/**
 * アプリが指定したモデルとAPIキーだけで動かすための、PIのモデルランタイムを作る。
 *
 * @returns PIのモデル定義（同梱のカタログ）を使い、認証情報をメモリにだけ持つランタイム。
 * @remarks
 * PIの設定（`~/.pi/agent`）は読み書きしない。APIキーをディスクに残さず、設定ファイルも
 * 作らないが、利用者が定義したカスタムモデルは使われない。
 *
 * @internal
 */
export async function createIsolatedModelRuntime(): Promise<PiModelRuntime> {
  const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
  return ModelRuntime.create({ credentials: createMemoryCredentialStore(), modelsPath: null });
}

/**
 * 認証情報をメモリにだけ置く置き場を作る。
 *
 * @internal
 */
function createMemoryCredentialStore(): PiCredentialStore {
  const credentials = new Map<string, PiCredential>();
  return {
    read: (providerId) => Promise.resolve(credentials.get(providerId)),
    list: () =>
      Promise.resolve(
        [...credentials].map(([providerId, credential]) => ({
          providerId,
          type: credential.type,
        })),
      ),
    async modify(providerId, update) {
      const next = await update(credentials.get(providerId));
      if (next !== undefined) {
        credentials.set(providerId, next);
      }
      return credentials.get(providerId);
    },
    delete: (providerId) => {
      credentials.delete(providerId);
      return Promise.resolve();
    },
  };
}
