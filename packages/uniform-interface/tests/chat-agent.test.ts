import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { MockLanguageModelV4 } from "ai/test";
import { expect, test, vi } from "vite-plus/test";
import { createChatAgent } from "../src/index.ts";

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
      return {
        createSession: () => Promise.reject(new Error("チャットではセッションを生成しない")),
      };
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

test("プロバイダを選ぶと、モデルを直接呼び出すエージェントを生成する", () => {
  const model = new MockLanguageModelV4({});

  createChatAgent({ kind: "provider", id: "openai", model, instructions: "簡潔に答える" });

  expect(backend.modelAgentOptions).toEqual([{ model, instructions: "簡潔に答える" }]);
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
