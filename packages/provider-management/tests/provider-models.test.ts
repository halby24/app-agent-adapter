import { beforeEach, expect, test, vi } from "vite-plus/test";
import { createApiKeyStore } from "../src/api-keys.ts";
import { listProviderModels } from "../src/provider-models.ts";

const sdk = vi.hoisted(() => ({
  openAiConstructorOptions: [] as unknown[],
  openAiListOptions: [] as unknown[],
  openAiModels: [] as Array<{ id: string }>,
  anthropicConstructorOptions: [] as unknown[],
  anthropicModels: [] as Array<{ id: string; display_name: string }>,
  googleConstructorOptions: [] as unknown[],
  googleModels: [] as Array<{ name?: string; displayName?: string }>,
}));

vi.mock("openai", () => ({
  OpenAI: class {
    readonly models: { list: (options?: unknown) => Promise<{ data: typeof sdk.openAiModels }> };

    constructor(options: unknown) {
      sdk.openAiConstructorOptions.push(options);
      this.models = {
        list: (listOptions?: unknown) => {
          sdk.openAiListOptions.push(listOptions);
          return Promise.resolve({ data: sdk.openAiModels });
        },
      };
    }
  },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  Anthropic: class {
    readonly models: {
      list: (params?: unknown, options?: unknown) => Promise<{ data: typeof sdk.anthropicModels }>;
    };

    constructor(options: unknown) {
      sdk.anthropicConstructorOptions.push(options);
      this.models = {
        list: () => Promise.resolve({ data: sdk.anthropicModels }),
      };
    }
  },
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    readonly models: { list: (params?: unknown) => Promise<AsyncIterable<unknown>> };

    constructor(options: unknown) {
      sdk.googleConstructorOptions.push(options);
      this.models = {
        list: () => Promise.resolve(toAsyncIterable(sdk.googleModels)),
      };
    }
  },
}));

async function* toAsyncIterable<T>(items: readonly T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

const apiKeys = (keys: Parameters<typeof createApiKeyStore>[0]) => createApiKeyStore(keys);

beforeEach(() => {
  sdk.openAiConstructorOptions.length = 0;
  sdk.openAiListOptions.length = 0;
  sdk.openAiModels = [];
  sdk.anthropicConstructorOptions.length = 0;
  sdk.anthropicModels = [];
  sdk.googleConstructorOptions.length = 0;
  sdk.googleModels = [];
});

test("OpenAIのSDKにキーを渡し、返ったモデルをIDで返す", async () => {
  sdk.openAiModels = [{ id: "gpt-5.4" }, { id: "gpt-5.4-mini" }];
  const { signal } = new AbortController();

  await expect(
    listProviderModels({
      providerId: "openai",
      apiKeys: apiKeys({ openai: "sk-openai" }),
      abortSignal: signal,
    }),
  ).resolves.toEqual([{ id: "gpt-5.4" }, { id: "gpt-5.4-mini" }]);

  expect(sdk.openAiConstructorOptions).toEqual([{ apiKey: "sk-openai" }]);
  expect(sdk.openAiListOptions).toEqual([{ signal }]);
});

test("AnthropicのSDKが返した表示名をモデル名として返す", async () => {
  sdk.anthropicModels = [
    { id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5" },
    { id: "claude-opus-4-1", display_name: "Claude Opus 4.1" },
  ];

  await expect(
    listProviderModels({ providerId: "anthropic", apiKeys: apiKeys({ anthropic: "sk-ant" }) }),
  ).resolves.toEqual([
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
    { id: "claude-opus-4-1", name: "Claude Opus 4.1" },
  ]);

  expect(sdk.anthropicConstructorOptions).toEqual([{ apiKey: "sk-ant" }]);
});

test("GoogleのSDKが返したモデル名から接頭辞を除いたIDを返す", async () => {
  sdk.googleModels = [
    { name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro" },
    { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash" },
    { displayName: "名前のないモデル" },
  ];

  await expect(
    listProviderModels({ providerId: "google", apiKeys: apiKeys({ google: "sk-google" }) }),
  ).resolves.toEqual([
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  ]);

  expect(sdk.googleConstructorOptions).toEqual([{ apiKey: "sk-google" }]);
});

test("APIキーが未設定のプロバイダではSDKを呼び出さずに失敗する", async () => {
  await expect(listProviderModels({ providerId: "openai", apiKeys: apiKeys({}) })).rejects.toThrow(
    "No API key is stored for the provider: openai",
  );

  expect(sdk.openAiConstructorOptions).toHaveLength(0);
});

test("一覧の取得に対応していないプロバイダでは失敗する", async () => {
  await expect(
    listProviderModels({ providerId: "mistral", apiKeys: apiKeys({ mistral: "sk-mistral" }) }),
  ).rejects.toThrow("Listing models is not supported for the provider: mistral");
});
