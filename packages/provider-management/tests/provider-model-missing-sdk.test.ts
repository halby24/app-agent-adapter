import { expect, test, vi } from "vite-plus/test";
import { createProviderModel } from "../src/provider-model.ts";

// アプリの依存にSDKがない状態を再現する。モジュールの読み込み自体が失敗する。
vi.mock("@ai-sdk/openai", () => {
  throw new Error("Cannot find package '@ai-sdk/openai'");
});

test("SDKを読み込めない場合は依存への追加を促すエラーになる", async () => {
  await expect(
    createProviderModel({ providerId: "openai", modelId: "gpt-5.4-mini", apiKey: "sk-openai" }),
  ).rejects.toThrow("The @ai-sdk/openai package is required to use this provider.");
});
