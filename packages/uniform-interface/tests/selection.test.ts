import { MockLanguageModelV4 } from "ai/test";
import { expect, test, vi } from "vite-plus/test";
import type { AgentEvent } from "../src/index.ts";
import { createAgent } from "../src/index.ts";

const acpx = vi.hoisted(() => ({
  createAcpxAgent: vi.fn(() => ({
    // 選択からacpxへの受け渡しだけを確かめるため、セッションの中身は使わない。
    createSession: () => Promise.reject(new Error("呼び出さない")),
    close: () => Promise.resolve(),
  })),
}));

vi.mock("backend-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("backend-adapter")>();
  return { ...actual, createAcpxAgent: acpx.createAcpxAgent };
});

const usage = {
  inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 3, text: 3, reasoning: undefined },
} as const;

function createTextModel(text: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "text-1" });
          controller.enqueue({ type: "text-delta", id: "text-1", delta: text });
          controller.enqueue({ type: "text-end", id: "text-1" });
          controller.enqueue({
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            usage,
          });
          controller.close();
        },
      }),
    }),
  });
}

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const collected: AgentEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

test("プロバイダを選ぶと、渡したモデルでターンを送信できる", async () => {
  const session = await createAgent({
    kind: "provider",
    id: "openai",
    model: createTextModel("Hello"),
  }).createSession();

  try {
    await expect(collect(session.send("Hi"))).resolves.toEqual([
      { type: "text-delta", text: "Hello" },
      {
        type: "finish",
        finishReason: "stop",
        usage: expect.objectContaining({ inputTokens: 5, outputTokens: 3 }),
        text: "Hello",
      },
    ]);
  } finally {
    await session.close();
  }
});

test("ハーネスを選ぶと、組み込み名と作業ディレクトリがacpxに渡される", () => {
  createAgent({
    kind: "harness",
    id: "claude",
    cwd: "/project",
    instructions: "review",
    permissionMode: "approve-reads",
  });

  expect(acpx.createAcpxAgent).toHaveBeenCalledWith({
    agent: "claude",
    cwd: "/project",
    instructions: "review",
    permissionMode: "approve-reads",
  });
});

test("一覧にないIDを選ぶとoption-not-foundで失敗する", () => {
  expect(() => createAgent({ kind: "harness", id: "no-such-harness", cwd: "/project" })).toThrow(
    expect.objectContaining({ code: "option-not-found", id: "no-such-harness" }),
  );
});

test("一覧にあるIDでも種類が一致しないとoption-kind-mismatchで失敗する", () => {
  // openaiはプロバイダのIDなので、ハーネスとして選ぶことはできない。
  expect(() => createAgent({ kind: "harness", id: "openai", cwd: "/project" })).toThrow(
    expect.objectContaining({ code: "option-kind-mismatch", id: "openai" }),
  );
});
