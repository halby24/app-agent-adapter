import { expect, test, vi } from "vite-plus/test";
import { listPiModels } from "../src/pi-models.ts";

const pi = vi.hoisted(() => ({
  runtimeOptions: [] as unknown[],
  models: [] as Array<{ id: string; name: string; provider: string }>,
  requestedProviders: [] as Array<string | undefined>,
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  ModelRuntime: {
    create: (options: unknown) => {
      pi.runtimeOptions.push(options);
      return Promise.resolve({
        getModels: (provider?: string) => {
          pi.requestedProviders.push(provider);
          return provider === undefined
            ? pi.models
            : pi.models.filter((model) => model.provider === provider);
        },
      });
    },
  },
}));

test("PIが定義しているモデルをIDと表示名で返す", async () => {
  pi.models = [
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "anthropic" },
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", provider: "anthropic" },
    { id: "gpt-5.4", name: "GPT-5.4", provider: "openai" },
  ];

  await expect(listPiModels({ provider: "anthropic" })).resolves.toEqual([
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
  ]);
});

test("プロバイダを指定しない場合は、すべてのプロバイダのモデルを返す", async () => {
  pi.models = [
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "anthropic" },
    { id: "gpt-5.4", name: "GPT-5.4", provider: "openai" },
  ];

  await expect(listPiModels()).resolves.toHaveLength(2);
  expect(pi.requestedProviders.at(-1)).toBeUndefined();
});

test("PIの設定を読み書きしないランタイムを使う", async () => {
  await listPiModels();

  // 設定ファイルを作らず、APIキーもメモリにだけ置く。
  expect(pi.runtimeOptions.at(-1)).toMatchObject({ modelsPath: null });
  expect((pi.runtimeOptions.at(-1) as { credentials: unknown }).credentials).toBeDefined();
});
