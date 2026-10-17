import { expect, test, vi } from "vite-plus/test";
import { createProviderModel } from "../src/provider-model.ts";

const sdk = vi.hoisted(() => ({
  factoryOptions: [] as unknown[],
  modelIds: [] as string[],
  failImport: false,
}));

function createSdkStub(factoryName: string) {
  return {
    [factoryName]: (options: unknown) => {
      sdk.factoryOptions.push(options);
      return (modelId: string) => {
        sdk.modelIds.push(modelId);
        return { modelId, provider: factoryName };
      };
    },
  };
}

vi.mock("@ai-sdk/openai", () => createSdkStub("createOpenAI"));
vi.mock("@ai-sdk/anthropic", () => createSdkStub("createAnthropic"));
vi.mock("@ai-sdk/google", () => createSdkStub("createGoogleGenerativeAI"));

test("プロバイダのSDKにキーを渡し、モデルIDのモデルを組み立てる", async () => {
  await expect(
    createProviderModel({ providerId: "openai", modelId: "gpt-5.4-mini", apiKey: "sk-openai" }),
  ).resolves.toMatchObject({ modelId: "gpt-5.4-mini" });

  expect(sdk.factoryOptions.at(-1)).toEqual({ apiKey: "sk-openai" });
  expect(sdk.modelIds.at(-1)).toBe("gpt-5.4-mini");
});

test("プロバイダごとにSDKとファクトリを使い分ける", async () => {
  await createProviderModel({
    providerId: "anthropic",
    modelId: "claude-haiku-4-5",
    apiKey: "sk-ant",
  });
  await createProviderModel({
    providerId: "google",
    modelId: "gemini-2.5-flash",
    apiKey: "sk-google",
  });

  expect(sdk.factoryOptions.slice(-2)).toEqual([{ apiKey: "sk-ant" }, { apiKey: "sk-google" }]);
  expect(sdk.modelIds.slice(-2)).toEqual(["claude-haiku-4-5", "gemini-2.5-flash"]);
});
