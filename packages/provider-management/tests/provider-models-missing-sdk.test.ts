import { expect, test, vi } from "vite-plus/test";
import { createApiKeyStore } from "../src/api-keys.ts";
import { listProviderModels } from "../src/provider-models.ts";

// アプリの依存にSDKがない状態を再現する。モジュールの読み込み自体が失敗する。
vi.mock("openai", () => {
  throw new Error("Cannot find package 'openai'");
});

test("SDKを読み込めない場合は依存への追加を促すエラーになる", async () => {
  await expect(
    listProviderModels({
      providerId: "openai",
      apiKeys: createApiKeyStore({ openai: "sk-openai" }),
    }),
  ).rejects.toThrow("The openai package is required to list models of this provider.");
});
