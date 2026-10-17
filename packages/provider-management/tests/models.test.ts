import { expect, test, vi } from "vite-plus/test";
import { listModels } from "../src/models.ts";

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

  await expect(listModels({ choice: { kind: "provider", id: "anthropic" } })).resolves.toEqual([
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
  ]);
  expect(sources.requestedProviders.at(-1)).toBe("anthropic");
});

test("バックエンドのプロバイダ名がカタログのIDと違う場合は読み替える", async () => {
  sources.piModels = [];
  sources.requestedProviders.length = 0;

  await listModels({ choice: { kind: "provider", id: "togetherai" } });

  expect(sources.requestedProviders.at(-1)).toBe("together");
});

test("ハーネスを選ぶと、作業ディレクトリを渡してacpxで調べる", async () => {
  sources.acpxModels = [{ id: "gpt-5.4" }];
  sources.acpxOptions.length = 0;

  await expect(
    listModels({ choice: { kind: "harness", id: "claude" }, cwd: "/project" }),
  ).resolves.toEqual([{ id: "gpt-5.4" }]);
  expect(sources.acpxOptions[0]).toEqual({ agent: "claude", cwd: "/project" });
});
