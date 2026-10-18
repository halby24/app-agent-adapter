import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { expect, test, vi } from "vite-plus/test";
import { createChatAgent } from "../src/index.ts";

const backend = vi.hoisted(() => ({
  piChatAgentOptions: [] as unknown[],
  acpxAgentOptions: [] as unknown[],
  failPiSession: false,
  failAcpxSession: false,
  piSession: {
    send: () => (async function* () {})(),
    close: vi.fn(() => Promise.resolve()),
  },
  acpxSession: {
    send: () => (async function* () {})(),
    close: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("backend-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("backend-adapter")>();
  return {
    ...actual,
    createPiChatAgent: (options: unknown) => {
      backend.piChatAgentOptions.push(options);
      return {
        createSession: () =>
          backend.failPiSession
            ? Promise.reject(new Error("起動できない"))
            : Promise.resolve(backend.piSession),
      };
    },
    createAcpxAgent: (options: unknown) => {
      backend.acpxAgentOptions.push(options);
      return {
        createSession: () =>
          backend.failAcpxSession
            ? Promise.reject(new Error("起動できない"))
            : Promise.resolve(backend.acpxSession),
      };
    },
  };
});

/** プロバイダ側に渡された作業ディレクトリを取り出す。 */
function piWorkspaceOfCall(index: number): string {
  const options = backend.piChatAgentOptions[index] as { cwd: string };
  return options.cwd;
}

/** ハーネス側に渡された作業ディレクトリを取り出す。 */
function acpxWorkspaceOfCall(index: number): string {
  const options = backend.acpxAgentOptions[index] as { cwd: string };
  return options.cwd;
}

test("プロバイダを選ぶと、使い捨ての作業ディレクトリでチャット用のPIを動かす", async () => {
  backend.piChatAgentOptions.length = 0;
  backend.piSession.close.mockClear();

  const session = await createChatAgent({
    kind: "provider",
    id: "openai",
    model: "gpt-5.4-mini",
    apiKey: "sk-openai",
    instructions: "簡潔に答える",
  }).createSession();

  const cwd = piWorkspaceOfCall(0);
  expect(backend.piChatAgentOptions[0]).toEqual({
    cwd,
    model: { provider: "openai", id: "gpt-5.4-mini", apiKey: "sk-openai" },
    instructions: "簡潔に答える",
  });
  // セッション中は、一時領域に作った作業ディレクトリが実在する。
  expect(cwd.startsWith(tmpdir())).toBe(true);
  expect(existsSync(cwd)).toBe(true);

  await session.close();

  // 閉じたときに、エージェントが書き残したものごと片付ける。
  expect(existsSync(cwd)).toBe(false);
});

test("プロバイダのIDはバックエンドのプロバイダ名に読み替える", async () => {
  backend.piChatAgentOptions.length = 0;
  backend.piSession.close.mockClear();

  const session = await createChatAgent({
    kind: "provider",
    id: "togetherai",
    model: "meta-llama-3",
    apiKey: "sk-together",
  }).createSession();

  try {
    expect(backend.piChatAgentOptions[0]).toMatchObject({
      model: { provider: "together", id: "meta-llama-3", apiKey: "sk-together" },
    });
  } finally {
    await session.close();
  }

  expect(existsSync(piWorkspaceOfCall(0))).toBe(false);
});

test("プロバイダのセッション生成に失敗すると、使い捨ての作業ディレクトリを片付ける", async () => {
  backend.piChatAgentOptions.length = 0;
  backend.failPiSession = true;

  try {
    await expect(
      createChatAgent({
        kind: "provider",
        id: "openai",
        model: "gpt-5.4-mini",
        apiKey: "sk-openai",
      }).createSession(),
    ).rejects.toThrow("起動できない");
  } finally {
    backend.failPiSession = false;
  }

  expect(existsSync(piWorkspaceOfCall(0))).toBe(false);
});

test("ハーネスを選ぶと、操作を拒否した状態で使い捨ての作業ディレクトリで動かす", async () => {
  backend.acpxAgentOptions.length = 0;
  backend.acpxSession.close.mockClear();

  const session = await createChatAgent({
    kind: "harness",
    id: "claude",
    model: "gpt-5.4",
    instructions: "簡潔に答える",
  }).createSession();

  const cwd = acpxWorkspaceOfCall(0);
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

test("ハーネスのセッション生成に失敗すると、使い捨ての作業ディレクトリを片付ける", async () => {
  backend.acpxAgentOptions.length = 0;
  backend.failAcpxSession = true;

  try {
    await expect(
      createChatAgent({ kind: "harness", id: "claude" }).createSession(),
    ).rejects.toThrow("起動できない");
  } finally {
    backend.failAcpxSession = false;
  }

  expect(existsSync(acpxWorkspaceOfCall(0))).toBe(false);
});
