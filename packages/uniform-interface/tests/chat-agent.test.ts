import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { expect, test, vi } from "vite-plus/test";
import { createChatAgent } from "../src/index.ts";

const providerManagement = vi.hoisted(() => ({
  createdModels: [] as unknown[],
  modelOptions: [] as unknown[],
}));

vi.mock("provider-management", async (importOriginal) => {
  const actual = await importOriginal<typeof import("provider-management")>();
  return {
    ...actual,
    createProviderModel: (options: unknown) => {
      providerManagement.modelOptions.push(options);
      return Promise.resolve({ modelId: (options as { modelId: string }).modelId });
    },
  };
});

const backend = vi.hoisted(() => ({
  modelAgentOptions: [] as unknown[],
  acpxAgentOptions: [] as unknown[],
  failSession: false,
  acpxSession: {
    send: () => (async function* () {})(),
    close: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("backend-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("backend-adapter")>();
  return {
    ...actual,
    createModelAgent: (options: unknown) => {
      backend.modelAgentOptions.push(options);
      return { createSession: () => Promise.resolve(backend.acpxSession) };
    },
    createAcpxAgent: (options: unknown) => {
      backend.acpxAgentOptions.push(options);
      return {
        createSession: () =>
          backend.failSession
            ? Promise.reject(new Error("起動できない"))
            : Promise.resolve(backend.acpxSession),
      };
    },
  };
});

/** 作業ディレクトリとして渡されたパスを取り出す。 */
function workspaceOfCall(index: number): string {
  const options = backend.acpxAgentOptions[index] as { cwd: string };
  return options.cwd;
}

test("プロバイダを選ぶと、セッションの生成時にモデルを組み立てる", async () => {
  backend.modelAgentOptions.length = 0;
  providerManagement.modelOptions.length = 0;

  await createChatAgent({
    kind: "provider",
    id: "openai",
    model: "gpt-5.4-mini",
    apiKey: "sk-openai",
    instructions: "簡潔に答える",
  }).createSession();

  expect(providerManagement.modelOptions).toEqual([
    { providerId: "openai", modelId: "gpt-5.4-mini", apiKey: "sk-openai" },
  ]);
  expect(backend.modelAgentOptions).toEqual([
    { model: { modelId: "gpt-5.4-mini" }, instructions: "簡潔に答える" },
  ]);
});

test("ハーネスを選ぶと、操作を拒否した状態で使い捨ての作業ディレクトリで動かす", async () => {
  backend.acpxAgentOptions.length = 0;

  const session = await createChatAgent({
    kind: "harness",
    id: "claude",
    model: "gpt-5.4",
    instructions: "簡潔に答える",
  }).createSession();

  const cwd = workspaceOfCall(0);
  expect(backend.acpxAgentOptions[0]).toEqual({
    agent: "claude",
    cwd,
    model: "gpt-5.4",
    instructions: "簡潔に答える",
    permissionMode: "deny-all",
  });
  // セッション中は、一時領域に作った作業ディレクトリが実在する。
  expect(cwd.startsWith(tmpdir())).toBe(true);
  expect(existsSync(cwd)).toBe(true);

  await session.close();

  // 閉じたときに、エージェントが書き残したものごと片付ける。
  expect(existsSync(cwd)).toBe(false);
});

test("セッションの生成に失敗すると、使い捨ての作業ディレクトリを片付ける", async () => {
  backend.acpxAgentOptions.length = 0;
  backend.failSession = true;

  try {
    await expect(
      createChatAgent({ kind: "harness", id: "claude" }).createSession(),
    ).rejects.toThrow("起動できない");
  } finally {
    backend.failSession = false;
  }

  expect(existsSync(workspaceOfCall(0))).toBe(false);
});
