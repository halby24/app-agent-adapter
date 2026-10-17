import { expect, test, vi } from "vite-plus/test";
import { createCodingAgent } from "../src/index.ts";

vi.mock("provider-management", async (importOriginal) => {
  const actual = await importOriginal<typeof import("provider-management")>();
  return {
    ...actual,
    // プロバイダ名の読み替えだけを差し替える（実際の表はこのパッケージが持つ）。
    toBackendProviderId: (providerId: string) =>
      providerId === "togetherai" ? "together" : providerId,
  };
});

const backend = vi.hoisted(() => ({
  acpxAgentOptions: [] as unknown[],
  piAgentOptions: [] as unknown[],
}));

vi.mock("backend-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("backend-adapter")>();
  return {
    ...actual,
    createAcpxAgent: (options: unknown) => {
      backend.acpxAgentOptions.push(options);
      return {
        createSession: () =>
          Promise.resolve({
            send: () => (async function* () {})(),
            close: () => Promise.resolve(),
          }),
      };
    },
    createPiAgent: (options: unknown) => {
      backend.piAgentOptions.push(options);
      return {
        createSession: () =>
          Promise.resolve({
            send: () => (async function* () {})(),
            close: () => Promise.resolve(),
          }),
      };
    },
  };
});

test("ハーネスを選ぶと、作業ディレクトリと権限を指定してacpxのエージェントを生成する", () => {
  createCodingAgent({
    kind: "harness",
    id: "claude",
    cwd: "/project",
    model: "gpt-5.4",
    instructions: "リポジトリを調査する",
    permissionMode: "approve-reads",
  });

  expect(backend.acpxAgentOptions).toEqual([
    {
      agent: "claude",
      cwd: "/project",
      model: "gpt-5.4",
      instructions: "リポジトリを調査する",
      permissionMode: "approve-reads",
    },
  ]);
});

test("プロバイダを選ぶと、APIキーとモデルIDで内蔵のバックエンドを生成する", () => {
  createCodingAgent({
    kind: "provider",
    id: "anthropic",
    cwd: "/project",
    model: "claude-sonnet-4-5",
    apiKey: "sk-ant",
    instructions: "リポジトリを調査する",
    permissionMode: "approve-all",
  });

  expect(backend.piAgentOptions).toEqual([
    {
      cwd: "/project",
      model: { provider: "anthropic", id: "claude-sonnet-4-5", apiKey: "sk-ant" },
      instructions: "リポジトリを調査する",
      permissionMode: "approve-all",
    },
  ]);
});

test("バックエンドのプロバイダ名がカタログのIDと違う場合は読み替える", () => {
  backend.piAgentOptions.length = 0;

  createCodingAgent({
    kind: "provider",
    id: "togetherai",
    cwd: "/project",
    model: "llama-3.3-70b",
    apiKey: "sk-together",
  });

  expect(backend.piAgentOptions[0]).toMatchObject({
    model: { provider: "together", id: "llama-3.3-70b", apiKey: "sk-together" },
  });
});
