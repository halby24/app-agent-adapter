import { createIsolatedModelRuntime } from "./pi-runtime.ts";
import type { PiModel, PiModelsOptions } from "./types.ts";

/**
 * PIが扱うモデルを列挙する。
 *
 * @param options - 列挙するプロバイダ。
 * @returns PIが定義しているモデルの一覧。プロバイダを指定した場合はそのプロバイダのモデルだけ。
 * @remarks
 * PIに同梱されたモデルの定義を読むだけなので、プロバイダへの問い合わせも認証も行わない。
 * そのため、アプリが用意したAPIキーでそのモデルを使えるかどうかまでは分からない。
 * PIの設定は読み書きしないので、利用者が定義したカスタムモデルは含まれない。
 */
export async function listPiModels(options?: PiModelsOptions): Promise<readonly PiModel[]> {
  const modelRuntime = await createIsolatedModelRuntime();
  return modelRuntime.getModels(options?.provider).map((model) => ({
    id: model.id,
    name: model.name,
  }));
}
