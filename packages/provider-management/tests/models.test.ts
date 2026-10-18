import { expect, test, vi } from "vite-plus/test";
import { listModels } from "../src/models.ts";
import type { ListModelsOptions } from "../src/models.ts";

const sources = vi.hoisted(() => ({
  piModels: [] as Array<{ id: string; name: string }>,
  requestedProviders: [] as string[],
  acpxModels: [] as Array<{ id: string; name?: string }>,
  acpxOptions: [] as unknown[],
}));

vi.mock("backend-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("backend-adapter")>();
  return {
    ...actual,
    listPiModels: (options?: { provider?: string }) => {
      sources.requestedProviders.push(options?.provider ?? "");
      return Promise.resolve(sources.piModels);
    },
  };
});

vi.mock("../src/acpx-models.ts", () => ({
  listAcpxModels: (options: unknown) => {
    sources.acpxOptions.push(options);
    return Promise.resolve(sources.acpxModels);
  },
}));

test("プロバイダを選ぶと、内蔵バックエンドのモデル定義から一覧を返す", async () => {
  sources.piModels = [
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
  ];
  sources.acpxOptions.length = 0;

  await expect(listModels({ kind: "provider", id: "anthropic" })).resolves.toEqual([
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
  ]);
  expect(sources.requestedProviders.at(-1)).toBe("anthropic");
  expect(sources.acpxOptions).toHaveLength(0);
});

test("バックエンドのプロバイダ名がカタログのIDと違う場合は読み替える", async () => {
  sources.piModels = [];
  sources.requestedProviders.length = 0;
  sources.acpxOptions.length = 0;

  await listModels({ kind: "provider", id: "togetherai" });

  expect(sources.requestedProviders.at(-1)).toBe("together");
  expect(sources.acpxOptions).toHaveLength(0);
});

test("ハーネスを選ぶと、作業ディレクトリを渡してacpxで調べる", async () => {
  sources.acpxModels = [{ id: "gpt-5.4" }];
  sources.acpxOptions.length = 0;
  sources.requestedProviders.length = 0;

  await expect(listModels({ kind: "harness", id: "claude", cwd: "/project" })).resolves.toEqual([
    { id: "gpt-5.4" },
  ]);
  expect(sources.acpxOptions[0]).toEqual({ agent: "claude", cwd: "/project" });
  expect(sources.requestedProviders).toHaveLength(0);
});

test("providerの選択に余分な作業ディレクトリが付いていても、内蔵バックエンドの経路を使う", async () => {
  sources.piModels = [{ id: "gpt-5.4-mini", name: "GPT 5.4 Mini" }];
  sources.requestedProviders.length = 0;
  sources.acpxOptions.length = 0;

  // 構造的型付けでは、変数経由なら余分なプロパティを持つ値も代入できてしまう。
  const options: ListModelsOptions = { kind: "provider", id: "openai" };
  (options as { cwd?: string }).cwd = "/project";

  await listModels(options);

  expect(sources.requestedProviders.at(-1)).toBe("openai");
  expect(sources.acpxOptions).toHaveLength(0);
});
