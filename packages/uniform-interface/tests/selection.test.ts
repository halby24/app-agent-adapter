import { MockLanguageModelV4 } from "ai/test";
import { expect, test, vi } from "vite-plus/test";
import type { AgentEvent, HarnessOption, ProviderOption } from "../src/index.ts";
import { createAgent, findAgentOption } from "../src/index.ts";

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

/** 一覧からプロバイダの選択肢を取り出す。 */
function providerOption(id: string): ProviderOption {
  const option = findAgentOption(id);
  if (option === undefined || option.kind !== "provider") {
    throw new Error(`一覧にプロバイダの選択肢がない: ${id}`);
  }
  return option;
}

/** 一覧からハーネスの選択肢を取り出す。 */
function harnessOption(id: string): HarnessOption {
  const option = findAgentOption(id);
  if (option === undefined || option.kind !== "harness") {
    throw new Error(`一覧にハーネスの選択肢がない: ${id}`);
  }
  return option;
}

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
    ...providerOption("openai"),
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

test("ハーネスを選ぶと、組み込み名と作業ディレクトリとモデルがacpxに渡される", () => {
  createAgent({
    ...harnessOption("claude"),
    cwd: "/project",
    model: "gpt-5.4",
    instructions: "review",
    permissionMode: "approve-reads",
  });

  expect(acpx.createAcpxAgent).toHaveBeenCalledWith({
    agent: "claude",
    cwd: "/project",
    model: "gpt-5.4",
    instructions: "review",
    permissionMode: "approve-reads",
  });
});
