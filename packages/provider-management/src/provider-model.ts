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
 * @remarks
 * AI SDKのプロバイダパッケージはこのパッケージの依存に含まれるため、アプリ側の追加は不要。
 * パッケージは利用時に読み込む。
 */
export async function createProviderModel(options: ProviderModelOptions): Promise<LanguageModel> {
  const { modelId, apiKey } = options;
  switch (options.providerId) {
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI({ apiKey })(modelId);
    }
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      return createAnthropic({ apiKey })(modelId);
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      return createGoogleGenerativeAI({ apiKey })(modelId);
    }
    case "xai": {
      const { createXai } = await import("@ai-sdk/xai");
      return createXai({ apiKey })(modelId);
    }
    case "mistral": {
      const { createMistral } = await import("@ai-sdk/mistral");
      return createMistral({ apiKey })(modelId);
    }
    case "groq": {
      const { createGroq } = await import("@ai-sdk/groq");
      return createGroq({ apiKey })(modelId);
    }
    case "deepseek": {
      const { createDeepSeek } = await import("@ai-sdk/deepseek");
      return createDeepSeek({ apiKey })(modelId);
    }
    case "cerebras": {
      const { createCerebras } = await import("@ai-sdk/cerebras");
      return createCerebras({ apiKey })(modelId);
    }
    case "togetherai": {
      const { createTogetherAI } = await import("@ai-sdk/togetherai");
      return createTogetherAI({ apiKey })(modelId);
    }
    case "fireworks": {
      const { createFireworks } = await import("@ai-sdk/fireworks");
      return createFireworks({ apiKey })(modelId);
    }
    case "moonshotai": {
      const { createMoonshotAI } = await import("@ai-sdk/moonshotai");
      return createMoonshotAI({ apiKey })(modelId);
    }
  }
}
