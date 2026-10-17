import { expect, test } from "vite-plus/test";
import { createApiKeyStore } from "../src/index.ts";

test("渡されたキーをプロバイダごとに取り出せる", () => {
  const apiKeys = createApiKeyStore({ openai: "sk-openai", anthropic: "sk-anthropic" });

  expect(apiKeys.get("openai")).toBe("sk-openai");
  expect(apiKeys.get("anthropic")).toBe("sk-anthropic");
  expect(apiKeys.has("openai")).toBe(true);
});

test("渡していないキーは未設定として扱う", () => {
  const apiKeys = createApiKeyStore({ anthropic: undefined });

  expect(apiKeys.get("anthropic")).toBeUndefined();
  expect(apiKeys.has("anthropic")).toBe(false);
});

test("空文字のキーは未設定として扱う", () => {
  const apiKeys = createApiKeyStore({ openai: "" });

  expect(apiKeys.get("openai")).toBeUndefined();
  expect(apiKeys.has("openai")).toBe(false);
});

test("作成後に渡したオブジェクトを書き換えても保持しているキーは変わらない", () => {
  const keys = { openai: "sk-openai" };
  const apiKeys = createApiKeyStore(keys);

  keys.openai = "sk-other";

  expect(apiKeys.get("openai")).toBe("sk-openai");
});
