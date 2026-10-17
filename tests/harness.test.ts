import type { HarnessAgent, HarnessAgentSession } from "@ai-sdk/harness/agent";
import { beforeEach, expect, expectTypeOf, test, vi } from "vite-plus/test";
import { createHarnessBackedAgent } from "../src/harness-agent.ts";
import type { HarnessRuntime, HarnessRuntimeSession } from "../src/harness-agent.ts";
import { AgentError } from "../src/index.ts";
import type { AgentEvent } from "../src/index.ts";

const sandboxState = vi.hoisted(() => ({ created: 0, destroyed: 0 }));

vi.mock("@ai-sdk/sandbox-just-bash", () => ({
  createJustBashNetworkSandboxSession: () => {
    sandboxState.created += 1;
    return Promise.resolve({
      destroy: () => {
        sandboxState.destroyed += 1;
        return Promise.resolve();
      },
    });
  },
}));

beforeEach(() => {
  sandboxState.created = 0;
  sandboxState.destroyed = 0;
});

type StreamFactory = (prompt: string, session: FakeHarnessSession) => AsyncIterable<unknown>;

class FakeHarnessSession implements HarnessRuntimeSession {
  readonly prompts: string[] = [];
  readonly #streamFactory: StreamFactory;
  unfinished = false;
  destroyed = false;

  constructor(streamFactory: StreamFactory) {
    this.#streamFactory = streamFactory;
  }

  hasUnfinishedTurn(): boolean {
    return this.unfinished;
  }

  destroy(): Promise<void> {
    this.destroyed = true;
    return Promise.resolve();
  }

  stream(prompt: string): AsyncIterable<unknown> {
    this.prompts.push(prompt);
    return this.#streamFactory(prompt, this);
  }
}

function createFakeHarness(streamFactory: StreamFactory): {
  runtime: HarnessRuntime<FakeHarnessSession>;
  sessions: FakeHarnessSession[];
} {
  const sessions: FakeHarnessSession[] = [];

  const runtime: HarnessRuntime<FakeHarnessSession> = {
    createSession() {
      const session = new FakeHarnessSession(streamFactory);
      sessions.push(session);
      return Promise.resolve(session);
    },
    stream({ session, prompt }) {
      return Promise.resolve({ stream: session.stream(prompt) });
    },
  };

  return { runtime, sessions };
}

async function* streamParts(values: readonly unknown[]): AsyncGenerator<unknown> {
  for (const value of values) {
    yield value;
  }
}

function textTurn(text: string): AsyncGenerator<unknown> {
  return streamParts([
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", text },
    { type: "text-end", id: "text-1" },
    {
      type: "finish",
      finishReason: "stop",
      totalUsage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
    },
  ]);
}

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const collected: AgentEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

test("HarnessAgent satisfies the internal runtime contract", () => {
  expectTypeOf<HarnessAgent>().toMatchTypeOf<HarnessRuntime<HarnessAgentSession>>();
});

test("streams harness text deltas and a finish event", async () => {
  const harness = createFakeHarness(() => textTurn("Hello world"));
  const agent = createHarnessBackedAgent(harness.runtime);
  const session = await agent.createSession();

  try {
    const events = await collect(session.send("Hi"));

    expect(events).toEqual([
      { type: "text-delta", text: "Hello world" },
      {
        type: "finish",
        finishReason: "stop",
        usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
        text: "Hello world",
      },
    ]);
    expect(sandboxState.created).toBe(1);
  } finally {
    await session.close();
  }

  expect(harness.sessions[0]?.prompts).toEqual(["Hi"]);
  expect(sandboxState.destroyed).toBe(1);
});

test("keeps the harness session across turns", async () => {
  const harness = createFakeHarness((prompt) => textTurn(prompt));
  const session = await createHarnessBackedAgent(harness.runtime).createSession();

  try {
    await collect(session.send("first"));
    await collect(session.send("second"));
  } finally {
    await session.close();
  }

  expect(harness.sessions).toHaveLength(1);
  expect(harness.sessions[0]?.prompts).toEqual(["first", "second"]);
});

test("fails when the harness turn is waiting for unsupported input", async () => {
  const harness = createFakeHarness((_prompt, session) => {
    session.unfinished = true;
    return streamParts([
      { type: "text-delta", id: "text-1", text: "partial" },
      { type: "finish", finishReason: "tool-calls", totalUsage: {} },
    ]);
  });
  const session = await createHarnessBackedAgent(harness.runtime).createSession();

  try {
    await expect(collect(session.send("run a tool"))).rejects.toMatchObject({
      code: "turn-unfinished",
      name: AgentError.name,
    });
  } finally {
    await session.close();
  }
});

test("close destroys the harness session and the sandbox", async () => {
  const harness = createFakeHarness(() => textTurn("ok"));
  const session = await createHarnessBackedAgent(harness.runtime).createSession();

  await session.close();
  await session.close();

  expect(harness.sessions[0]?.destroyed).toBe(true);
  expect(sandboxState.destroyed).toBe(1);
  expect(harness.sessions[0]?.prompts).toEqual([]);

  await expect(collect(session.send("hello"))).rejects.toMatchObject({
    code: "session-closed",
    name: AgentError.name,
  });
});

test("rejects session instructions before creating a sandbox", async () => {
  const harness = createFakeHarness(() => textTurn("ok"));
  const agent = createHarnessBackedAgent(harness.runtime);

  await expect(agent.createSession({ instructions: "be brief" })).rejects.toMatchObject({
    code: "option-unsupported",
    name: AgentError.name,
  });
  expect(sandboxState.created).toBe(0);
  expect(harness.sessions).toHaveLength(0);
});

test("destroys the sandbox when harness session creation fails", async () => {
  const failingRuntime: HarnessRuntime<HarnessRuntimeSession> = {
    createSession() {
      return Promise.reject(new Error("harness session failed"));
    },
    stream() {
      return Promise.reject(new Error("unused"));
    },
  };

  const agent = createHarnessBackedAgent(failingRuntime);

  await expect(agent.createSession()).rejects.toThrow("harness session failed");
  expect(sandboxState.created).toBe(1);
  expect(sandboxState.destroyed).toBe(1);
});

test("rejects a second turn while the first turn is running", async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const harness = createFakeHarness(() =>
    (async function* () {
      yield { type: "text-delta", id: "text-1", text: "partial" };
      await gate;
      yield { type: "finish", finishReason: "stop", totalUsage: {} };
    })(),
  );
  const session = await createHarnessBackedAgent(harness.runtime).createSession();
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
