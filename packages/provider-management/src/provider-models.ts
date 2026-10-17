import type { ApiKeyStore } from "./api-keys.ts";
import type { ProviderId } from "./catalog.ts";

/**
 * プロバイダが提供するモデル。
 */
export interface ProviderModel {
  /** モデルを選ぶときに指定するID。 */
  readonly id: string;

  /** プロバイダが通知した表示名。通知しないプロバイダでは省略する。 */
  readonly name?: string;
}

/**
 * {@link listProviderModels}の設定。
 */
export interface ProviderModelsOptions {
  /** モデルを調べるプロバイダのID。 */
  readonly providerId: ProviderId;

  /** プロバイダのAPIキーを保持する場所。 */
  readonly apiKeys: ApiKeyStore;

  /**
   * 取得を中断するためのシグナル。
   *
   * @remarks
   * 中断すると、進行中のリクエストを中断して失敗する。
   */
  readonly abortSignal?: AbortSignal;
}

/**
 * プロバイダが提供するモデルの一覧を、そのプロバイダのSDKで取得する。
 *
 * @param options - 調べるプロバイダとAPIキー。
 * @returns プロバイダが返したモデルの一覧。
 * @throws `Error` — APIキーが未設定の場合、または一覧の取得に対応していないプロバイダの場合。
 * @remarks
 * SDKは利用時に読み込む。アプリは使うプロバイダのSDK（`openai`など）を自身の依存に
 * 追加しておく必要があり、読み込めない場合は依存への追加を促すエラーになる。
 * APIキーが不正な場合など、SDKやプロバイダに起因する失敗は包まずそのまま伝播する。
 */
export async function listProviderModels(
  options: ProviderModelsOptions,
): Promise<readonly ProviderModel[]> {
  const apiKey = options.apiKeys.get(options.providerId);
  if (apiKey === undefined) {
    throw new Error(`No API key is stored for the provider: ${options.providerId}`);
  }

  const lister = MODEL_LISTERS[options.providerId];
  if (lister === undefined) {
    throw new Error(`Listing models is not supported for the provider: ${options.providerId}`);
  }

  return lister(apiKey, options.abortSignal);
}

/** プロバイダのSDKでモデル一覧を取得する処理。 */
type ModelLister = (
  apiKey: string,
  abortSignal: AbortSignal | undefined,
) => Promise<readonly ProviderModel[]>;

/**
 * モデル一覧を取得できるプロバイダ。
 *
 * ここにないプロバイダは、モデルのIDを利用者が指定する。
 */
const MODEL_LISTERS: Partial<Record<ProviderId, ModelLister>> = {
  openai: listOpenAiModels,
  anthropic: listAnthropicModels,
  google: listGoogleModels,
};

async function listOpenAiModels(
  apiKey: string,
  abortSignal: AbortSignal | undefined,
): Promise<readonly ProviderModel[]> {
  const { OpenAI } = await loadSdk("openai", () => import("openai"));
  const page = await new OpenAI({ apiKey }).models.list({ signal: abortSignal });
  return page.data.map((model) => ({ id: model.id }));
}

async function listAnthropicModels(
  apiKey: string,
  abortSignal: AbortSignal | undefined,
): Promise<readonly ProviderModel[]> {
  const { Anthropic } = await loadSdk("@anthropic-ai/sdk", () => import("@anthropic-ai/sdk"));
  const page = await new Anthropic({ apiKey }).models.list({}, { signal: abortSignal });
  return page.data.map((model) => ({ id: model.id, name: model.display_name }));
}

async function listGoogleModels(
  apiKey: string,
  abortSignal: AbortSignal | undefined,
): Promise<readonly ProviderModel[]> {
  const { GoogleGenAI } = await loadSdk("@google/genai", () => import("@google/genai"));
  const pager = await new GoogleGenAI({ apiKey }).models.list({ config: { abortSignal } });
  const models: ProviderModel[] = [];
  for await (const model of pager) {
    // 名前がないモデルは選択に使えないため除く。
    if (model.name === undefined) {
      continue;
    }
    models.push({ id: toGoogleModelId(model.name), name: model.displayName });
  }
  return models;
}

/**
 * Geminiのモデル名を、モデルIDとして指定する形に直す。
 *
 * APIは`models/gemini-2.5-pro`の形で返すが、選択に使うIDは接頭辞を除いた`gemini-2.5-pro`。
 */
function toGoogleModelId(name: string): string {
  return name.startsWith("models/") ? name.slice("models/".length) : name;
}

/**
 * プロバイダのSDKを読み込む。
 *
 * @throws `Error` — 読み込めない場合。アプリの依存にSDKがない状態を想定し、
 * 元の失敗は`cause`に保持する。
 */
async function loadSdk<T>(specifier: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    throw new Error(`The ${specifier} package is required to list models of this provider.`, {
      cause: error,
    });
  }
}
