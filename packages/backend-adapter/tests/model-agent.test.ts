import { MockLanguageModelV4 } from "ai/test";
import { expect, test } from "vite-plus/test";
import type { AgentEvent } from "../src/index.ts";
import { AgentError, createModelAgent } from "../src/index.ts";

type MockCall = MockLanguageModelV4["doStreamCalls"][number];

const usage = {
  inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 3, text: 3, reasoning: undefined },
} as const;

function createTextModel(chunks: readonly string[]): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "text-1" });
          for (const chunk of chunks) {
            controller.enqueue({ type: "text-delta", id: "text-1", delta: chunk });
          }
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

function createGatedModel(): { model: MockLanguageModelV4; release: () => void } {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        async start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "text-1" });
          controller.enqueue({ type: "text-delta", id: "text-1", delta: "partial" });
          await gate;
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

  return { model, release };
}

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const collected: AgentEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function messageText(message: MockCall["prompt"][number]): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content.map((part) => (part.type === "text" ? part.text : "")).join("");
}

test("streams text deltas followed by a finish event", async () => {
  const model = createTextModel(["Hello", ", world"]);
  const session = await createModelAgent({ model }).createSession();

  try {
    const events = await collect(session.send("Hi"));

    expect(events).toEqual([
      { type: "text-delta", text: "Hello" },
      { type: "text-delta", text: ", world" },
      {
        type: "finish",
        finishReason: "stop",
        usage: expect.objectContaining({ inputTokens: 5, outputTokens: 3 }),
        text: "Hello, world",
      },
    ]);
  } finally {
    await session.close();
  }
});

test("includes prior turns in the next model request", async () => {
  const model = createTextModel(["ok"]);
  const session = await createModelAgent({ model }).createSession();

  try {
    await collect(session.send("first"));
    await collect(session.send("second"));
  } finally {
    await session.close();
  }

  expect(model.doStreamCalls).toHaveLength(2);

  const prompt = model.doStreamCalls[1]?.prompt;
  expect(prompt?.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
  expect(prompt?.map(messageText)).toEqual(["first", "ok", "second"]);
});

test("session instructions override agent instructions", async () => {
  const model = createTextModel(["ok"]);
  const agent = createModelAgent({ model, instructions: "agent instruction" });
  const inherited = await agent.createSession();
  const overridden = await agent.createSession({ instructions: "session instruction" });

  try {
    await collect(inherited.send("a"));
    await collect(overridden.send("b"));
  } finally {
    await inherited.close();
    await overridden.close();
  }

  expect(model.doStreamCalls[0]?.prompt[0]).toEqual({
    role: "system",
    content: "agent instruction",
  });
  expect(model.doStreamCalls[1]?.prompt[0]).toEqual({
    role: "system",
    content: "session instruction",
  });
});

test("rejects a second turn while the first turn is running", async () => {
  const { model, release } = createGatedModel();
  const session = await createModelAgent({ model }).createSession();
  const iterator = session.send("first")[Symbol.asyncIterator]();

  try {
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: "text-delta", text: "partial" },
    });

    const second = session.send("second")[Symbol.asyncIterator]();
    await expect(second.next()).rejects.toMatchObject({
      code: "session-busy",
      name: AgentError.name,
    });
  } finally {
    release();
    for (let result = await iterator.next(); !result.done; result = await iterator.next()) {
      // Drain the first turn so the session can be closed cleanly.
    }
    await session.close();
  }
});

test("rejects new turns after the session is closed", async () => {
  const model = createTextModel(["ok"]);
  const session = await createModelAgent({ model }).createSession();

  await session.close();
  await session.close();

  const iterator = session.send("hello")[Symbol.asyncIterator]();
  await expect(iterator.next()).rejects.toMatchObject({
    code: "session-closed",
    name: AgentError.name,
  });
  expect(model.doStreamCalls).toHaveLength(0);
});
