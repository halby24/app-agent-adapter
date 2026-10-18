import { listPiModels } from "backend-adapter";
import { listAcpxModels } from "./acpx-models.ts";
import type { ProviderId } from "./catalog.ts";
import type { HarnessChoice, ProviderChoice } from "./choice.ts";

/**
 * バックエンドが使うときのプロバイダ名。
 *
 * カタログのIDとバックエンドのプロバイダ名が違うものだけを並べる。
 */
const BACKEND_PROVIDER_IDS: Partial<Record<ProviderId, string>> = {
  togetherai: "together",
};

/**
 * バックエンドが使うときのプロバイダ名に読み替える。
 *
 * @param providerId - カタログのプロバイダID。
 * @returns バックエンドのプロバイダ名。読み替えが不要な場合はそのまま。
 */
export function toBackendProviderId(providerId: ProviderId): string {
  return BACKEND_PROVIDER_IDS[providerId] ?? providerId;
}

/**
 * 選択できるモデル。
 */
export interface ModelOption {
  /** モデルを選ぶときに指定するID。 */
  readonly id: string;

  /** 表示名が分かる場合の名前。 */
  readonly name?: string;
}

/**
 * {@link listModels}の設定。
 *
 * バックエンドの種類ごとに必要な指定が変わる。
 */
export type ListModelsOptions =
  | {
      /** モデルを調べるプロバイダ。 */
      readonly choice: ProviderChoice;
    }
  | {
      /** モデルを調べるハーネス。 */
      readonly choice: HarnessChoice;

      /** ハーネスを起動する作業ディレクトリ。 */
      readonly cwd: string;
    };

/**
 * 選んだバックエンドが使えるモデルを列挙する。
 *
 * @param options - モデルを調べる選択肢。
 * @returns 選んだバックエンドが使えるモデルの一覧。
 * @remarks
 * バックエンドごとの違いはこの関数が吸収する。プロバイダは内蔵のコーディングエージェントが
 * 持つモデル定義から返す（問い合わせも認証も不要）。ハーネスはacpxで調べるため、
 * エージェントのプロセスを1つ起動する。
 */
export async function listModels(options: ListModelsOptions): Promise<readonly ModelOption[]> {
  // ハーネスを選んだ場合だけ作業ディレクトリを指定できる。型では種類ごとに分かれているため、
  // ここでは指定の有無で判別する。
  if ("cwd" in options) {
    return listAcpxModels({ agent: options.choice.id, cwd: options.cwd });
  }
  const models = await listPiModels({ provider: toBackendProviderId(options.choice.id) });
  return models.map((model) => ({ id: model.id, name: model.name }));
}
