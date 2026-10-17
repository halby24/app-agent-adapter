import type { LanguageModel } from "ai";
import type { ProviderId } from "./catalog.ts";

/**
 * {@link createProviderModel}の設定。
 */
export interface ProviderModelOptions {
  /** プロバイダのID（一覧にあるもの）。 */
  readonly providerId: ProviderId;

  /** 使うモデルID。{@link listModels}で調べられる。 */
  readonly modelId: string;

  /** プロバイダのAPIキー。 */
  readonly apiKey: string;
}

/**
 * プロバイダのモデルを組み立てる。
 *
 * @param options - プロバイダとモデルID、APIキー。
 * @returns チャット用エージェントに渡せるモデル。
 * @throws `Error` — プロバイダのSDKを読み込めない場合。
 * @remarks
 * AI SDKのプロバイダパッケージを利用時に読み込む。アプリは、使うプロバイダのパッケージを
 * 自身の依存に追加しておく必要がある。
 */
export async function createProviderModel(options: ProviderModelOptions): Promise<LanguageModel> {
  const { modelId, apiKey } = options;
  switch (options.providerId) {
    case "openai": {
      const { createOpenAI } = await loadSdk("@ai-sdk/openai", () => import("@ai-sdk/openai"));
      return createOpenAI({ apiKey })(modelId);
    }
    case "anthropic": {
      const { createAnthropic } = await loadSdk(
        "@ai-sdk/anthropic",
        () => import("@ai-sdk/anthropic"),
      );
      return createAnthropic({ apiKey })(modelId);
    }
    case "google": {
      const { createGoogleGenerativeAI } = await loadSdk(
        "@ai-sdk/google",
        () => import("@ai-sdk/google"),
      );
      return createGoogleGenerativeAI({ apiKey })(modelId);
    }
    case "xai": {
      const { createXai } = await loadSdk("@ai-sdk/xai", () => import("@ai-sdk/xai"));
      return createXai({ apiKey })(modelId);
    }
    case "mistral": {
      const { createMistral } = await loadSdk("@ai-sdk/mistral", () => import("@ai-sdk/mistral"));
      return createMistral({ apiKey })(modelId);
    }
    case "groq": {
      const { createGroq } = await loadSdk("@ai-sdk/groq", () => import("@ai-sdk/groq"));
      return createGroq({ apiKey })(modelId);
    }
    case "deepseek": {
      const { createDeepSeek } = await loadSdk(
        "@ai-sdk/deepseek",
        () => import("@ai-sdk/deepseek"),
      );
      return createDeepSeek({ apiKey })(modelId);
    }
    case "cerebras": {
      const { createCerebras } = await loadSdk(
        "@ai-sdk/cerebras",
        () => import("@ai-sdk/cerebras"),
      );
      return createCerebras({ apiKey })(modelId);
    }
    case "togetherai": {
      const { createTogetherAI } = await loadSdk(
        "@ai-sdk/togetherai",
        () => import("@ai-sdk/togetherai"),
      );
      return createTogetherAI({ apiKey })(modelId);
    }
    case "fireworks": {
      const { createFireworks } = await loadSdk(
        "@ai-sdk/fireworks",
        () => import("@ai-sdk/fireworks"),
      );
      return createFireworks({ apiKey })(modelId);
    }
    case "moonshotai": {
      const { createMoonshotAI } = await loadSdk(
        "@ai-sdk/moonshotai",
        () => import("@ai-sdk/moonshotai"),
      );
      return createMoonshotAI({ apiKey })(modelId);
    }
  }
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
    throw new Error(`The ${specifier} package is required to use this provider.`, {
      cause: error,
    });
  }
}
